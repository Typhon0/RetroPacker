import { afterEach, describe, expect, it, vi } from "vitest";
import { JobState } from "@/domain/entities/JobState";
import { ProcessJobUseCase } from "@/domain/usecases/ProcessJobUseCase";
import type {
	BinaryName,
	CommandCallbacks,
	CommandResult,
	ICommandExecutor,
	SpawnedProcess,
} from "@/domain/repositories/ICommandExecutor";
import type { IFileSystemRepository } from "@/domain/repositories/IFileSystemRepository";
import type { INotificationService } from "@/domain/repositories/INotificationService";
import { ProcessRegistry } from "@/services/ProcessRegistry";

class TestCommandExecutor implements ICommandExecutor {
	constructor(
		private readonly spawnImpl: (
			binary: BinaryName,
			args: string[],
			callbacks: CommandCallbacks,
		) => Promise<SpawnedProcess>,
	) { }

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
			return { pid: 200, async kill() { } };
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
	async dirname(path: string) {
		const normalized = path.replace(/\\/g, "/");
		const idx = normalized.lastIndexOf("/");
		return idx === -1 ? "." : normalized.slice(0, idx);
	},
	async readBytes() {
		return new Uint8Array();
	},
	async writeTextFile() {
		return;
	},
	async createDirectory() {
		return;
	},
	async moveToTrash() {
		return true;
	},
	async computeFileHash() {
		return "";
	},
};

function createNotificationServiceSpy(): {
	service: INotificationService;
	notifySuccess: ReturnType<typeof vi.fn>;
	notifyFailure: ReturnType<typeof vi.fn>;
} {
	const notifySuccess = vi.fn(async () => { });
	const notifyFailure = vi.fn(async () => { });

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
		strategy: string;
		platformOverride: string;
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
		strategy: (overrides?.strategy as any) ?? "createdvd",
		platformOverride: overrides?.platformOverride as any,
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

afterEach(() => {
	ProcessRegistry.reset();
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
		const job = createJob("job-skipped");
		const notifications = createNotificationServiceSpy();
		const commandExecutor = new TestCommandExecutor(async () => {
			throw new Error("spawn should not be called");
		});

		const useCase = new ProcessJobUseCase({
			commandExecutor,
			notificationService: notifications.service,
			fileSystem: baseFileSystem,
		});

		await ProcessRegistry.cancelAll("compress");
		await useCase.execute(job, "/output", "compress", settings);

		expect(job.status.value).toBe("pending");
		expect(job.progress.value).toBe(0);
		expect(notifications.notifySuccess).not.toHaveBeenCalled();
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
				return { pid: 300, async kill() { } };
			},
		);

		const useCase = new ProcessJobUseCase({
			commandExecutor,
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
				return { pid: 301, async kill() { } };
			},
		);

		const useCase = new ProcessJobUseCase({
			commandExecutor,
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);
		await vi.waitFor(() => expect(job.status.value).toBe("failed"));

		expect(job.endTime.value).toBeDefined();
		expect(job.errorMessage.value).toBe("Exited with code 1");
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
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);
		await vi.waitFor(() => expect(job.status.value).toBe("completed"));

		expect(spawnedBinary()).toBe("DolphinTool");
		job.dispose();
	});

	it("uses DolphinTool for .rvz extension regardless of system", async () => {
		const job = createJob("dolphin-ext", {
			system: "Unknown",
			path: "/roms/game.rvz",
			filename: "game.rvz",
		});
		const { executor, spawnedBinary } = createCapturingExecutor();

		const useCase = new ProcessJobUseCase({
			commandExecutor: executor,
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "extract", settings);
		await vi.waitFor(() => expect(job.status.value).toBe("completed"));

		expect(spawnedBinary()).toBe("DolphinTool");
		job.dispose();
	});

	it("uses chdman for PS2 system", async () => {
		const job = createJob("chdman-ps2", { system: "PS2" });
		const { executor, spawnedBinary } = createCapturingExecutor();

		const useCase = new ProcessJobUseCase({
			commandExecutor: executor,
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
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);
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
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);
		await vi.waitFor(() => expect(job.status.value).toBe("completed"));

		const args = spawnedArgs()!;
		expect(args).toContain("createdvd"); // strategy
		expect(args).toContain("-i");
		expect(args).toContain("-o");
		expect(args.indexOf("-c")).toBeGreaterThan(-1); // compression
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
				return { pid: 400, async kill() { } };
			},
		);

		const useCase = new ProcessJobUseCase({
			commandExecutor,
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);
		await vi.waitFor(() => expect(job.status.value).toBe("failed"));

		expect(job.errorMessage.value).toBe("Exited with code 42");
		job.dispose();
	});

	it("marks job failed on onError callback", async () => {
		const job = createJob("fail-error");
		const commandExecutor = new TestCommandExecutor(
			async (_binary, _args, callbacks) => {
				setTimeout(() => {
					callbacks.onError?.(new Error("Binary not found"));
				}, 0);
				return { pid: 401, async kill() { } };
			},
		);

		const useCase = new ProcessJobUseCase({
			commandExecutor,
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
			notificationService: createNotificationServiceSpy().service,
			fileSystem: baseFileSystem,
		});

		await useCase.execute(job, "/output", "compress", settings);

		expect(job.status.value).toBe("failed");
		expect(job.errorMessage.value).toBe("Permission denied");
		job.dispose();
	});
});
