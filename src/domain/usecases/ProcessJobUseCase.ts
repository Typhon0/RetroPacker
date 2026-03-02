import { invoke } from "@tauri-apps/api/core";
import { CueProcessorService } from "@/services/CueProcessorService";
import { ProcessRegistry } from "@/services/ProcessRegistry";
import type { JobState } from "../entities/JobState";
import type {
	CommandCallbacks,
	ICommandExecutor,
} from "../repositories/ICommandExecutor";
import type { IFileSystemRepository } from "../repositories/IFileSystemRepository";
import type { INotificationService } from "../repositories/INotificationService";
import {
	isDvdSystem,
	isNintendoPlatform,
	isNintendoSystem,
} from "../types/platform.types";
import {
	type ChdSettings,
	type CompressionPreset,
	type DolphinSettings,
	getCompressionLevel,
} from "../types/settings.types";
import type { WorkflowType } from "../types/workflow.types";

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
	readonly skipExisting: boolean;
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

	public static formatSidecarError(error: unknown, exitCode?: number): string {
		const msg = error instanceof Error ? error.message : String(error);
		const lowerMsg = msg.toLowerCase();
		if (
			lowerMsg.includes("enoent") ||
			lowerMsg.includes("program not found") ||
			lowerMsg.includes("cannot find")
		) {
			return "Missing Executable: The sidecar binary could not be found.";
		}
		if (lowerMsg.includes("eacces") || lowerMsg.includes("permission denied")) {
			return "Permission Denied: Lacking rights to execute the sidecar binary.";
		}
		if (lowerMsg.includes("corrupt") || lowerMsg.includes("invalid")) {
			return `Corrupted Output: The tool encountered invalid or corrupted data. (${msg})`;
		}
		if (exitCode !== undefined && exitCode !== 0) {
			return `Non-Zero Exit: Process failed with code ${exitCode}. Check logs for details.`;
		}
		return msg;
	}

	private static readonly MIN_PROGRESS_DELTA_PERCENT = 0.25;
	private static readonly PROGRESS_UPDATE_MIN_INTERVAL_MS = 150;
	private static readonly TEMP_DIR_NAME = ".retropacker_temp";

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

		const canProcessUnknownPlatform = this.canProcessUnknownPlatform(
			workflow,
			ext,
		);

		// Safety gate: unknown platform requires either manual override or a
		// format where routing is inherently safe.
		if (
			job.system.value === "Unknown" &&
			!job.platformOverride.value &&
			!canProcessUnknownPlatform
		) {
			job.setErrorMessage(
				"Platform unknown. Please select a platform before processing.",
			);
			job.appendLog(
				"Skipped: platform is unknown and no manual platform override was set.",
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
		let cleanupOwnedByCallbacks = false;
		let hasCleanedUp = false;
		let terminalCallbackHandled = false;
		let tempDirCleaned = false;

		const beginTerminalCallback = (): boolean => {
			if (terminalCallbackHandled) return false;
			terminalCallbackHandled = true;
			return true;
		};

		const cleanupTempDir = async (): Promise<void> => {
			if (tempDirCleaned) return;
			tempDirCleaned = true;
			try {
				await this.deps.fileSystem.removeDirectory(tempDir);
			} catch {
				// Temp dir may not exist or may already be cleaned.
			}
		};

		const cleanup = (): void => {
			if (hasCleanedUp) return;
			hasCleanedUp = true;
			ProcessRegistry.unregister(workflow, job.id);
			ProcessJobUseCase.spawnLock.delete(lockKey);
		};

		// Create temp dir once — used by both CUE preprocessing and DolphinTool
		const tempDir = await this.deps.fileSystem.joinPath(
			outputDir,
			ProcessJobUseCase.TEMP_DIR_NAME,
		);

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
			if (workflow === "verify") {
				job.applyUpdates({
					dataSha1: undefined,
					verifiedName: undefined,
					verificationResult: undefined,
				});
			}
			const emitProgress = this.createProgressEmitter(job);

			// Determine which tool to use
			let usesDolphin = false;
			let isRawHash = false;
			let binary: "chdman" | "DolphinTool" = "chdman";

			if (workflow === "verify" && (ext === "iso" || ext === "bin")) {
				isRawHash = true;
			} else {
				usesDolphin = this.shouldUseDolphin(job);
				this.validateWorkflowSupport(workflow, ext, usesDolphin);
				binary = usesDolphin ? "DolphinTool" : "chdman";
			}

			// Raw hash workflow uses Tauri IPC, bypassing sidecar spawning
			if (isRawHash) {
				job.indeterminate.value = true;
				job.appendLog("Verification tool: Raw SHA-1 (Tauri)");
				job.appendLog(`Computing raw SHA-1 for ${job.filename}...`);

				try {
					const sha1 = await invoke<string>("compute_file_sha1", {
						path: job.path,
					});
					job.applyUpdates({ dataSha1: sha1 });
					job.appendLog(`Raw SHA-1: ${sha1}`);

					job.appendLog("Checking database for SHA-1...");
					const verifiedName = await invoke<string | null>("check_hash", {
						sha1,
					});
					if (verifiedName) {
						job.applyUpdates({ verifiedName });
						job.appendLog(`Verified against database: ${verifiedName}`);
					} else {
						job.appendLog("Hash not found in database.");
					}
					job.applyUpdates({ verificationResult: "pass" });

					job.setStatus("completed");
					job.updateProgress(100, 0);
				} catch (err) {
					job.applyUpdates({ verificationResult: "fail" });
					job.setStatus("failed");
					job.setErrorMessage(ProcessJobUseCase.formatSidecarError(err));
				} finally {
					job.endTime.value = Date.now();
					await cleanupTempDir();
					cleanup();
				}
				return;
			}

			if (workflow === "verify" && usesDolphin) {
				const algo = settings.dolphin.verifyAlgorithm.toUpperCase();
				job.appendLog(`Verification hash: ${algo}`);
				if (settings.dolphin.verifyAlgorithm !== "sha1") {
					job.appendLog(
						"Database check skipped (enable SHA-1 to verify against Redump/No-Intro).",
					);
				}
			}

			// Smart CUE preprocessing (chdman compress only)
			let overrideInputPath: string | undefined;
			if (!usesDolphin && workflow === "compress") {
				const cueResult = await CueProcessorService.prepareInput(
					job.path,
					tempDir,
					this.deps.fileSystem,
				);
				if (!cueResult.success) {
					const msg =
						cueResult.errorMessage ?? "Failed to preprocess CUE/BIN input.";
					job.setStatus("failed");
					job.setErrorMessage(msg);
					job.appendLog(`CUE preprocessing failed: ${msg}`);
					job.endTime.value = Date.now();
					return;
				}

				if (cueResult.modifiedPath) {
					overrideInputPath = cueResult.modifiedPath;
					job.appendLog(`Preprocessed CUE: ${cueResult.modifiedPath}`);
				}
			}

			// Build command arguments
			const args = await this.buildCommandArgs(
				job,
				outputDir,
				workflow,
				settings,
				usesDolphin,
				overrideInputPath,
			);

			// Skip if output file already exists and skipExisting is enabled
			if (
				settings.skipExisting &&
				(workflow === "compress" || workflow === "extract")
			) {
				const outputIndex = args.indexOf("-o");
				if (outputIndex !== -1 && outputIndex + 1 < args.length) {
					const outputPath = args[outputIndex + 1];
					if (await this.deps.fileSystem.exists(outputPath)) {
						job.appendLog(
							`Skipped — output file already exists: ${outputPath}`,
						);
						job.setStatus("completed");
						job.updateProgress(100, 0);
						job.endTime.value = Date.now();
						ProcessJobUseCase.spawnLock.delete(lockKey);
						return;
					}
				}
			}

			if (workflow === "verify") {
				job.appendLog(`Verification tool: ${binary}`);
			}
			job.appendLog(`Starting: ${binary} ${args.join(" ")}`);

			// Set up indeterminate progress for DolphinTool (doesn't output progress)
			if (usesDolphin) {
				job.indeterminate.value = true;
			}

			const callbacks: CommandCallbacks = {
				onStdout: (line) => {
					job.appendLog(line);

					if (
						workflow === "verify" &&
						(!usesDolphin || settings.dolphin.verifyAlgorithm === "sha1")
					) {
						const sha1Match =
							line.match(/(?:Data )?SHA1:\s*([a-fA-F0-9]{40})/i) ??
							line.match(/(?:^|\s)([a-fA-F0-9]{40})(?:\s|$)/);
						if (sha1Match && !job.dataSha1.value) {
							const sha1 = sha1Match[1].toUpperCase();
							job.applyUpdates({ dataSha1: sha1 });
							job.appendLog("Checking database for SHA-1...");
							void invoke<string | null>("check_hash", { sha1 })
								.then((verifiedName: string | null) => {
									if (verifiedName) {
										job.applyUpdates({ verifiedName });
										job.appendLog(`Verified against database: ${verifiedName}`);
									} else {
										job.appendLog("Hash not found in database.");
									}
								})
								.catch((err: unknown) => {
									console.error("Failed to check hash:", err);
								});
						}
					}

					if (workflow === "verify" && usesDolphin) {
						const problemsMatch = line.match(/Problems Found:\s*(Yes|No)/i);
						if (problemsMatch) {
							job.applyUpdates({
								verificationResult:
									problemsMatch[1].toLowerCase() === "no" ? "pass" : "fail",
							});
						}
					}

					if (!usesDolphin) {
						this.parseProgress(line, job, emitProgress);
					} else if (workflow === "info") {
						this.parseDolphinInfo(line, job);
					}
				},
				onStderr: (line) => {
					if (usesDolphin && this.shouldIgnoreDolphinStderr(line)) {
						return;
					}
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
							const wasCancelled = ProcessRegistry.wasCancelled(
								workflow,
								job.id,
							);
							ProcessRegistry.clearCancelled(workflow, job.id);

							if (result.code === 0) {
								job.setStatus("completed");
								job.setErrorMessage(undefined);
								job.updateProgress(100, 0);
								job.endTime.value = Date.now();
								if (
									workflow === "verify" &&
									job.verificationResult.value !== "fail"
								) {
									job.applyUpdates({ verificationResult: "pass" });
								}

								// Delete source file if setting is enabled (compress/extract only)
								if (
									settings.deleteSourceAfterSuccess &&
									(workflow === "compress" || workflow === "extract")
								) {
									try {
										const moved = await this.deps.fileSystem.moveToTrash(
											job.path,
										);
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
										const msg =
											err instanceof Error ? err.message : String(err);
										job.appendLog(
											`Warning: Failed to delete source file: ${msg}`,
										);
									}
								}
							} else if (wasCancelled || result.signal !== null) {
								// Process was cancelled
								job.setStatus("failed");
								job.setErrorMessage("Cancelled");
								job.endTime.value = Date.now();
							} else {
								job.setStatus("failed");
								const msg = `Exited with code ${result.code}`;
								const friendlyMsg = ProcessJobUseCase.formatSidecarError(
									msg,
									result.code ?? undefined,
								);
								job.setErrorMessage(friendlyMsg);
								if (workflow === "verify") {
									job.applyUpdates({ verificationResult: "fail" });
								}
								job.endTime.value = Date.now();
							}
						} catch (error) {
							console.error(
								`[ProcessJobUseCase] onClose handler failed for ${lockKey}:`,
								error,
							);
						} finally {
							await cleanupTempDir();
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

							const wasCancelled = ProcessRegistry.wasCancelled(
								workflow,
								job.id,
							);
							ProcessRegistry.clearCancelled(workflow, job.id);

							if (wasCancelled) {
								job.appendLog("Error: Process cancelled before completion");
								job.setStatus("failed");
								job.setErrorMessage("Cancelled");
								return;
							}

							job.appendLog(`Error: ${error.message}`);
							const friendlyMsg = ProcessJobUseCase.formatSidecarError(
								error.message,
							);
							job.setStatus("failed");
							job.setErrorMessage(friendlyMsg);
							if (workflow === "verify") {
								job.applyUpdates({ verificationResult: "fail" });
							}
							job.endTime.value = Date.now();
						} catch (handlerError) {
							console.error(
								`[ProcessJobUseCase] onError handler failed for ${lockKey}:`,
								handlerError,
							);
						} finally {
							await cleanupTempDir();
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

			const rawErrorMessage =
				e instanceof Error ? e.message : "Failed to spawn process";
			const errorMessage =
				ProcessJobUseCase.formatSidecarError(rawErrorMessage);
			job.setStatus("failed");
			job.setErrorMessage(errorMessage);
			job.appendLog(`Exception: ${errorMessage}`);
		} finally {
			if (!cleanupOwnedByCallbacks) {
				await cleanupTempDir();
				cleanup();
			}
		}
	}

	private canProcessUnknownPlatform(
		workflow: WorkflowType,
		ext: string,
	): boolean {
		// Extract/verify/info already have strict format validation and don't need
		// system detection to choose safe command routing.
		if (workflow !== "compress") {
			return true;
		}

		// CD descriptor inputs are safely routed through createcd and CUE/BIN
		// preprocessing.
		if (["cue", "bin", "gdi", "toc", "ccd"].includes(ext)) {
			return true;
		}

		// Native Nintendo formats are safely routed to DolphinTool by extension.
		if (["rvz", "gcz", "wbfs", "wia", "gcm"].includes(ext)) {
			return true;
		}

		return false;
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
		if (isNintendoPlatform(override)) {
			return true;
		}

		// Check file extension
		const ext = job.path.split(".").pop()?.toLowerCase();
		if (ext && ["gcm", "wbfs", "rvz", "gcz", "wia"].includes(ext)) {
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
		overrideInputPath?: string,
	): Promise<string[]> {
		if (usesDolphin) {
			return this.buildDolphinArgs(job, outputDir, workflow, settings);
		}
		return this.buildChdmanArgs(
			job,
			outputDir,
			workflow,
			settings,
			overrideInputPath,
		);
	}

	/**
	 * Build chdman command arguments.
	 */
	private async buildChdmanArgs(
		job: JobState,
		outputDir: string,
		workflow: WorkflowType,
		settings: ProcessJobSettings,
		overrideInputPath?: string,
	): Promise<string[]> {
		const { fileSystem } = this.deps;
		const { preset, customCompression, chd } = settings;
		const outputBaseName = this.getOutputBaseName(job.filename);
		const inputPath = overrideInputPath ?? job.path;

		let args: string[] = [];
		const effectiveSystem =
			job.platformOverride.value?.toLowerCase() ??
			job.system.value.toLowerCase();

		// Determine strict CD vs DVD strategy based on effective system
		const usesDvdStrategy = isDvdSystem(effectiveSystem);
		const compressCmd = usesDvdStrategy ? "createdvd" : "createcd";
		const extractCmd = usesDvdStrategy ? "extractdvd" : "extractcd";

		if (workflow === "compress") {
			const outputPath = await fileSystem.joinPath(
				outputDir,
				`${outputBaseName}.chd`,
			);
			args = [compressCmd, "-i", inputPath, "-o", outputPath];

			// Compression args
			const compressionArgs = this.getChdCompressionArgs(
				preset,
				customCompression,
			);
			args.push(...compressionArgs);

			// Hunk size
			if (chd.hunkSize) {
				args.push("-hs", chd.hunkSize.toString());
			} else if (usesDvdStrategy) {
				args.push("-hs", "2048"); // Strict 2048 for DVD systems
			}

			args.push("-f"); // Force overwrite
		} else if (workflow === "extract") {
			if (extractCmd === "extractdvd") {
				const outputPath = await fileSystem.joinPath(
					outputDir,
					`${outputBaseName}.iso`,
				);
				args = [extractCmd, "-i", job.path, "-o", outputPath, "-f"];
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

		// User dir for temp files — reuse the shared temp dir already created by execute()
		const userDir = await fileSystem.joinPath(
			outputDir,
			ProcessJobUseCase.TEMP_DIR_NAME,
		);
		await fileSystem.createDirectory(userDir);
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
			const supported = usesDolphin ? ["rvz", "gcz", "wbfs", "wia"] : ["chd"];
			if (!supported.includes(ext)) {
				throw new Error(
					`Unsupported extract input format: .${ext || "unknown"}`,
				);
			}
		}

		if (workflow === "verify") {
			const supported = usesDolphin
				? ["rvz", "gcz", "wbfs", "gcm", "wia"]
				: ["chd"];
			if (!supported.includes(ext)) {
				throw new Error(
					`Unsupported verify input format: .${ext || "unknown"}`,
				);
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
			/(?:Compressing|Extracting|Processing|Verifying),\s+(\d+\.?\d*)%\s+complete/,
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

	private shouldIgnoreDolphinStderr(line: string): boolean {
		const normalized = line.trim().toLowerCase();
		return normalized.includes("no bundle id found");
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
