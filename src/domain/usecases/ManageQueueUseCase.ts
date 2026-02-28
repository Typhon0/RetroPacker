import { v4 as uuidv4 } from "uuid";
import type { JobProps } from "../entities/Job";
import type { IFileSystemRepository } from "../repositories/IFileSystemRepository";
import type { IJobRepository } from "../repositories/IJobRepository";
import type {
	CompressionStrategy,
	WorkflowType,
} from "../types/workflow.types";
import type { DetectSystemUseCase } from "./DetectSystemUseCase";

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

export type QueueAddSkipReason =
	| "invalid_extension"
	| "unsupported_archive"
	| "unsupported_content";

export interface QueueAddResult {
	readonly added: boolean;
	readonly filePath: string;
	readonly filename: string;
	readonly reason?: QueueAddSkipReason;
	readonly message?: string;
}

export interface QueueAddProgress {
	readonly phase: "scanning" | "analyzing";
	readonly scannedDirectories?: number;
	readonly pendingDirectories?: number;
	readonly discoveredFiles?: number;
	readonly analyzedFiles?: number;
	readonly totalFiles?: number;
	readonly currentPath?: string;
}

export type QueueAddProgressCallback = (progress: QueueAddProgress) => void;

interface BuildJobResult {
	readonly job?: JobProps;
	readonly reason?: QueueAddSkipReason;
	readonly message?: string;
}

const ARCHIVE_EXTENSIONS = new Set(["zip", "7z", "rar"]);
export const UNSUPPORTED_ARCHIVE_MESSAGE =
	"Unsupported: Please extract archives first.";
export const UNSUPPORTED_PS3_EXECUTABLE_MESSAGE =
	"Unsupported: PS3 executable detected (EBOOT.BIN). Add a disc image instead.";

/**
 * Workflow file configurations.
 */
export const WORKFLOW_FILE_CONFIGS: Record<WorkflowType, WorkflowFileConfig> = {
	compress: {
		extensions: [
			"iso",
			"cue",
			"bin",
			"gdi",
			"toc",
			"ccd",
			"img",
			"mdf",
			"wbfs",
			"gcm",
		],
		filterName: "Raw Disc Images",
		dropLabel: "Drop raw disc images to compress",
		supportedText: ".iso, .cue, .bin, .gdi, .img, .mdf, .ccd, .gcm",
	},
	extract: {
		extensions: ["chd", "rvz", "gcz", "wbfs", "wia"],
		filterName: "Compressed Archives",
		dropLabel: "Drop compressed files to extract",
		supportedText: ".chd, .rvz, .gcz, .wbfs, .wia",
	},
	verify: {
		extensions: ["chd", "rvz", "gcz", "wbfs", "gcm", "wia"],
		filterName: "Compressed Files",
		dropLabel: "Drop files to verify integrity",
		supportedText: ".chd, .rvz, .gcz, .wbfs, .gcm, .wia",
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
	): Promise<QueueAddResult> {
		const result = await this.buildJob(workflow, filePath, filename, size);
		if (!result.job) {
			return {
				added: false,
				filePath,
				filename,
				reason: result.reason,
				message: result.message,
			};
		}

		this.deps.jobRepository.addJob(workflow, result.job);
		return { added: true, filePath, filename };
	}

	/**
	 * Add multiple files to the queue.
	 *
	 * @param workflow - Target workflow
	 * @param paths - Array of file paths
	 */
	async addFiles(
		workflow: WorkflowType,
		paths: string[],
		onProgress?: QueueAddProgressCallback,
	): Promise<QueueAddResult[]> {
		const { fileSystem, jobRepository } = this.deps;
		let analyzedFiles = 0;
		if (onProgress) {
			onProgress({
				phase: "analyzing",
				discoveredFiles: paths.length,
				analyzedFiles: 0,
				totalFiles: paths.length,
			});
		}
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

				const built = await this.buildJob(workflow, filePath, name, size);
				analyzedFiles += 1;
				onProgress?.({
					phase: "analyzing",
					discoveredFiles: paths.length,
					analyzedFiles,
					totalFiles: paths.length,
					currentPath: filePath,
				});

				return built;
			},
		);

		const results: QueueAddResult[] = [];
		for (let index = 0; index < jobs.length; index++) {
			const result = jobs[index];
			const filePath = paths[index];
			const filename = filePath.split(/[\\/]/).pop() ?? "unknown";

			if (result.job) {
				jobRepository.addJob(workflow, result.job);
				results.push({ added: true, filePath, filename });
				continue;
			}

			results.push({
				added: false,
				filePath,
				filename,
				reason: result.reason,
				message: result.message,
			});
		}

		return results;
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
		onProgress?: QueueAddProgressCallback,
	): Promise<QueueAddResult[]> {
		const files = await this.scanFolders(workflow, folderPaths, onProgress);
		return this.addFiles(workflow, files, onProgress);
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
		onProgress?: QueueAddProgressCallback,
	): Promise<string[]> {
		const { fileSystem } = this.deps;
		const config = WORKFLOW_FILE_CONFIGS[workflow];
		const foundFiles: string[] = [];
		const pendingDirectories = [...folderPaths];
		const visited = new Set<string>();
		let scannedDirectories = 0;

		const emitScanProgress = (currentPath?: string): void => {
			onProgress?.({
				phase: "scanning",
				scannedDirectories,
				pendingDirectories: pendingDirectories.length,
				discoveredFiles: foundFiles.length,
				currentPath,
			});
		};

		emitScanProgress();

		const worker = async (): Promise<void> => {
			while (true) {
				const directory = pendingDirectories.shift();
				if (!directory) return;
				if (visited.has(directory)) continue;
				visited.add(directory);
				scannedDirectories += 1;
				emitScanProgress(directory);

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
						if (
							ext &&
							(config.extensions.includes(ext) || ARCHIVE_EXTENSIONS.has(ext))
						) {
							foundFiles.push(resolved.path);
						}
					}
					emitScanProgress(directory);
				} catch (e) {
					console.warn(`Failed to read dir ${directory}`, e);
					emitScanProgress(directory);
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
	): Promise<BuildJobResult> {
		const { detectSystem } = this.deps;
		const config = WORKFLOW_FILE_CONFIGS[workflow];

		const ext = filePath.split(".").pop()?.toLowerCase();
		if (ext && ARCHIVE_EXTENSIONS.has(ext)) {
			return {
				reason: "unsupported_archive",
				message: UNSUPPORTED_ARCHIVE_MESSAGE,
			};
		}

		if (!ext || !config.extensions.includes(ext)) {
			console.warn(`File ${filename} not valid for ${workflow} workflow`);
			return { reason: "invalid_extension" };
		}

		const system = await detectSystem.execute(filePath);
		if (system === "Unsupported") {
			return {
				reason: "unsupported_content",
				message: UNSUPPORTED_PS3_EXECUTABLE_MESSAGE,
			};
		}

		const strategy = this.getStrategy(filePath, system);
		const discInfo = this.extractDiscInfo(filename);

		return {
			job: {
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
			},
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
	private getStrategy(filePath: string, system?: string): CompressionStrategy {
		const ext = filePath.split(".").pop()?.toLowerCase();

		// CD-based platforms always use createcd
		const lowerSystem = system?.toLowerCase() ?? "";
		if (
			lowerSystem === "ps1" ||
			lowerSystem === "saturn" ||
			lowerSystem === "dreamcast" ||
			lowerSystem === "segacd"
		) {
			return "createcd";
		}

		switch (ext) {
			case "iso":
			case "img":
			case "mdf":
				return "createdvd";
			case "cue":
			case "toc":
			case "gdi":
			case "ccd":
				return "createcd";
			default:
				return "createcd";
		}
	}
}
