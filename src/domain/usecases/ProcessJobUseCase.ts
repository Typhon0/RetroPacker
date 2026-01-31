/**
 * Use Case - Process Job
 * Business logic for processing a single job.
 *
 * Single Responsibility: Only handles job processing orchestration.
 *
 * @module domain/usecases/ProcessJobUseCase
 */

import { JobProps } from "../entities/Job";
import { WorkflowType } from "../types/workflow.types";
import {
	CompressionPreset,
	ChdSettings,
	DolphinSettings,
	getCompressionLevel,
} from "../types/settings.types";
import { isNintendoSystem } from "../types/platform.types";
import {
	ICommandExecutor,
	CommandCallbacks,
} from "../repositories/ICommandExecutor";
import { IJobRepository } from "../repositories/IJobRepository";
import { INotificationService } from "../repositories/INotificationService";
import { IFileSystemRepository } from "../repositories/IFileSystemRepository";
import { ProcessRegistry } from "@/services/ProcessRegistry";

/**
 * Dependencies for ProcessJobUseCase.
 */
export interface ProcessJobDependencies {
	readonly commandExecutor: ICommandExecutor;
	readonly jobRepository: IJobRepository;
	readonly notificationService: INotificationService;
	readonly fileSystem: IFileSystemRepository;
}

/**
 * Settings context for job processing.
 */
export interface ProcessJobSettings {
	readonly preset: CompressionPreset;
	readonly customCompression: string;
	readonly chd: ChdSettings;
	readonly dolphin: DolphinSettings;
}

/**
 * Use Case: Process Job
 *
 * Orchestrates the processing of a single job using the appropriate tool
 * (chdman or DolphinTool) based on the detected system.
 */
export class ProcessJobUseCase {
	// Static lock to prevent double-spawning the same job
	private static readonly spawnLock = new Set<string>();

	constructor(private readonly deps: ProcessJobDependencies) {}

	/**
	 * Execute the job processing.
	 *
	 * @param job - Job to process
	 * @param outputDir - Output directory for processed files
	 * @param workflow - Workflow type (compress, extract, verify, info)
	 * @param settings - Current application settings
	 */
	async execute(
		job: JobProps,
		outputDir: string,
		workflow: WorkflowType,
		settings: ProcessJobSettings,
	): Promise<void> {
		const lockKey = `${workflow}:${job.id}`;

		// Check if workflow is being cancelled - bail out early
		if (ProcessRegistry.isWorkflowCancelled(workflow)) {
			console.log(
				`[ProcessJobUseCase] Workflow ${workflow} is cancelled, skipping job ${job.id}`,
			);
			return;
		}

		// Prevent double-spawning: check if this job is already being started
		if (ProcessJobUseCase.spawnLock.has(lockKey)) {
			console.warn(
				`[ProcessJobUseCase] Job ${lockKey} already starting, skipping duplicate`,
			);
			return;
		}
		ProcessJobUseCase.spawnLock.add(lockKey);

		const { commandExecutor, jobRepository, notificationService } = this.deps;

		// Mark job as processing
		jobRepository.updateJob(workflow, job.id, {
			status: "processing",
			progress: 0,
			errorMessage: undefined,
			startTime: Date.now(),
		});

		// Determine which tool to use
		const usesDolphin = this.shouldUseDolphin(job);
		const binary = usesDolphin ? "DolphinTool" : "chdman";

		// Build command arguments
		const args = await this.buildCommandArgs(
			job,
			outputDir,
			workflow,
			settings,
			usesDolphin,
		);

		jobRepository.appendLog(
			workflow,
			job.id,
			`Starting: ${binary} ${args.join(" ")}`,
		);

		// Set up progress simulation for DolphinTool (doesn't output progress)
		let progressInterval: ReturnType<typeof setInterval> | undefined;
		if (usesDolphin) {
			progressInterval = this.startProgressSimulation(
				job,
				workflow,
				jobRepository,
			);
		}

		const callbacks: CommandCallbacks = {
			onStdout: (line) => {
				jobRepository.appendLog(workflow, job.id, line);
				if (!usesDolphin) {
					this.parseProgress(line, job, workflow, jobRepository);
				} else if (workflow === "info") {
					this.parseDolphinInfo(line, job, workflow, jobRepository);
				}
			},
			onStderr: (line) => {
				jobRepository.appendLog(workflow, job.id, `[stderr] ${line}`);
				if (!usesDolphin) {
					this.parseProgress(line, job, workflow, jobRepository);
				}
			},
			onClose: async (result) => {
				ProcessRegistry.unregister(workflow, job.id);
				ProcessJobUseCase.spawnLock.delete(lockKey);
				if (progressInterval) {
					clearInterval(progressInterval);
				}

				// Check if job was cancelled by user
				const wasCancelled = ProcessRegistry.wasCancelled(workflow, job.id);
				ProcessRegistry.clearCancelled(workflow, job.id);

				if (result.code === 0) {
					jobRepository.updateJob(workflow, job.id, {
						status: "completed",
						progress: 100,
						etaSeconds: 0,
					});
					await notificationService.notifySuccess(
						`${this.getWorkflowLabel(workflow)} Completed`,
						`${job.filename} has finished processing.`,
					);
				} else if (wasCancelled || result.signal !== null) {
					// Process was cancelled
					jobRepository.updateJob(workflow, job.id, {
						status: "failed",
						errorMessage: "Cancelled",
					});
				} else {
					jobRepository.updateJob(workflow, job.id, {
						status: "failed",
						errorMessage: `Exited with code ${result.code}`,
					});
					await notificationService.notifyFailure(
						`${this.getWorkflowLabel(workflow)} Failed`,
						`${job.filename} failed to process.`,
					);
				}
			},
			onError: async (error) => {
				ProcessRegistry.unregister(workflow, job.id);
				ProcessJobUseCase.spawnLock.delete(lockKey);
				if (progressInterval) {
					clearInterval(progressInterval);
				}
				jobRepository.appendLog(workflow, job.id, `Error: ${error.message}`);
				jobRepository.updateJob(workflow, job.id, {
					status: "failed",
					errorMessage: error.message,
				});
				await notificationService.notifyFailure(
					`${this.getWorkflowLabel(workflow)} Failed`,
					`${job.filename}: ${error.message}`,
				);
			},
		};

		try {
			const process = await commandExecutor.spawn(binary, args, callbacks);
			jobRepository.appendLog(workflow, job.id, `PID: ${process.pid}`);
			ProcessRegistry.register(workflow, job.id, process);
		} catch (e) {
			ProcessJobUseCase.spawnLock.delete(lockKey);
			if (progressInterval) {
				clearInterval(progressInterval);
			}
			const errorMessage =
				e instanceof Error ? e.message : "Failed to spawn process";
			jobRepository.updateJob(workflow, job.id, {
				status: "failed",
				errorMessage,
			});
			jobRepository.appendLog(workflow, job.id, `Exception: ${errorMessage}`);
		}
	}

	/**
	 * Determine if job should use DolphinTool based on system/platform.
	 */
	private shouldUseDolphin(job: JobProps): boolean {
		const system = job.system?.toLowerCase() ?? "";
		const override = job.platformOverride?.toLowerCase() ?? "";

		// Trust detected system first
		if (isNintendoSystem(system)) {
			return true;
		}

		// Check override
		if (override === "gamecube" || override === "wii") {
			return true;
		}

		// Check file extension
		const ext = job.path.split(".").pop()?.toLowerCase();
		if (ext && ["gcm", "wbfs", "rvz", "gcz"].includes(ext)) {
			return true;
		}

		return false;
	}

	/**
	 * Build command arguments based on workflow and tool.
	 */
	private async buildCommandArgs(
		job: JobProps,
		outputDir: string,
		workflow: WorkflowType,
		settings: ProcessJobSettings,
		usesDolphin: boolean,
	): Promise<string[]> {
		if (usesDolphin) {
			return this.buildDolphinArgs(job, outputDir, workflow, settings);
		}
		return this.buildChdmanArgs(job, outputDir, workflow, settings);
	}

	/**
	 * Build chdman command arguments.
	 */
	private async buildChdmanArgs(
		job: JobProps,
		outputDir: string,
		workflow: WorkflowType,
		settings: ProcessJobSettings,
	): Promise<string[]> {
		const { fileSystem } = this.deps;
		const { preset, customCompression, chd } = settings;

		let args: string[] = [];

		if (workflow === "compress") {
			const outputPath = await fileSystem.joinPath(
				outputDir,
				`${job.filename}.chd`,
			);
			args = [job.strategy, "-i", job.path, "-o", outputPath];

			// Compression args
			const compressionArgs = this.getChdCompressionArgs(
				preset,
				customCompression,
			);
			args.push(...compressionArgs);

			// Hunk size
			if (chd.hunkSize) {
				args.push("-hs", chd.hunkSize.toString());
			} else if (
				job.system === "PS2" ||
				job.filename.toLowerCase().endsWith(".iso")
			) {
				args.push("-hs", "2048");
			}

			args.push("-f"); // Force overwrite
		} else if (workflow === "extract") {
			const extractStrategy =
				job.strategy === "createdvd" ? "extractdvd" : "extractcd";

			if (extractStrategy === "extractdvd") {
				const outputPath = await fileSystem.joinPath(
					outputDir,
					`${job.filename}.iso`,
				);
				args = [extractStrategy, "-i", job.path, "-o", outputPath, "-f"];
			} else {
				const outputCue = await fileSystem.joinPath(
					outputDir,
					`${job.filename}.cue`,
				);
				const outputBin = await fileSystem.joinPath(
					outputDir,
					`${job.filename}.bin`,
				);
				args = [
					"extractcd",
					"-i",
					job.path,
					"-o",
					outputCue,
					"-ob",
					outputBin,
					"-f",
				];
			}
		} else if (workflow === "verify") {
			args = ["verify", "-i", job.path];
		} else if (workflow === "info") {
			args = ["info", "-i", job.path];
		}

		return args;
	}

	/**
	 * Build DolphinTool command arguments.
	 */
	private async buildDolphinArgs(
		job: JobProps,
		outputDir: string,
		workflow: WorkflowType,
		settings: ProcessJobSettings,
	): Promise<string[]> {
		const { fileSystem } = this.deps;
		const { preset, dolphin } = settings;
		const level = getCompressionLevel(preset);

		// User dir for temp files
		const userDir = await fileSystem.joinPath(outputDir, ".retropacker_temp");
		const baseArgs = (cmd: string) => [cmd, "-u", userDir];

		let args: string[] = [];

		if (workflow === "compress") {
			const ext =
				dolphin.format === "iso"
					? "iso"
					: dolphin.format === "gcz"
						? "gcz"
						: "rvz";
			const baseName = job.filename.replace(/\.(iso|gcm|wbfs)$/i, "");
			const outputPath = await fileSystem.joinPath(
				outputDir,
				`${baseName}.${ext}`,
			);

			args = [
				...baseArgs("convert"),
				"-i",
				job.path,
				"-o",
				outputPath,
				"-f",
				dolphin.format,
				"-b",
				dolphin.blockSize.toString(),
			];

			if (dolphin.scrub) {
				args.push("-s");
			}

			if (dolphin.format !== "iso" && dolphin.compressionAlgorithm !== "none") {
				args.push("-c", dolphin.compressionAlgorithm, "-l", level.toString());
			}
		} else if (workflow === "extract") {
			const baseName = job.filename.replace(/\.rvz$/i, "");
			const outputPath = await fileSystem.joinPath(
				outputDir,
				`${baseName}.iso`,
			);
			args = [
				...baseArgs("convert"),
				"-i",
				job.path,
				"-o",
				outputPath,
				"-f",
				"iso",
			];
		} else if (workflow === "verify") {
			args = [
				...baseArgs("verify"),
				"-i",
				job.path,
				"-a",
				dolphin.verifyAlgorithm,
			];
		} else if (workflow === "info") {
			args = [...baseArgs("header"), "-i", job.path];
		}

		return args;
	}

	/**
	 * Get chdman compression arguments for a preset.
	 */
	private getChdCompressionArgs(
		preset: CompressionPreset,
		customCompression: string,
	): string[] {
		switch (preset) {
			case "balanced":
				return ["-c", "lzma,zlib,huff"];
			case "max":
				return ["-c", "lzma"];
			case "fast":
				return ["-c", "zstd"];
			case "raw":
				return ["-c", "none"];
			case "custom":
				return ["-c", customCompression || "lzma,zlib,huff"];
			default:
				return ["-c", "lzma,zlib,huff"];
		}
	}

	/**
	 * Parse progress from chdman output.
	 */
	private parseProgress(
		line: string,
		job: JobProps,
		workflow: WorkflowType,
		jobRepository: IJobRepository,
	): void {
		const match = line.match(
			/(?:Compressing|Extracting|Processing),\s+(\d+\.?\d*)%\s+complete/,
		);
		if (match) {
			const percentage = parseFloat(match[1]);
			const currentJob = jobRepository.getJob(workflow, job.id);
			const startTime = currentJob?.startTime;

			let etaSeconds: number | undefined;
			if (startTime && percentage > 0) {
				const elapsedSeconds = (Date.now() - startTime) / 1000;
				const totalEst = (elapsedSeconds / percentage) * 100;
				etaSeconds = Math.max(0, totalEst - elapsedSeconds);
			}

			jobRepository.updateJob(workflow, job.id, {
				progress: percentage,
				etaSeconds,
			});
		}
	}

	/**
	 * Parse metadata from DolphinTool header/info output.
	 */
	private parseDolphinInfo(
		line: string,
		job: JobProps,
		workflow: WorkflowType,
		jobRepository: IJobRepository,
	): void {
		const lineTrimmed = line.trim();
		// Use a mutable type for updates to avoid readonly errors
		type MutableJobUpdate = { -readonly [P in keyof JobProps]?: JobProps[P] };
		const updates: MutableJobUpdate = {};

		// Parse Standard DolphinTool Header Output
		// Format: "Key: Value"

		if (lineTrimmed.startsWith("Game ID:")) {
			updates.gameId = lineTrimmed.split(":")[1].trim();
		} else if (lineTrimmed.startsWith("Internal Name:")) {
			updates.gameTitle = lineTrimmed.split(":")[1].trim();
		} else if (lineTrimmed.startsWith("Region:")) {
			updates.region = lineTrimmed.split(":")[1].trim();
		} else if (lineTrimmed.startsWith("Country:")) {
			// Country is often more specific than Region, but we can store it or ignore for now
			// If Region is missing, maybe use Country?
			// updates.country = ... (not in JobProps yet)
		} else if (lineTrimmed.startsWith("Revision:")) {
			// updates.revision = ...
		}

		if (Object.keys(updates).length > 0) {
			jobRepository.updateJob(workflow, job.id, updates);
		}
	}

	/**
	 * Start simulated progress for DolphinTool.
	 */
	private startProgressSimulation(
		job: JobProps,
		workflow: WorkflowType,
		jobRepository: IJobRepository,
	): ReturnType<typeof setInterval> {
		const mbSize = job.originalSize / (1024 * 1024);
		const estSeconds = Math.max(10, mbSize / 4); // 4MB/s estimate
		const incrementPerSec = 100 / estSeconds;

		return setInterval(() => {
			const currentJob = jobRepository.getJob(workflow, job.id);
			if (!currentJob || currentJob.status !== "processing") {
				return;
			}

			const newProgress = Math.min(
				99,
				currentJob.progress + incrementPerSec / 2,
			);
			if (newProgress > currentJob.progress) {
				jobRepository.updateJob(workflow, job.id, {
					progress: newProgress,
					etaSeconds: Math.max(
						0,
						estSeconds - (newProgress / 100) * estSeconds,
					),
				});
			}
		}, 500);
	}

	/**
	 * Get human-readable label for workflow.
	 */
	private getWorkflowLabel(workflow: WorkflowType): string {
		switch (workflow) {
			case "compress":
				return "Compression";
			case "extract":
				return "Extraction";
			case "verify":
				return "Verification";
			case "info":
				return "Info";
			default:
				return "";
		}
	}
}
