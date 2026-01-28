/**
 * Use Case - Manage Queue
 * Business logic for managing job queues.
 *
 * Single Responsibility: Only handles queue management.
 *
 * @module domain/usecases/ManageQueueUseCase
 */

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
		extensions: ["chd", "rvz", "cso", "gcz"],
		filterName: "Compressed Archives",
		dropLabel: "Drop compressed files to extract",
		supportedText: ".chd, .rvz, .cso, .gcz",
	},
	verify: {
		extensions: ["chd", "rvz", "nsz", "xcz"],
		filterName: "Compressed Files",
		dropLabel: "Drop files to verify integrity",
		supportedText: ".chd, .rvz, .nsz",
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
		const { jobRepository, detectSystem } = this.deps;
		const config = WORKFLOW_FILE_CONFIGS[workflow];

		// Validate extension
		const ext = filePath.split(".").pop()?.toLowerCase();
		if (!ext || !config.extensions.includes(ext)) {
			console.warn(`File ${filename} not valid for ${workflow} workflow`);
			return;
		}

		// Detect system and strategy
		const system = await detectSystem.execute(filePath);
		const strategy = this.getStrategy(filePath);
		const discInfo = this.extractDiscInfo(filename);

		const job: JobProps = {
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

		jobRepository.addJob(workflow, job);
	}

	/**
	 * Add multiple files to the queue.
	 *
	 * @param workflow - Target workflow
	 * @param paths - Array of file paths
	 */
	async addFiles(workflow: WorkflowType, paths: string[]): Promise<void> {
		const { fileSystem } = this.deps;

		for (const filePath of paths) {
			const name = filePath.split(/[\\/]/).pop() ?? "unknown";
			let size = 0;

			try {
				const info = await fileSystem.getFileInfo(filePath);
				size = info.size;
			} catch (e) {
				console.warn(`Failed to stat file ${filePath}, assuming size 0`, e);
			}

			await this.addFile(workflow, filePath, name, size);
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
		console.log(`Found ${files.length} valid files for ${workflow}`);
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

		const scanDir = async (path: string): Promise<void> => {
			try {
				const entries = await fileSystem.readDirectory(path);
				for (const entry of entries) {
					const entryPath = await fileSystem.joinPath(path, entry.name);

					if (entry.isDirectory) {
						await scanDir(entryPath);
					} else if (entry.isFile) {
						const ext = entry.name.split(".").pop()?.toLowerCase();
						if (ext && config.extensions.includes(ext)) {
							foundFiles.push(entryPath);
						}
					}
				}
			} catch (e) {
				console.warn(`Failed to read dir ${path}`, e);
			}
		};

		for (const dir of folderPaths) {
			await scanDir(dir);
		}

		return foundFiles;
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
