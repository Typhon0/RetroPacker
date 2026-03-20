import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobState } from "@/domain/entities/JobState";
import type {
	BinaryName,
	CommandCallbacks,
	CommandResult,
	ICommandExecutor,
	SpawnedProcess,
} from "@/domain/repositories/ICommandExecutor";
import type { IDatabaseRepository } from "@/domain/repositories/IDatabaseRepository";
import type { IFileSystemRepository } from "@/domain/repositories/IFileSystemRepository";
import type { INotificationService } from "@/domain/repositories/INotificationService";
import type { Platform } from "@/domain/types/platform.types";
import type { CompressionStrategy } from "@/domain/types/workflow.types";
import { ProcessJobUseCase } from "@/domain/usecases/ProcessJobUseCase";
import { ProcessRegistry } from "@/services/ProcessRegistry";

class TestCommandExecutor implements ICommandExecutor {
	constructor(
		private readonly spawnImpl: (
			binary: BinaryName,
			args: string[],
			callbacks: CommandCallbacks,
		) => Promise<SpawnedProcess>,
	) {}

	spawn(
		binary: BinaryName,
		args: string[],
		callbacks: CommandCallbacks,
	): Promise<SpawnedProcess> {
		return this.spawnImpl(binary, args, callbacks);
	}

	async execute(_binary: BinaryName, _args: string[]): Promise<CommandResult> {
		return { code: 0, signal: null };
	}

	async forceKillProcess(_pid: number): Promise<void> {
		return;
	}
}

/**
 * Capturing executor that records which binary & args were spawned,
 * then succeeds immediately.
 */
function createCapturingExecutor(): {
	executor: TestCommandExecutor;
	spawnedBinary: () => BinaryName | undefined;
	spawnedArgs: () => string[] | undefined;
} {
	let binary: BinaryName | undefined;
	let args: string[] | undefined;

	const executor = new TestCommandExecutor(
		async (_binary, _args, callbacks) => {
			binary = _binary;
			args = _args;
			setTimeout(() => {
				callbacks.onClose?.({ code: 0, signal: null });
			}, 0);
			return { pid: 200, async kill() {} };
		},
	);

	return {
		executor,
		spawnedBinary: () => binary,
		spawnedArgs: () => args,
	};
}

const baseFileSystem: IFileSystemRepository = {
	async getFileInfo(path: string) {
		return {
			path,
			name: path.split(/[\\/]/).pop() ?? "file",
			size: 0,
			isDirectory: false,
			extension: path.split(".").pop() ?? "",
		};
	},
	async exists() {
		return false;
	},
	async readDirectory() {
		return [];
	},
	async joinPath(...segments: string[]) {
		return segments.join("/");
	},
	async getAppDataDir() {
		return "/mock/app-data";
	},
	async getTempDir() {
		return "/mock/temp";
	},
	async dirname(path: string) {
		const normalized = path.replace(/\\/g, "/");
		const idx = normalized.lastIndexOf("/");
		return idx === -1 ? "." : normalized.slice(0, idx);
	},
	async readBytes() {
		return new Uint8Array();
	},
	convertFileSource(path: string) {
		return `mock://file/${path}`;
	},
	async writeTextFile() {
		return;
	},
	async writeBytesFile() {
		return;
	},
	async createDirectory() {
		return;
	},
	async moveToTrash() {
		return true;
	},
	async openPath() {
		return;
	},
	async revealInDirectory() {
		return;
	},
	async readTextFile() {
		return "";
	},
	async readText() {
		return "";
	},
	async removeDirectory() {
		return;
	},
	async computeFileHash() {
		return "";
	},
	async computeFileSha1() {
		return "";
	},
};

function createNotificationServiceSpy(): {
	service: INotificationService;
	notifySuccess: ReturnType<typeof vi.fn>;
	notifyFailure: ReturnType<typeof vi.fn>;
} {
	const notifySuccess = vi.fn(async () => {});
	const notifyFailure = vi.fn(async () => {});

	return {
		notifySuccess,
		notifyFailure,
		service: {
			async isPermissionGranted() {
				return true;
			},
			async requestPermission() {
				return true;
			},
			async sendNotification() {
				return;
			},
			notifySuccess,
			notifyFailure,
		},
	};
}

function createJob(
	id: string,
	overrides?: Partial<{
		system: string;
		path: string;
		filename: string;
		strategy: CompressionStrategy;
		platformOverride: Platform;
	}>,
): JobState {
	return new JobState("compress", {
		id,
		filename: overrides?.filename ?? `${id}.iso`,
		path: overrides?.path ?? `/games/${id}.iso`,
		system: overrides?.system ?? "PS2",
		status: "pending",
		progress: 0,
		originalSize: 1024 * 1024,
		outputLog: [],
		strategy: overrides?.strategy ?? "createdvd",
		platformOverride: overrides?.platformOverride,
	});
}

const settings = {
	preset: "balanced" as const,
	customCompression: "lzma,zlib,huff",
	chd: {
		hunkSize: undefined,
		mediaType: "auto" as const,
	},
	dolphin: {
		blockSize: 131072,
		format: "rvz" as const,
		compressionAlgorithm: "zstd" as const,
		scrub: false,
		verifyAlgorithm: "md5" as const,
		extractGameOnly: false,
	},
	deleteSourceAfterSuccess: false,
	skipExisting: false,
};

const baseDatabaseRepository: Pick<IDatabaseRepository, "checkHash"> = {
	async checkHash() {
		return null;
	},
};

afterEach(() => {
	ProcessRegistry.reset();
	vi.useRealTimers();
});

beforeEach(() => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
});

// ─── Core lifecycle ──────────────────────────────────────────

describe("ProcessJobUseCase", () => {
	it("marks job completed and reports success", async () => {
		const job = createJob("job-success");
		const notifications = createNotificationServiceSpy();
		const commandExecutor = new TestCommandExecutor(
			async (_binary, _args, callbacks) => {
				setTimeout(() => {
					callbacks.onStdout?.("Compressing, 50% complete");
					callbacks.onStderr?.("Compression complete ... final ratio = 77.3%");
					callbacks.onClose?.({ code: 0, signal: null });
				}, 0);

				return {
					pid: 101,
					async kill() {
						return;
					},
				};
			},
		);

		const useCase = new ProcessJobUseCase({
			commandExecutor,
			databaseRepository: baseDatabaseRepository,
			notificationService: notifications.service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);

		await vi.waitFor(() => {
			expect(job.status.value).toBe("completed");
		});

		expect(job.progress.value).toBe(100);
		expect(job.compressionRatio.value).toBeCloseTo(77.3, 1);
		expect(job.errorMessage.value).toBeUndefined();
		expect(notifications.notifyFailure).not.toHaveBeenCalled();

		job.dispose();
	});

	it("marks job as cancelled when process is cancelled", async () => {
		const job = createJob("job-cancelled");
		const notifications = createNotificationServiceSpy();
		const commandExecutor = new TestCommandExecutor(
			async (_binary, _args, callbacks) => {
				return {
					pid: 102,
					async kill() {
						callbacks.onClose?.({ code: null, signal: 9 });
					},
				};
			},
		);
		ProcessRegistry.init(commandExecutor);

		const useCase = new ProcessJobUseCase({
			commandExecutor,
			databaseRepository: baseDatabaseRepository,
			notificationService: notifications.service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);
		await ProcessRegistry.cancel("compress", job.id);

		await vi.waitFor(() => {
			expect(job.status.value).toBe("failed");
			expect(job.errorMessage.value).toBe("Cancelled");
		});

		expect(notifications.notifyFailure).not.toHaveBeenCalled();
		job.dispose();
	});

	it("skips execution when workflow is cancelled before start", async () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const job = createJob("job-skipped");
		const notifications = createNotificationServiceSpy();
		const commandExecutor = new TestCommandExecutor(async () => {
			throw new Error("spawn should not be called");
		});

		const useCase = new ProcessJobUseCase({
			commandExecutor,
			databaseRepository: baseDatabaseRepository,
			notificationService: notifications.service,
			fileSystem: baseFileSystem,
		});

		await ProcessRegistry.cancelAll("compress");
		await useCase.execute(job, "/output", "compress", settings);

		expect(job.status.value).toBe("pending");
		expect(job.progress.value).toBe(0);
		expect(notifications.notifySuccess).not.toHaveBeenCalled();
		job.dispose();
		spy.mockRestore();
	});

	it("keeps unknown jobs pending until a platform override is set", async () => {
		const job = createJob("unknown-blocked", { system: "Unknown" });
		const spawnFn = vi.fn();
		const commandExecutor = new TestCommandExecutor(spawnFn);

		const useCase = new ProcessJobUseCase({
			commandExecutor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);

		expect(spawnFn).not.toHaveBeenCalled();
		expect(job.status.value).toBe("pending");
		expect(job.errorMessage.value).toContain("Platform unknown");
		job.dispose();
	});

	it("processes unknown .cue input without requiring platform override", async () => {
		const job = createJob("unknown-cue", {
			system: "Unknown",
			path: "/games/unknown-cue.cue",
			filename: "unknown-cue.cue",
		});
		const { executor, spawnedArgs } = createCapturingExecutor();
		const fileSystem: IFileSystemRepository = {
			...baseFileSystem,
			async readText() {
				return `FILE "unknown-cue.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n`;
			},
			async exists(path) {
				return path.endsWith("/games/unknown-cue.bin");
			},
		};

		const useCase = new ProcessJobUseCase({
			commandExecutor: executor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);
		await vi.waitFor(() => expect(job.status.value).toBe("completed"));

		const args = spawnedArgs();
		if (!args) {
			throw new Error("Expected spawned args to be defined");
		}
		expect(args).toContain("createcd");
		expect(args).toContain("/games/unknown-cue.cue");
		job.dispose();
	});

	it("processes unknown .bin input without requiring platform override", async () => {
		const job = createJob("unknown-bin", {
			system: "Unknown",
			path: "/games/unknown-bin.bin",
			filename: "unknown-bin.bin",
		});
		const { executor, spawnedArgs } = createCapturingExecutor();
		const fileSystem: IFileSystemRepository = {
			...baseFileSystem,
			async exists(path) {
				return path === "/games/unknown-bin.bin";
			},
			async readDirectory() {
				return [{ name: "unknown-bin.bin", isFile: true, isDirectory: false }];
			},
		};

		const useCase = new ProcessJobUseCase({
			commandExecutor: executor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);
		await vi.waitFor(() => expect(job.status.value).toBe("completed"));

		const args = spawnedArgs();
		if (!args) {
			throw new Error("Expected spawned args to be defined");
		}
		const inputFlagIndex = args.indexOf("-i");
		expect(inputFlagIndex).toBeGreaterThan(-1);
		expect(args[inputFlagIndex + 1]).toBe(
			"/mock/temp/retropacker_temp/compress/unknown-bin/unknown-bin.cue",
		);
		job.dispose();
	});
});

// ─── endTime tracking (P4 #15) ──────────────────────────────

describe("ProcessJobUseCase endTime", () => {
	it("sets endTime on successful completion", async () => {
		const job = createJob("end-success");
		const commandExecutor = new TestCommandExecutor(
			async (_binary, _args, callbacks) => {
				setTimeout(() => {
					callbacks.onClose?.({ code: 0, signal: null });
				}, 0);
				return { pid: 300, async kill() {} };
			},
		);

		const useCase = new ProcessJobUseCase({
			commandExecutor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);
		await vi.waitFor(() => expect(job.status.value).toBe("completed"));

		expect(job.endTime.value).toBeDefined();
		expect(job.endTime.value).toBeGreaterThan(0);
		expect(job.elapsedMs.value).toBeDefined();
		job.dispose();
	});

	it("sets endTime on failure", async () => {
		const job = createJob("end-fail");
		const commandExecutor = new TestCommandExecutor(
			async (_binary, _args, callbacks) => {
				setTimeout(() => {
					callbacks.onClose?.({ code: 1, signal: null });
				}, 0);
				return { pid: 301, async kill() {} };
			},
		);

		const useCase = new ProcessJobUseCase({
			commandExecutor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);
		await vi.waitFor(() => expect(job.status.value).toBe("failed"));

		expect(job.endTime.value).toBeDefined();
		expect(job.errorMessage.value).toBe(
			"Non-Zero Exit: Process failed with code 1. Check logs for details.",
		);
		job.dispose();
	});
});

// ─── skipExisting (P4 #14) ───────────────────────────────────

describe("ProcessJobUseCase skipExisting", () => {
	it("skips job when output file exists and skipExisting is enabled", async () => {
		const job = createJob("skip-exist");
		const existsFileSystem: IFileSystemRepository = {
			...baseFileSystem,
			async exists() {
				return true; // Output file exists
			},
		};

		const spawnFn = vi.fn();
		const commandExecutor = new TestCommandExecutor(spawnFn);

		const useCase = new ProcessJobUseCase({
			commandExecutor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem: existsFileSystem,
		});

		await useCase.execute(job, "/output", "compress", {
			...settings,
			skipExisting: true,
		});

		expect(job.status.value).toBe("completed");
		expect(job.progress.value).toBe(100);
		expect(job.endTime.value).toBeDefined();
		expect(spawnFn).not.toHaveBeenCalled(); // Process was never spawned
		job.dispose();
	});

	it("processes normally when skipExisting is disabled even if output exists", async () => {
		const job = createJob("no-skip");
		const existsFileSystem: IFileSystemRepository = {
			...baseFileSystem,
			async exists() {
				return true;
			},
		};

		const { executor, spawnedBinary } = createCapturingExecutor();

		const useCase = new ProcessJobUseCase({
			commandExecutor: executor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem: existsFileSystem,
		});

		await useCase.execute(job, "/output", "compress", {
			...settings,
			skipExisting: false,
		});

		await vi.waitFor(() => expect(job.status.value).toBe("completed"));

		expect(spawnedBinary()).toBe("chdman");
		job.dispose();
	});
});

// ─── Tool selection (DolphinTool vs chdman) ──────────────────

describe("ProcessJobUseCase tool selection", () => {
	it("uses DolphinTool for GameCube system", async () => {
		const job = createJob("dolphin-gc", { system: "GameCube" });
		const { executor, spawnedBinary } = createCapturingExecutor();

		const useCase = new ProcessJobUseCase({
			commandExecutor: executor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);
		await vi.waitFor(() => expect(job.status.value).toBe("completed"));

		expect(spawnedBinary()).toBe("DolphinTool");
		job.dispose();
	});

	it("uses DolphinTool for Wii system", async () => {
		const job = createJob("dolphin-wii", { system: "Wii" });
		const { executor, spawnedBinary } = createCapturingExecutor();

		const useCase = new ProcessJobUseCase({
			commandExecutor: executor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);
		await vi.waitFor(() => expect(job.status.value).toBe("completed"));

		expect(spawnedBinary()).toBe("DolphinTool");
		job.dispose();
	});

	it("uses DolphinTool for .rvz extension when override is provided", async () => {
		const job = createJob("dolphin-ext", {
			system: "Unknown",
			path: "/roms/game.rvz",
			filename: "game.rvz",
			platformOverride: "gamecube",
		});
		const { executor, spawnedBinary } = createCapturingExecutor();

		const useCase = new ProcessJobUseCase({
			commandExecutor: executor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "extract", settings);
		await vi.waitFor(() => expect(job.status.value).toBe("completed"));

		expect(spawnedBinary()).toBe("DolphinTool");
		job.dispose();
	});

	it("ignores benign DolphinTool bundle-id stderr noise", async () => {
		const job = createJob("dolphin-stderr-noise", {
			system: "GameCube",
			path: "/games/luigi.iso",
			filename: "luigi.iso",
		});

		const notifications = createNotificationServiceSpy();
		const commandExecutor = new TestCommandExecutor(
			async (_binary, _args, callbacks) => {
				setTimeout(() => {
					callbacks.onStderr?.("No bundle id found");
					callbacks.onClose?.({ code: 0, signal: null });
				}, 0);
				return { pid: 777, async kill() {} };
			},
		);

		const useCase = new ProcessJobUseCase({
			commandExecutor,
			databaseRepository: baseDatabaseRepository,
			notificationService: notifications.service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);

		await vi.waitFor(() => {
			expect(job.status.value).toBe("completed");
		});

		const logs = job.toJobProps().outputLog;
		expect(logs.some((line) => line.includes("No bundle id found"))).toBe(
			false,
		);
		job.dispose();
	});

	it("uses chdman for PS2 system", async () => {
		const job = createJob("chdman-ps2", { system: "PS2" });
		const { executor, spawnedBinary } = createCapturingExecutor();

		const useCase = new ProcessJobUseCase({
			commandExecutor: executor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);
		await vi.waitFor(() => expect(job.status.value).toBe("completed"));

		expect(spawnedBinary()).toBe("chdman");
		job.dispose();
	});

	it("uses DolphinTool when platformOverride is gamecube", async () => {
		const job = createJob("override-gc", {
			system: "Unknown",
			platformOverride: "gamecube",
		});
		const { executor, spawnedBinary } = createCapturingExecutor();

		const useCase = new ProcessJobUseCase({
			commandExecutor: executor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);
		await vi.waitFor(() => expect(job.status.value).toBe("completed"));

		expect(spawnedBinary()).toBe("DolphinTool");
		job.dispose();
	});

	it("uses DolphinTool for .wia verify with unknown system when platformOverride is wii", async () => {
		const job = createJob("verify-wia-override-wii", {
			system: "Unknown",
			path: "/roms/game.wia",
			filename: "game.wia",
			platformOverride: "wii",
		});
		const { executor, spawnedBinary } = createCapturingExecutor();

		const useCase = new ProcessJobUseCase({
			commandExecutor: executor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "verify", settings);
		await vi.waitFor(() => expect(job.status.value).toBe("completed"));

		expect(spawnedBinary()).toBe("DolphinTool");
		job.dispose();
	});
});

// ─── Arg building ────────────────────────────────────────────

describe("ProcessJobUseCase arg building", () => {
	it("builds chdman compress args with -i, -o, and compression flags", async () => {
		const job = createJob("args-chd", { system: "PS2" });
		const { executor, spawnedArgs } = createCapturingExecutor();

		const useCase = new ProcessJobUseCase({
			commandExecutor: executor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);
		await vi.waitFor(() => expect(job.status.value).toBe("completed"));

		const args = spawnedArgs();
		if (!args) {
			throw new Error("Expected spawned args to be defined");
		}
		expect(args).toContain("createdvd"); // strategy
		expect(args).toContain("-i");
		expect(args).toContain("-o");
		expect(args.indexOf("-c")).toBeGreaterThan(-1); // compression
		job.dispose();
	});

	it("uses generated temp cue as input when compressing a naked .bin", async () => {
		const job = createJob("bin-temp-cue", {
			system: "PS1",
			path: "/games/bin-temp-cue.bin",
			filename: "bin-temp-cue.bin",
		});
		const { executor, spawnedArgs } = createCapturingExecutor();

		const fileSystem: IFileSystemRepository = {
			...baseFileSystem,
			async exists(path) {
				return path === "/games/bin-temp-cue.bin";
			},
			async readDirectory() {
				return [{ name: "bin-temp-cue.bin", isFile: true, isDirectory: false }];
			},
		};

		const useCase = new ProcessJobUseCase({
			commandExecutor: executor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);
		await vi.waitFor(() => expect(job.status.value).toBe("completed"));

		const args = spawnedArgs();
		if (!args) {
			throw new Error("Expected spawned args to be defined");
		}
		const inputFlagIndex = args.indexOf("-i");
		expect(inputFlagIndex).toBeGreaterThan(-1);
		expect(args[inputFlagIndex + 1]).toBe(
			"/mock/temp/retropacker_temp/compress/bin-temp-cue/bin-temp-cue.cue",
		);
		job.dispose();
	});
});

describe("ProcessJobUseCase cue preprocessing failures", () => {
	it("fails early for multi-track bin input without cue", async () => {
		const job = createJob("multitrack-missing-cue", {
			system: "PS1",
			path: "/games/Game (Track 1).bin",
			filename: "Game (Track 1).bin",
		});
		const spawnFn = vi.fn();
		const commandExecutor = new TestCommandExecutor(spawnFn);
		const fileSystem: IFileSystemRepository = {
			...baseFileSystem,
			async exists(path) {
				return path === "/games/Game (Track 1).bin";
			},
			async readDirectory() {
				return [
					{ name: "Game (Track 1).bin", isFile: true, isDirectory: false },
					{ name: "Game (Track 2).bin", isFile: true, isDirectory: false },
				];
			},
		};

		const useCase = new ProcessJobUseCase({
			commandExecutor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);

		expect(spawnFn).not.toHaveBeenCalled();
		expect(job.status.value).toBe("failed");
		expect(job.errorMessage.value).toBe(
			"Multi-track .bin detected without a .cue file. A valid .cue sheet is required.",
		);
		job.dispose();
	});

	it("fails early when cue references missing bin", async () => {
		const job = createJob("missing-cue-bin", {
			system: "PS1",
			path: "/games/missing.cue",
			filename: "missing.cue",
		});
		const spawnFn = vi.fn();
		const commandExecutor = new TestCommandExecutor(spawnFn);
		const fileSystem: IFileSystemRepository = {
			...baseFileSystem,
			async readText() {
				return `FILE "missing.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n`;
			},
			async exists() {
				return false;
			},
		};

		const useCase = new ProcessJobUseCase({
			commandExecutor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);

		expect(spawnFn).not.toHaveBeenCalled();
		expect(job.status.value).toBe("failed");
		expect(job.errorMessage.value).toBe(
			"Referenced .bin file not found in directory.",
		);
		job.dispose();
	});
});

// ─── Failure scenarios ───────────────────────────────────────

describe("ProcessJobUseCase failures", () => {
	it("marks job failed with exit code on non-zero exit", async () => {
		const job = createJob("fail-exit");
		const commandExecutor = new TestCommandExecutor(
			async (_binary, _args, callbacks) => {
				setTimeout(() => {
					callbacks.onClose?.({ code: 42, signal: null });
				}, 0);
				return { pid: 400, async kill() {} };
			},
		);

		const useCase = new ProcessJobUseCase({
			commandExecutor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);
		await vi.waitFor(() => expect(job.status.value).toBe("failed"));

		expect(job.errorMessage.value).toBe(
			"Non-Zero Exit: Process failed with code 42. Check logs for details.",
		);
		job.dispose();
	});

	it("marks job failed on onError callback", async () => {
		const job = createJob("fail-error");
		const commandExecutor = new TestCommandExecutor(
			async (_binary, _args, callbacks) => {
				setTimeout(() => {
					callbacks.onError?.(new Error("Binary not found"));
				}, 0);
				return { pid: 401, async kill() {} };
			},
		);

		const useCase = new ProcessJobUseCase({
			commandExecutor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);
		await vi.waitFor(() => expect(job.status.value).toBe("failed"));

		expect(job.errorMessage.value).toBe("Binary not found");
		expect(job.endTime.value).toBeDefined();
		job.dispose();
	});

	it("marks job failed on spawn exception", async () => {
		const job = createJob("fail-spawn");
		const commandExecutor = new TestCommandExecutor(async () => {
			throw new Error("Permission denied");
		});

		const useCase = new ProcessJobUseCase({
			commandExecutor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);

		expect(job.status.value).toBe("failed");
		expect(job.errorMessage.value).toBe(
			"Permission Denied: Lacking rights to execute the sidecar binary.",
		);
		job.dispose();
	});

	it("maps generic sidecar spawn exceptions to actionable message", async () => {
		const job = createJob("fail-spawn-generic");
		const commandExecutor = new TestCommandExecutor(async () => {
			throw { message: "Failed to spawn process" };
		});

		const useCase = new ProcessJobUseCase({
			commandExecutor,
			databaseRepository: baseDatabaseRepository,
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);

		expect(job.status.value).toBe("failed");
		expect(job.errorMessage.value).toBe(
			"Failed to start sidecar process. Ensure bundled sidecars are present and allowed by shell permissions.",
		);
		job.dispose();
	});
});
