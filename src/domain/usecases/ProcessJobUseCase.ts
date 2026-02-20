import { JobState } from "../entities/JobState";
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
import { INotificationService } from "../repositories/INotificationService";
import { IFileSystemRepository } from "../repositories/IFileSystemRepository";
import { ProcessRegistry } from "@/services/ProcessRegistry";

/**
 * Dependencies for ProcessJobUseCase.
 */
export interface ProcessJobDependencies {
	readonly commandExecutor: ICommandExecutor;
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
	readonly deleteSourceAfterSuccess: boolean;
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
	private static readonly MIN_PROGRESS_DELTA_PERCENT = 0.25;
	private static readonly PROGRESS_UPDATE_MIN_INTERVAL_MS = 150;

	constructor(private readonly deps: ProcessJobDependencies) { }

	/**
	 * Execute the job processing.
	 *
	 * @param job - Job to process
	 * @param outputDir - Output directory for processed files
	 * @param workflow - Workflow type (compress, extract, verify, info)
	 * @param settings - Current application settings
	 */
	async execute(
		job: JobState,
		outputDir: string,
		workflow: WorkflowType,
		settings: ProcessJobSettings,
	): Promise<void> {
		const lockKey = `${workflow}:${job.id}`;
		const ext = job.path.split(".").pop()?.toLowerCase() ?? "";
		const isCancelledBeforeStart = (): boolean => {
			return (
				ProcessRegistry.isWorkflowCancelled(workflow) ||
				ProcessRegistry.wasCancelled(workflow, job.id)
			);
		};

		// Check cancellation strictly before any side effects.
		if (isCancelledBeforeStart()) {
			console.log(
				`[ProcessJobUseCase] Workflow ${workflow} or job ${job.id} is cancelled, skipping`,
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

		const { commandExecutor } = this.deps;
		let progressInterval: ReturnType<typeof setInterval> | undefined;
		let cleanupOwnedByCallbacks = false;
		let hasCleanedUp = false;
		let terminalCallbackHandled = false;

		const beginTerminalCallback = (): boolean => {
			if (terminalCallbackHandled) return false;
			terminalCallbackHandled = true;
			return true;
		};

		const cleanup = (): void => {
			if (hasCleanedUp) return;
			hasCleanedUp = true;
			ProcessRegistry.unregister(workflow, job.id);
			ProcessJobUseCase.spawnLock.delete(lockKey);
			if (progressInterval) {
				clearInterval(progressInterval);
				progressInterval = undefined;
			}
		};

		try {
			// Re-check after locking and before mutating job state.
			if (isCancelledBeforeStart()) {
				console.log(
					`[ProcessJobUseCase] Job ${lockKey} was cancelled before start, skipping`,
				);
				return;
			}

			// Mark job as processing
			job.setStatus("processing");
			job.updateProgress(0);
			job.setErrorMessage(undefined);
			job.setStartTime(Date.now());
			job.setEtaSeconds(undefined);
			job.setCompressionRatio(undefined);
			const emitProgress = this.createProgressEmitter(job);

			// Determine which tool to use
			const usesDolphin = this.shouldUseDolphin(job);
			this.validateWorkflowSupport(workflow, ext, usesDolphin);
			const binary = usesDolphin ? "DolphinTool" : "chdman";

			// Build command arguments
			const args = await this.buildCommandArgs(
				job,
				outputDir,
				workflow,
				settings,
				usesDolphin,
			);

			job.appendLog(`Starting: ${binary} ${args.join(" ")}`);

			// Set up progress simulation for DolphinTool (doesn't output progress)
			if (usesDolphin) {
				progressInterval = this.startProgressSimulation(job, emitProgress);
			}

			const callbacks: CommandCallbacks = {
				onStdout: (line) => {
					job.appendLog(line);
					if (!usesDolphin) {
						this.parseProgress(line, job, emitProgress);
					} else if (workflow === "info") {
						this.parseDolphinInfo(line, job);
					}
				},
				onStderr: (line) => {
					job.appendLog(`[stderr] ${line}`);
					if (!usesDolphin) {
						this.parseProgress(line, job, emitProgress);
					}
				},
				onClose: (result) => {
					void (async () => {
						try {
							if (!beginTerminalCallback()) {
								return;
							}

							// Check if job was cancelled by user
							const wasCancelled = ProcessRegistry.wasCancelled(workflow, job.id);
							ProcessRegistry.clearCancelled(workflow, job.id);

							if (result.code === 0) {
								job.setStatus("completed");
								job.setErrorMessage(undefined);
								job.updateProgress(100, 0);

								// Delete source file if setting is enabled (compress/extract only)
								if (
									settings.deleteSourceAfterSuccess &&
									(workflow === "compress" || workflow === "extract")
								) {
									try {
										const moved = await this.deps.fileSystem.moveToTrash(job.path);
										if (moved) {
											job.appendLog(
												`Source file moved to recycle bin: ${job.filename}`,
											);
										} else {
											job.appendLog(
												`Warning: Failed to move source file to recycle bin: ${job.filename}`,
											);
										}
									} catch (err) {
										const msg = err instanceof Error ? err.message : String(err);
										job.appendLog(
											`Warning: Failed to delete source file: ${msg}`,
										);
									}
								}
							} else if (wasCancelled || result.signal !== null) {
								// Process was cancelled
								job.setStatus("failed");
								job.setErrorMessage("Cancelled");
							} else {
								job.setStatus("failed");
								job.setErrorMessage(`Exited with code ${result.code}`);
							}
						} catch (error) {
							console.error(
								`[ProcessJobUseCase] onClose handler failed for ${lockKey}:`,
								error,
							);
						} finally {
							cleanup();
						}
					})();
				},
				onError: (error) => {
					void (async () => {
						try {
							if (!beginTerminalCallback()) {
								return;
							}

							const wasCancelled = ProcessRegistry.wasCancelled(workflow, job.id);
							ProcessRegistry.clearCancelled(workflow, job.id);

							if (wasCancelled) {
								job.appendLog("Error: Process cancelled before completion");
								job.setStatus("failed");
								job.setErrorMessage("Cancelled");
								return;
							}

							job.appendLog(`Error: ${error.message}`);
							job.setStatus("failed");
							job.setErrorMessage(error.message);
						} catch (handlerError) {
							console.error(
								`[ProcessJobUseCase] onError handler failed for ${lockKey}:`,
								handlerError,
							);
						} finally {
							cleanup();
						}
					})();
				},
			};

			const process = await commandExecutor.spawn(binary, args, callbacks);
			job.appendLog(`PID: ${process.pid}`);
			ProcessRegistry.register(workflow, job.id, process);
			cleanupOwnedByCallbacks = true;
		} catch (e) {
			const wasCancelled = ProcessRegistry.wasCancelled(workflow, job.id);
			if (wasCancelled) {
				ProcessRegistry.clearCancelled(workflow, job.id);
				job.setStatus("failed");
				job.setErrorMessage("Cancelled");
				job.appendLog("Cancelled before process start");
				return;
			}

			const errorMessage =
				e instanceof Error ? e.message : "Failed to spawn process";
			job.setStatus("failed");
			job.setErrorMessage(errorMessage);
			job.appendLog(`Exception: ${errorMessage}`);
		} finally {
			if (!cleanupOwnedByCallbacks) {
				cleanup();
			}
		}
	}

	/**
	 * Determine if job should use DolphinTool based on system/platform.
	 */
	private shouldUseDolphin(job: JobState): boolean {
		const system = job.system.value?.toLowerCase() ?? "";
		const override = job.platformOverride.value?.toLowerCase() ?? "";

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
		job: JobState,
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
		job: JobState,
		outputDir: string,
		workflow: WorkflowType,
		settings: ProcessJobSettings,
	): Promise<string[]> {
		const { fileSystem } = this.deps;
		const { preset, customCompression, chd } = settings;
		const outputBaseName = this.getOutputBaseName(job.filename);
		const sourceExt = job.path.split(".").pop()?.toLowerCase() ?? "";

		let args: string[] = [];

		if (workflow === "compress") {
			const outputPath = await fileSystem.joinPath(
				outputDir,
				`${outputBaseName}.chd`,
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
			} else if (job.system.value === "PS2" || sourceExt === "iso") {
				args.push("-hs", "2048");
			}

			args.push("-f"); // Force overwrite
		} else if (workflow === "extract") {
			const extractStrategy =
				job.strategy === "createdvd" ? "extractdvd" : "extractcd";

			if (extractStrategy === "extractdvd") {
				const outputPath = await fileSystem.joinPath(
					outputDir,
					`${outputBaseName}.iso`,
				);
				args = [extractStrategy, "-i", job.path, "-o", outputPath, "-f"];
			} else {
				const outputCue = await fileSystem.joinPath(
					outputDir,
					`${outputBaseName}.cue`,
				);
				const outputBin = await fileSystem.joinPath(
					outputDir,
					`${outputBaseName}.bin`,
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
		job: JobState,
		outputDir: string,
		workflow: WorkflowType,
		settings: ProcessJobSettings,
	): Promise<string[]> {
		const { fileSystem } = this.deps;
		const { preset, dolphin } = settings;
		const level = getCompressionLevel(preset);
		const outputBaseName = this.getOutputBaseName(job.filename);

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
			const outputPath = await fileSystem.joinPath(
				outputDir,
				`${outputBaseName}.${ext}`,
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
			const outputPath = await fileSystem.joinPath(
				outputDir,
				`${outputBaseName}.iso`,
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
	 * Normalize output base name by stripping only the final extension.
	 * Examples:
	 *  - game.iso -> game
	 *  - game.chd -> game
	 *  - game -> game
	 */
	private getOutputBaseName(filename: string): string {
		const lastDot = filename.lastIndexOf(".");
		if (lastDot <= 0) {
			return filename;
		}
		return filename.slice(0, lastDot);
	}

	/**
	 * Validate that a workflow is supported for the given file format/tool routing.
	 */
	private validateWorkflowSupport(
		workflow: WorkflowType,
		ext: string,
		usesDolphin: boolean,
	): void {
		if (workflow === "extract") {
			const supported = usesDolphin
				? ["rvz", "gcz", "wbfs", "wia"]
				: ["chd"];
			if (!supported.includes(ext)) {
				throw new Error(
					`Unsupported extract input format: .${ext || "unknown"}`,
				);
			}
		}

		if (workflow === "verify") {
			const supported = usesDolphin
				? ["rvz", "gcz", "wbfs", "gcm"]
				: ["chd"];
			if (!supported.includes(ext)) {
				throw new Error(`Unsupported verify input format: .${ext || "unknown"}`);
			}
		}
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
		job: JobState,
		emitProgress: (progress: number, etaSeconds?: number) => void,
	): void {
		const ratioMatch = line.match(/final ratio\s*=\s*(\d+(?:\.\d+)?)%/i);
		if (ratioMatch) {
			const ratio = Number.parseFloat(ratioMatch[1]);
			if (Number.isFinite(ratio)) {
				job.setCompressionRatio(ratio);
			}
		}

		const match = line.match(
			/(?:Compressing|Extracting|Processing),\s+(\d+\.?\d*)%\s+complete/,
		);
		if (match) {
			const percentage = parseFloat(match[1]);
			const startTime = job.startTime.value;

			let etaSeconds: number | undefined;
			if (startTime && percentage > 0) {
				const elapsedSeconds = (Date.now() - startTime) / 1000;
				const totalEst = (elapsedSeconds / percentage) * 100;
				etaSeconds = Math.max(0, totalEst - elapsedSeconds);
			}

			emitProgress(percentage, etaSeconds);
		}
	}

	/**
	 * Parse metadata from DolphinTool header/info output.
	 */
	private parseDolphinInfo(line: string, job: JobState): void {
		const lineTrimmed = line.trim();
		const updates: Partial<{
			gameId: string;
			gameTitle: string;
			region: string;
		}> = {};

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
			// updates.country = ... (not tracked yet)
		} else if (lineTrimmed.startsWith("Revision:")) {
			// updates.revision = ...
		}

		if (Object.keys(updates).length > 0) {
			job.applyUpdates(updates);
		}
	}

	/**
	 * Start simulated progress for DolphinTool.
	 */
	private startProgressSimulation(
		job: JobState,
		emitProgress: (progress: number, etaSeconds?: number) => void,
	): ReturnType<typeof setInterval> {
		const mbSize = job.originalSize / (1024 * 1024);
		const estSeconds = Math.max(10, mbSize / 4); // 4MB/s estimate
		const incrementPerSec = 100 / estSeconds;
		let simulatedProgress = job.progress.value;

		return setInterval(() => {
			if (job.status.value !== "processing") {
				return;
			}

			simulatedProgress = Math.min(99, simulatedProgress + incrementPerSec / 2);
			if (simulatedProgress > job.progress.value) {
				emitProgress(
					simulatedProgress,
					Math.max(0, estSeconds - (simulatedProgress / 100) * estSeconds),
				);
			}
		}, 500);
	}

	private createProgressEmitter(
		job: JobState,
	): (progress: number, etaSeconds?: number, force?: boolean) => void {
		let lastProgress = job.progress.value;
		let lastEmitAt = Date.now();

		return (progress, etaSeconds, force = false) => {
			const clamped = Math.max(0, Math.min(100, progress));
			const nextProgress = force ? clamped : Math.max(clamped, lastProgress);
			const now = Date.now();
			const delta = nextProgress - lastProgress;
			const elapsed = now - lastEmitAt;
			const hasEtaUpdate = etaSeconds !== undefined;

			const shouldEmit =
				force ||
				delta >= ProcessJobUseCase.MIN_PROGRESS_DELTA_PERCENT ||
				elapsed >= ProcessJobUseCase.PROGRESS_UPDATE_MIN_INTERVAL_MS;

			if (!shouldEmit) return;
			if (!force && delta === 0 && !hasEtaUpdate) return;

			job.updateProgress(nextProgress, etaSeconds);
			lastProgress = nextProgress;
			lastEmitAt = now;
		};
	}
}

