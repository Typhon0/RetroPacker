import { describe, it, expect, vi } from "vitest";
import { ManageQueueUseCase, WORKFLOW_FILE_CONFIGS } from "./ManageQueueUseCase";
import { DetectSystemUseCase } from "./DetectSystemUseCase";
import type { IJobRepository } from "../repositories/IJobRepository";
import type { IFileSystemRepository } from "../repositories/IFileSystemRepository";
import type { JobProps } from "../entities/Job";

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
        joinPath: vi.fn((...parts: string[]) =>
            Promise.resolve(parts.join("/")),
        ),
        readDir: vi.fn().mockResolvedValue([]),
        readBytes: vi.fn().mockResolvedValue(new Uint8Array(32832)),
        exists: vi.fn().mockResolvedValue(false),
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
            await useCase.addFile("compress", "/roms/game.iso", "game.iso", 700_000_000);

            expect(jobRepository.addJob).toHaveBeenCalledTimes(1);
            const addedJob = (jobRepository.addJob as ReturnType<typeof vi.fn>).mock
                .calls[0][1] as JobProps;
            expect(addedJob.filename).toBe("game.iso");
            expect(addedJob.status).toBe("pending");
            expect(addedJob.progress).toBe(0);
        });

        it("rejects files with unsupported extensions", async () => {
            const spy = vi.spyOn(console, "warn").mockImplementation(() => { });
            const { useCase, jobRepository } = createUseCase();
            await useCase.addFile("compress", "/roms/readme.txt", "readme.txt", 100);

            expect(jobRepository.addJob).not.toHaveBeenCalled();
            spy.mockRestore();
        });

        it("assigns createdvd strategy for ISO files", async () => {
            const { useCase, jobRepository } = createUseCase();
            await useCase.addFile("compress", "/roms/game.iso", "game.iso", 700_000_000);

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

            const job = (jobRepository.addJob as ReturnType<typeof vi.fn>).mock.calls[0][1] as JobProps;
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

            const job = (jobRepository.addJob as ReturnType<typeof vi.fn>).mock.calls[0][1] as JobProps;
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

            const job = (jobRepository.addJob as ReturnType<typeof vi.fn>).mock.calls[0][1] as JobProps;
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

            const job = (jobRepository.addJob as ReturnType<typeof vi.fn>).mock.calls[0][1] as JobProps;
            expect(job.discNumber).toBeUndefined();
            expect(job.discGroup).toBeUndefined();
        });
    });

    // ─── addFiles (batch) ────────────────────────────────────────

    describe("addFiles", () => {
        it("adds multiple files concurrently", async () => {
            const { useCase, jobRepository } = createUseCase();
            await useCase.addFiles("compress", [
                "/roms/game1.iso",
                "/roms/game2.iso",
                "/roms/game3.iso",
            ]);

            expect(jobRepository.addJob).toHaveBeenCalledTimes(3);
        });

        it("skips invalid extensions in batch", async () => {
            const spy = vi.spyOn(console, "warn").mockImplementation(() => { });
            const { useCase, jobRepository } = createUseCase();
            await useCase.addFiles("compress", [
                "/roms/game.iso",
                "/roms/readme.txt",
                "/roms/game.cue",
            ]);

            expect(jobRepository.addJob).toHaveBeenCalledTimes(2);
            spy.mockRestore();
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
