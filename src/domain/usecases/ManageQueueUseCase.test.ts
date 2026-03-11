import { describe, expect, it, vi } from "vitest";
import type { JobProps } from "../entities/Job";
import type { IFileSystemRepository } from "../repositories/IFileSystemRepository";
import type { IJobRepository } from "../repositories/IJobRepository";
import { DetectSystemUseCase } from "./DetectSystemUseCase";
import {
	ManageQueueUseCase,
	UNSUPPORTED_ARCHIVE_MESSAGE,
	UNSUPPORTED_PS3_EXECUTABLE_MESSAGE,
	WORKFLOW_FILE_CONFIGS,
} from "./ManageQueueUseCase";
import type { ProcessJobSettings } from "./ProcessJobUseCase";

const defaultSettings: ProcessJobSettings = {
	preset: "balanced",
	customCompression: "",
	chd: { hunkSize: undefined, mediaType: "auto" },
	dolphin: {
		blockSize: 131072,
		format: "rvz",
		compressionAlgorithm: "zstd",
		scrub: false,
		verifyAlgorithm: "md5",
		extractGameOnly: false,
	},
	deleteSourceAfterSuccess: false,
	skipExisting: false,
};

// ─── Mocks ───────────────────────────────────────────────────────

function createMockJobRepository(): IJobRepository {
	const jobs: JobProps[] = [];
	return {
		addJob: vi.fn((_, job: JobProps) => {
			jobs.push(job);
		}),
		removeJob: vi.fn(),
		getJobs: vi.fn(() => jobs),
		clearQueue: vi.fn(() => {
			jobs.length = 0;
		}),
	} as unknown as IJobRepository;
}

function createMockFileSystem(): IFileSystemRepository {
	return {
		getFileInfo: vi.fn().mockResolvedValue({ size: 700_000_000 }),
		joinPath: vi.fn((...parts: string[]) => Promise.resolve(parts.join("/"))),
		getAppDataDir: vi.fn().mockResolvedValue("/mock/app-data"),
		dirname: vi.fn().mockResolvedValue("/roms"),
		readDirectory: vi.fn().mockResolvedValue([]),
		readBytes: vi.fn().mockResolvedValue(new Uint8Array(32832)),
		convertFileSource: vi.fn((path: string) => `mock://file/${path}`),
		readTextFile: vi.fn().mockResolvedValue(""),
		readText: vi.fn().mockResolvedValue(""),
		exists: vi.fn().mockResolvedValue(false),
		writeTextFile: vi.fn(),
		writeBytesFile: vi.fn(),
		createDirectory: vi.fn(),
		moveToTrash: vi.fn().mockResolvedValue(true),
		openPath: vi.fn(),
		revealInDirectory: vi.fn(),
		removeDirectory: vi.fn(),
		computeFileHash: vi.fn().mockResolvedValue(""),
		computeFileSha1: vi.fn().mockResolvedValue(""),
	} as unknown as IFileSystemRepository;
}

function createUseCase(overrides?: {
	jobRepository?: IJobRepository;
	fileSystem?: IFileSystemRepository;
}) {
	const jobRepository = overrides?.jobRepository ?? createMockJobRepository();
	const fileSystem = overrides?.fileSystem ?? createMockFileSystem();
	const detectSystem = new DetectSystemUseCase({ fileSystem });

	return {
		useCase: new ManageQueueUseCase({
			jobRepository,
			fileSystem,
			detectSystem,
		}),
		jobRepository,
		fileSystem,
	};
}

describe("ManageQueueUseCase", () => {
	// ─── WORKFLOW_FILE_CONFIGS ────────────────────────────────────

	describe("WORKFLOW_FILE_CONFIGS", () => {
		it("compress supports raw disc images", () => {
			expect(WORKFLOW_FILE_CONFIGS.compress.extensions).toContain("iso");
			expect(WORKFLOW_FILE_CONFIGS.compress.extensions).toContain("cue");
			expect(WORKFLOW_FILE_CONFIGS.compress.extensions).toContain("gdi");
		});

		it("verify aligns extension coverage and user-facing text for verifiable formats", () => {
			expect(WORKFLOW_FILE_CONFIGS.verify.extensions).toContain("iso");
			expect(WORKFLOW_FILE_CONFIGS.verify.extensions).toContain("bin");
			expect(WORKFLOW_FILE_CONFIGS.verify.filterName).toBe("Verifiable Files");
			expect(WORKFLOW_FILE_CONFIGS.verify.supportedText).toContain(".iso");
			expect(WORKFLOW_FILE_CONFIGS.verify.supportedText).toContain(".bin");
		});

		it("extract supports compressed formats", () => {
			expect(WORKFLOW_FILE_CONFIGS.extract.extensions).toContain("chd");
			expect(WORKFLOW_FILE_CONFIGS.extract.extensions).toContain("rvz");
			expect(WORKFLOW_FILE_CONFIGS.extract.extensions).toContain("gcz");
		});

		it("info supports all formats", () => {
			expect(WORKFLOW_FILE_CONFIGS.info.extensions).toContain("iso");
			expect(WORKFLOW_FILE_CONFIGS.info.extensions).toContain("chd");
			expect(WORKFLOW_FILE_CONFIGS.info.extensions).toContain("rvz");
		});
	});

	// ─── addFile ─────────────────────────────────────────────────

	describe("addFile", () => {
		it("adds a valid file to the queue", async () => {
			const { useCase, jobRepository } = createUseCase();
			await useCase.addFile(
				"compress",
				"/roms/game.iso",
				"game.iso",
				700_000_000,
			);

			expect(jobRepository.addJob).toHaveBeenCalledTimes(1);
			const addedJob = (jobRepository.addJob as ReturnType<typeof vi.fn>).mock
				.calls[0][1] as JobProps;
			expect(addedJob.filename).toBe("game.iso");
			expect(addedJob.status).toBe("pending");
			expect(addedJob.progress).toBe(0);
		});

		it("rejects files with unsupported extensions", async () => {
			const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const { useCase, jobRepository } = createUseCase();
			await useCase.addFile("compress", "/roms/readme.txt", "readme.txt", 100);

			expect(jobRepository.addJob).not.toHaveBeenCalled();
			spy.mockRestore();
		});

		it("returns unsupported archive message for zip files", async () => {
			const { useCase, jobRepository } = createUseCase();
			const result = await useCase.addFile(
				"compress",
				"/roms/archive.zip",
				"archive.zip",
				100,
			);

			expect(jobRepository.addJob).not.toHaveBeenCalled();
			expect(result.added).toBe(false);
			expect(result.reason).toBe("unsupported_archive");
			expect(result.message).toBe(UNSUPPORTED_ARCHIVE_MESSAGE);
		});

		it("skips definitive PS3 executables with an explicit message", async () => {
			const fileSystem = createMockFileSystem();
			(fileSystem.readBytes as ReturnType<typeof vi.fn>).mockResolvedValue(
				new Uint8Array([0x53, 0x43, 0x45, 0x00]),
			);
			const { useCase, jobRepository } = createUseCase({ fileSystem });

			const result = await useCase.addFile(
				"compress",
				"/roms/PS3_GAME/USRDIR/EBOOT.BIN",
				"EBOOT.BIN",
				2_150_000,
			);

			expect(jobRepository.addJob).not.toHaveBeenCalled();
			expect(result.added).toBe(false);
			expect(result.reason).toBe("unsupported_content");
			expect(result.message).toBe(UNSUPPORTED_PS3_EXECUTABLE_MESSAGE);
		});

		it("assigns createdvd strategy for ISO files", async () => {
			const { useCase, jobRepository } = createUseCase();
			await useCase.addFile(
				"compress",
				"/roms/game.iso",
				"game.iso",
				700_000_000,
			);

			const addedJob = (jobRepository.addJob as ReturnType<typeof vi.fn>).mock
				.calls[0][1] as JobProps;
			expect(addedJob.strategy).toBe("createdvd");
		});

		it("assigns createcd strategy for CUE files", async () => {
			const { useCase, jobRepository } = createUseCase();
			await useCase.addFile("compress", "/roms/game.cue", "game.cue", 100);

			const addedJob = (jobRepository.addJob as ReturnType<typeof vi.fn>).mock
				.calls[0][1] as JobProps;
			expect(addedJob.strategy).toBe("createcd");
		});
	});

	// ─── Disc info extraction ────────────────────────────────────

	describe("disc info extraction (via addFile)", () => {
		it("detects (Disc 1) pattern", async () => {
			const { useCase, jobRepository } = createUseCase();
			await useCase.addFile(
				"compress",
				"/roms/Final Fantasy VII (Disc 1).bin",
				"Final Fantasy VII (Disc 1).bin",
				700_000_000,
			);

			const job = (jobRepository.addJob as ReturnType<typeof vi.fn>).mock
				.calls[0][1] as JobProps;
			expect(job.discNumber).toBe(1);
			expect(job.discGroup).toBeDefined();
			expect(job.discGroup).not.toContain("Disc 1");
		});

		it("detects (CD 2) pattern", async () => {
			const { useCase, jobRepository } = createUseCase();
			await useCase.addFile(
				"compress",
				"/roms/Resident Evil 2 (CD 2).bin",
				"Resident Evil 2 (CD 2).bin",
				700_000_000,
			);

			const job = (jobRepository.addJob as ReturnType<typeof vi.fn>).mock
				.calls[0][1] as JobProps;
			expect(job.discNumber).toBe(2);
		});

		it("detects Disc 3 without parentheses", async () => {
			const { useCase, jobRepository } = createUseCase();
			await useCase.addFile(
				"compress",
				"/roms/Game Disc 3.bin",
				"Game Disc 3.bin",
				700_000_000,
			);

			const job = (jobRepository.addJob as ReturnType<typeof vi.fn>).mock
				.calls[0][1] as JobProps;
			expect(job.discNumber).toBe(3);
		});

		it("returns null disc info for single-disc games", async () => {
			const { useCase, jobRepository } = createUseCase();
			await useCase.addFile(
				"compress",
				"/roms/Crash Bandicoot.bin",
				"Crash Bandicoot.bin",
				700_000_000,
			);

			const job = (jobRepository.addJob as ReturnType<typeof vi.fn>).mock
				.calls[0][1] as JobProps;
			expect(job.discNumber).toBeUndefined();
			expect(job.discGroup).toBeUndefined();
		});
	});

	// ─── prepareAddFiles (batch) ─────────────────────────────────

	describe("prepareAddFiles", () => {
		it("prepares multiple files concurrently without automatic commit", async () => {
			const { useCase, jobRepository } = createUseCase();
			const addition = await useCase.prepareAddFiles(
				"compress",
				["/roms/game1.iso", "/roms/game2.iso", "/roms/game3.iso"],
				defaultSettings,
			);

			expect(jobRepository.addJob).not.toHaveBeenCalled();
			expect(addition.report.validJobs).toHaveLength(3);

			// Commit manually
			useCase.commitAddition("compress", addition.report.validJobs);
			expect(jobRepository.addJob).toHaveBeenCalledTimes(3);
		});

		it("skips invalid extensions in batch", async () => {
			const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const { useCase } = createUseCase();
			const addition = await useCase.prepareAddFiles(
				"compress",
				["/roms/game.iso", "/roms/readme.txt", "/roms/other_game.cue"],
				defaultSettings,
			);

			expect(addition.report.validJobs).toHaveLength(2);
			expect(addition.invalidResults).toHaveLength(1);
			expect(addition.invalidResults[0].reason).toBe("invalid_extension");
			spy.mockRestore();
		});

		it("reports analyzing progress for batch import", async () => {
			const { useCase } = createUseCase();
			const onProgress = vi.fn();

			await useCase.prepareAddFiles(
				"compress",
				["/roms/game1.iso", "/roms/game2.iso"],
				defaultSettings,
				onProgress,
			);

			expect(onProgress).toHaveBeenCalled();
			const updates = onProgress.mock.calls.map(
				(call) =>
					call[0] as {
						phase: string;
						analyzedFiles?: number;
						totalFiles?: number;
					},
			);
			expect(updates.every((update) => update.phase === "analyzing")).toBe(
				true,
			);
			const final = updates[updates.length - 1];
			expect(final.analyzedFiles).toBe(2);
			expect(final.totalFiles).toBe(2);
		});
	});

	describe("prepareAddFolders", () => {
		it("reports scanning progress while walking folders", async () => {
			const { useCase } = createUseCase({
				fileSystem: {
					...createMockFileSystem(),
					readDirectory: vi.fn().mockResolvedValue([]),
				} as unknown as IFileSystemRepository,
			});
			const onProgress = vi.fn();

			await useCase.prepareAddFolders(
				"compress",
				["/roms"],
				defaultSettings,
				onProgress,
			);

			const updates = onProgress.mock.calls.map(
				(call) =>
					call[0] as {
						phase: string;
						scannedDirectories?: number;
						currentPath?: string;
					},
			);
			expect(updates.some((update) => update.phase === "scanning")).toBe(true);
			expect(
				updates.some(
					(update) =>
						update.phase === "scanning" &&
						update.scannedDirectories !== undefined &&
						update.scannedDirectories >= 1 &&
						update.currentPath === "/roms",
				),
			).toBe(true);
		});
	});

	// ─── Queue management ────────────────────────────────────────

	describe("queue management", () => {
		it("removeJob delegates to repository", () => {
			const { useCase, jobRepository } = createUseCase();
			useCase.removeJob("compress", "job-1");
			expect(jobRepository.removeJob).toHaveBeenCalledWith("compress", "job-1");
		});

		it("clearQueue delegates to repository", () => {
			const { useCase, jobRepository } = createUseCase();
			useCase.clearQueue("compress");
			expect(jobRepository.clearQueue).toHaveBeenCalledWith("compress");
		});
	});
});
