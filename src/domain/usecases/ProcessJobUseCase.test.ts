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
		return true;
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

function createJob(id: string): JobState {
	return new JobState("compress", {
		id,
		filename: `${id}.iso`,
		path: `/games/${id}.iso`,
		system: "PS2",
		status: "pending",
		progress: 0,
		originalSize: 1024 * 1024,
		outputLog: [],
		strategy: "createdvd",
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
	for (const workflow of ["compress", "extract", "verify", "info"] as const) {
		ProcessRegistry.clearWorkflowCancellation(workflow);
	}
});

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
		// Per-job notifications were removed; batch notifications are now in useQueueProcessor
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
