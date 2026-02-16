import { JobProps } from "../entities/Job";
import { WorkflowType } from "../types/workflow.types";
import { CompressionStrategy } from "../types/workflow.types";
import { IJobRepository } from "../repositories/IJobRepository";
import { IFileSystemRepository } from "../repositories/IFileSystemRepository";
import { DetectSystemUseCase } from "./DetectSystemUseCase";
import { v4 as uuidv4 } from "uuid";

/**
 * Dependencies for ManageQueueUseCase.
 */
export interface ManageQueueDependencies {
	readonly jobRepository: IJobRepository;
	readonly fileSystem: IFileSystemRepository;
	readonly detectSystem: DetectSystemUseCase;
}

/**
 * File configuration for a workflow.
 */
export interface WorkflowFileConfig {
	readonly extensions: string[];
	readonly filterName: string;
	readonly dropLabel: string;
	readonly supportedText: string;
}

/**
 * Workflow file configurations.
 */
export const WORKFLOW_FILE_CONFIGS: Record<WorkflowType, WorkflowFileConfig> = {
	compress: {
		extensions: ["iso", "cue", "bin", "gdi", "toc", "wbfs", "gcm"],
		filterName: "Raw Disc Images",
		dropLabel: "Drop raw disc images to compress",
		supportedText: ".iso, .cue, .bin, .gdi, .gcm",
	},
	extract: {
		extensions: ["chd", "rvz", "gcz", "wbfs"],
		filterName: "Compressed Archives",
		dropLabel: "Drop compressed files to extract",
		supportedText: ".chd, .rvz, .gcz, .wbfs",
	},
	verify: {
		extensions: ["chd", "rvz", "gcz", "wbfs", "gcm"],
		filterName: "Compressed Files",
		dropLabel: "Drop files to verify integrity",
		supportedText: ".chd, .rvz, .gcz, .wbfs, .gcm",
	},
	info: {
		extensions: [
			"iso",
			"chd",
			"rvz",
			"cue",
			"gdi",
			"wbfs",
			"gcm",
			"nsp",
			"xci",
		],
		filterName: "Game Files",
		dropLabel: "Drop files to read metadata",
		supportedText: "Any supported format",
	},
};

/**
 * Disc info extracted from filename.
 */
interface DiscInfo {
	readonly baseName: string;
	readonly discNumber: number;
}

/**
 * Use Case: Manage Queue
 *
 * Handles adding, removing, and organizing jobs in workflow queues.
 */
export class ManageQueueUseCase {
	private static readonly FILE_ANALYSIS_CONCURRENCY = 6;
	private static readonly DIRECTORY_SCAN_CONCURRENCY = 6;
	private static readonly PATH_RESOLVE_CONCURRENCY = 12;

	// Regex patterns for disc detection
	private static readonly DISC_PATTERNS = [
		/\(Disc\s*(\d+)\)/i,
		/\(CD\s*(\d+)\)/i,
		/\bPart\s*(\d+)\b/i,
		/\bDisc\s*(\d+)\b/i,
		/\bDisk\s*(\d+)\b/i,
		/\s-\s*Disc\s*(\d+)/i,
	];

	constructor(private readonly deps: ManageQueueDependencies) {}

	/**
	 * Add a file to the queue.
	 *
	 * @param workflow - Target workflow
	 * @param filePath - Path to the file
	 * @param filename - File name
	 * @param size - File size in bytes
	 */
	async addFile(
		workflow: WorkflowType,
		filePath: string,
		filename: string,
		size: number,
	): Promise<void> {
		const job = await this.buildJob(workflow, filePath, filename, size);
		if (!job) return;
		this.deps.jobRepository.addJob(workflow, job);
	}

	/**
	 * Add multiple files to the queue.
	 *
	 * @param workflow - Target workflow
	 * @param paths - Array of file paths
	 */
	async addFiles(workflow: WorkflowType, paths: string[]): Promise<void> {
		const { fileSystem, jobRepository } = this.deps;
		const jobs = await this.mapWithConcurrency(
			paths,
			ManageQueueUseCase.FILE_ANALYSIS_CONCURRENCY,
			async (filePath) => {
				const name = filePath.split(/[\\/]/).pop() ?? "unknown";
				let size = 0;

				try {
					const info = await fileSystem.getFileInfo(filePath);
					size = info.size;
				} catch (e) {
					console.warn(`Failed to stat file ${filePath}, assuming size 0`, e);
				}

				return this.buildJob(workflow, filePath, name, size);
			},
		);

		for (const job of jobs) {
			if (job) {
				jobRepository.addJob(workflow, job);
			}
		}
	}

	/**
	 * Add all files from folders recursively.
	 *
	 * @param workflow - Target workflow
	 * @param folderPaths - Array of folder paths
	 */
	async addFolders(
		workflow: WorkflowType,
		folderPaths: string[],
	): Promise<void> {
		const files = await this.scanFolders(workflow, folderPaths);
		await this.addFiles(workflow, files);
	}

	/**
	 * Remove a job from the queue.
	 *
	 * @param workflow - Target workflow
	 * @param jobId - Job ID to remove
	 */
	removeJob(workflow: WorkflowType, jobId: string): void {
		this.deps.jobRepository.removeJob(workflow, jobId);
	}

	/**
	 * Clear all jobs from a queue.
	 *
	 * @param workflow - Target workflow
	 */
	clearQueue(workflow: WorkflowType): void {
		this.deps.jobRepository.clearQueue(workflow);
	}

	/**
	 * Get pending jobs from a queue.
	 *
	 * @param workflow - Target workflow
	 * @returns Array of pending jobs
	 */
	getPendingJobs(workflow: WorkflowType): JobProps[] {
		return this.deps.jobRepository
			.getJobs(workflow)
			.filter((job) => job.status === "pending");
	}

	/**
	 * Get jobs currently processing.
	 *
	 * @param workflow - Target workflow
	 * @returns Array of processing jobs
	 */
	getProcessingJobs(workflow: WorkflowType): JobProps[] {
		return this.deps.jobRepository
			.getJobs(workflow)
			.filter((job) => job.status === "processing");
	}

	/**
	 * Assign disc groups to multi-disc games in queue.
	 *
	 * @param workflow - Target workflow
	 */
	assignDiscGroups(workflow: WorkflowType): void {
		const { jobRepository } = this.deps;
		const jobs = jobRepository.getJobs(workflow);

		// Map: baseName -> jobs[]
		const groups = new Map<string, { job: JobProps; discNumber: number }[]>();

		for (const job of jobs) {
			const discInfo = this.extractDiscInfo(job.filename);
			if (discInfo) {
				const existing = groups.get(discInfo.baseName) ?? [];
				existing.push({ job, discNumber: discInfo.discNumber });
				groups.set(discInfo.baseName, existing);
			}
		}

		// Only mark as groups if 2+ discs share the same base name
		for (const [baseName, groupJobs] of groups) {
			if (groupJobs.length >= 2) {
				for (const { job, discNumber } of groupJobs) {
					jobRepository.updateJob(workflow, job.id, {
						discGroup: baseName,
						discNumber,
					});
				}
			}
		}
	}

	/**
	 * Scan folders recursively for valid files.
	 */
	private async scanFolders(
		workflow: WorkflowType,
		folderPaths: string[],
	): Promise<string[]> {
		const { fileSystem } = this.deps;
		const config = WORKFLOW_FILE_CONFIGS[workflow];
		const foundFiles: string[] = [];
		const pendingDirectories = [...folderPaths];
		const visited = new Set<string>();

		const worker = async (): Promise<void> => {
			while (true) {
				const directory = pendingDirectories.shift();
				if (!directory) return;
				if (visited.has(directory)) continue;
				visited.add(directory);

				try {
					const entries = await fileSystem.readDirectory(directory);
					const resolvedEntries = await this.mapWithConcurrency(
						entries,
						ManageQueueUseCase.PATH_RESOLVE_CONCURRENCY,
						async (entry) => {
							try {
								return {
									entry,
									path: await fileSystem.joinPath(directory, entry.name),
								};
							} catch (e) {
								console.warn(
									`Failed to resolve entry path ${directory}/${entry.name}`,
									e,
								);
								return null;
							}
						},
					);

					for (const resolved of resolvedEntries) {
						if (!resolved) continue;

						if (resolved.entry.isDirectory) {
							pendingDirectories.push(resolved.path);
							continue;
						}

						if (!resolved.entry.isFile) continue;
						const ext = resolved.entry.name.split(".").pop()?.toLowerCase();
						if (ext && config.extensions.includes(ext)) {
							foundFiles.push(resolved.path);
						}
					}
				} catch (e) {
					console.warn(`Failed to read dir ${directory}`, e);
				}
			}
		};

		const workerCount = Math.min(
			ManageQueueUseCase.DIRECTORY_SCAN_CONCURRENCY,
			Math.max(1, pendingDirectories.length),
		);
		await Promise.all(Array.from({ length: workerCount }, () => worker()));

		return foundFiles;
	}

	private async buildJob(
		workflow: WorkflowType,
		filePath: string,
		filename: string,
		size: number,
	): Promise<JobProps | null> {
		const { detectSystem } = this.deps;
		const config = WORKFLOW_FILE_CONFIGS[workflow];

		const ext = filePath.split(".").pop()?.toLowerCase();
		if (!ext || !config.extensions.includes(ext)) {
			console.warn(`File ${filename} not valid for ${workflow} workflow`);
			return null;
		}

		const system = await detectSystem.execute(filePath);
		const strategy = this.getStrategy(filePath);
		const discInfo = this.extractDiscInfo(filename);

		return {
			id: uuidv4(),
			filename,
			path: filePath,
			system,
			status: "pending",
			progress: 0,
			originalSize: size,
			outputLog: [],
			strategy,
			discGroup: discInfo?.baseName,
			discNumber: discInfo?.discNumber,
		};
	}

	private async mapWithConcurrency<T, R>(
		items: readonly T[],
		limit: number,
		mapper: (item: T, index: number) => Promise<R>,
	): Promise<R[]> {
		if (items.length === 0) return [];

		const concurrency = Math.max(1, Math.min(limit, items.length));
		const results = new Array<R>(items.length);
		let nextIndex = 0;

		const worker = async (): Promise<void> => {
			while (true) {
				const index = nextIndex;
				nextIndex += 1;
				if (index >= items.length) return;
				results[index] = await mapper(items[index], index);
			}
		};

		await Promise.all(Array.from({ length: concurrency }, () => worker()));
		return results;
	}

	/**
	 * Extract disc info from filename.
	 */
	private extractDiscInfo(filename: string): DiscInfo | null {
		for (const pattern of ManageQueueUseCase.DISC_PATTERNS) {
			const match = filename.match(pattern);
			if (match) {
				const discNumber = parseInt(match[1], 10);
				const baseName = filename
					.replace(pattern, "")
					.replace(/\s+/g, " ")
					.trim();
				return { baseName, discNumber };
			}
		}
		return null;
	}

	/**
	 * Get compression strategy from file path.
	 */
	private getStrategy(filePath: string): CompressionStrategy {
		const ext = filePath.split(".").pop()?.toLowerCase();
		switch (ext) {
			case "iso":
				return "createdvd";
			case "cue":
			case "toc":
			case "gdi":
				return "createcd";
			default:
				return "createcd";
		}
	}
}

