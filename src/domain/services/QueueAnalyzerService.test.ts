import { describe, expect, it } from "vitest";
import type { JobProps } from "../entities/Job";
import type { ProcessJobSettings } from "../usecases/ProcessJobUseCase";
import { QueueAnalyzerService } from "./QueueAnalyzerService";

describe("QueueAnalyzerService", () => {
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

	const createJob = (
		id: string,
		filename: string,
		system: string,
	): JobProps => ({
		id,
		filename,
		path: `/mock/path/to/${filename}`,
		system,
		status: "pending",
		progress: 0,
		originalSize: 1000,
		outputLog: [],
		strategy: "createcd",
	});

	it("should detect duplicate input files", () => {
		const existingJob = createJob("1", "game.iso", "PS2");
		const newJob = createJob("2", "game.iso", "PS2"); // Same mock path due to filename
		const report = QueueAnalyzerService.analyzeConflicts(
			"compress",
			[newJob],
			[existingJob],
			defaultSettings,
		);

		expect(report.hasConflicts).toBe(true);
		expect(report.conflicts).toHaveLength(1);
		expect(report.conflicts[0].type).toBe("duplicate_input");
		expect(report.validJobs).toHaveLength(0);
	});

	it("should detect queue output collisions", () => {
		// Existing job output will be game.chd
		const existingJob = {
			...createJob("1", "game.cue", "PS1"),
			path: "/mock/path/to/disk1/game.cue",
		};

		// New job output will also be game.chd
		const newJob = {
			...createJob("2", "game.bin", "PS1"),
			path: "/mock/path/to/disk2/game.bin",
		};

		const report = QueueAnalyzerService.analyzeConflicts(
			"compress",
			[newJob],
			[existingJob],
			defaultSettings,
		);

		expect(report.hasConflicts).toBe(true);
		expect(report.conflicts[0].type).toBe("output_collision_queue");
		expect(report.validJobs).toHaveLength(0);
	});

	it("should detect batch output collisions", () => {
		// Two different input files in the same batch that collide on output
		const newJob1 = {
			...createJob("1", "game.cue", "PS1"),
			path: "/mock/path/to/disk1/game.cue",
		};
		const newJob2 = {
			...createJob("2", "game.bin", "PS1"),
			path: "/mock/path/to/disk2/game.bin",
		};

		const report = QueueAnalyzerService.analyzeConflicts(
			"compress",
			[newJob1, newJob2],
			[],
			defaultSettings,
		);

		expect(report.hasConflicts).toBe(true);
		expect(report.conflicts[0].type).toBe("output_collision_batch");
		// First one is valid, second one collides with the first one in the batch
		expect(report.validJobs).toHaveLength(1);
		expect(report.validJobs[0].id).toBe("1");
	});

	it("should allow safe valid jobs", () => {
		const existingJob = createJob("1", "game1.cue", "PS1");
		const newJob = createJob("2", "game2.cue", "PS1");

		const report = QueueAnalyzerService.analyzeConflicts(
			"compress",
			[newJob],
			[existingJob],
			defaultSettings,
		);

		expect(report.hasConflicts).toBe(false);
		expect(report.conflicts).toHaveLength(0);
		expect(report.validJobs).toHaveLength(1);
		expect(report.validJobs[0].id).toBe("2");
	});

	it("should predict dolphin .rvz output", () => {
		const newJob = createJob("1", "game.iso", "GameCube");
		const report = QueueAnalyzerService.analyzeConflicts(
			"compress",
			[newJob],
			[],
			defaultSettings,
		);

		expect(report.hasConflicts).toBe(false);

		// No conflicts, but lets verify the predicted output helper
		const outputs = QueueAnalyzerService.predictOutputPaths(
			"compress",
			newJob,
			defaultSettings,
		);
		expect(outputs).toEqual(["game.rvz"]);
	});

	it("should predict chd output", () => {
		const newJob = createJob("1", "game.iso", "PS2");
		const outputs = QueueAnalyzerService.predictOutputPaths(
			"compress",
			newJob,
			defaultSettings,
		);
		expect(outputs).toEqual(["game.chd"]);
	});
});
