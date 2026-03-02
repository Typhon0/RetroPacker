import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JobProps } from "./Job";
import { JobState } from "./JobState";

function createJobProps(overrides?: Partial<JobProps>): JobProps {
	return {
		id: "test-job-1",
		filename: "game.iso",
		path: "/roms/game.iso",
		system: "PS2",
		status: "pending",
		progress: 0,
		originalSize: 1_000_000,
		outputLog: [],
		strategy: "createdvd",
		...overrides,
	};
}

describe("JobState", () => {
	let job: JobState;

	beforeEach(() => {
		job = new JobState("compress", createJobProps());
	});

	afterEach(() => {
		job.dispose();
	});

	// ─── Status & Progress ────────────────────────────────────────

	describe("status and progress", () => {
		it("initializes with correct values", () => {
			expect(job.status.value).toBe("pending");
			expect(job.progress.value).toBe(0);
			expect(job.isProcessing.value).toBe(false);
			expect(job.isFailed.value).toBe(false);
		});

		it("updates status reactively", () => {
			job.setStatus("processing");
			expect(job.isProcessing.value).toBe(true);
			expect(job.isFailed.value).toBe(false);

			job.setStatus("failed");
			expect(job.isProcessing.value).toBe(false);
			expect(job.isFailed.value).toBe(true);
		});

		it("clamps progress between 0 and 100", () => {
			job.updateProgress(-10);
			expect(job.progress.value).toBe(0);

			job.updateProgress(150);
			expect(job.progress.value).toBe(100);

			job.updateProgress(50);
			expect(job.progress.value).toBe(50);
		});

		it("updates ETA alongside progress", () => {
			job.updateProgress(50, 120);
			expect(job.etaSeconds.value).toBe(120);

			// Negative ETA gets clamped to 0
			job.updateProgress(80, -5);
			expect(job.etaSeconds.value).toBe(0);
		});
	});

	// ─── endTime & elapsedMs ──────────────────────────────────────

	describe("endTime and elapsedMs", () => {
		it("starts with no endTime and undefined elapsedMs", () => {
			expect(job.endTime.value).toBeUndefined();
			expect(job.elapsedMs.value).toBeUndefined();
		});

		it("computes elapsedMs when both start and end are set", () => {
			job.setStartTime(1000);
			job.endTime.value = 3500;
			expect(job.elapsedMs.value).toBe(2500);
		});

		it("returns undefined elapsedMs when only startTime is set", () => {
			job.setStartTime(1000);
			expect(job.elapsedMs.value).toBeUndefined();
		});

		it("returns undefined elapsedMs when only endTime is set", () => {
			job.endTime.value = 5000;
			expect(job.elapsedMs.value).toBeUndefined();
		});
	});

	// ─── Log buffering ───────────────────────────────────────────

	describe("log buffering", () => {
		it("buffers small log entries", () => {
			job.appendLog("Line 1");
			job.appendLog("Line 2");
			// Not flushed yet — outputLog signal remains empty
			expect(job.outputLog.value.length).toBe(0);
		});

		it("flushes when buffer reaches batch size", () => {
			for (let i = 0; i < 20; i++) {
				job.appendLog(`Line ${i}`);
			}
			// Batch size is 20, so flush should have triggered
			expect(job.outputLog.value.length).toBeGreaterThanOrEqual(20);
		});

		it("flushes explicitly via flushBufferedLogs", () => {
			job.appendLog("Line 1");
			job.appendLog("Line 2");
			job.flushBufferedLogs();
			expect(job.outputLog.value).toEqual(["Line 1", "Line 2"]);
		});

		it("appendLogs handles batch of lines", () => {
			job.appendLogs(["A", "B", "C"]);
			job.flushBufferedLogs();
			expect(job.outputLog.value).toEqual(["A", "B", "C"]);
		});

		it("clearLogs empties all logs", () => {
			job.appendLog("kept");
			job.flushBufferedLogs();
			job.clearLogs();
			expect(job.outputLog.value.length).toBe(0);
		});
	});

	// ─── resetForRetry ───────────────────────────────────────────

	describe("resetForRetry", () => {
		it("resets volatile state for retry", () => {
			job.setStatus("failed");
			job.updateProgress(75);
			job.setErrorMessage("Something broke");
			job.setStartTime(1000);
			job.endTime.value = 5000;
			job.setCompressionRatio(0.65);
			job.appendLog("old log line");
			job.flushBufferedLogs();

			job.resetForRetry();

			expect(job.status.value).toBe("pending");
			expect(job.progress.value).toBe(0);
			expect(job.errorMessage.value).toBeUndefined();
			expect(job.startTime.value).toBeUndefined();
			expect(job.endTime.value).toBeUndefined();
			expect(job.elapsedMs.value).toBeUndefined();
			expect(job.compressionRatio.value).toBeUndefined();
			expect(job.outputLog.value.length).toBe(0);
		});
	});

	// ─── applyUpdates ────────────────────────────────────────────

	describe("applyUpdates", () => {
		it("applies partial updates to signals", () => {
			job.applyUpdates({
				status: "completed",
				progress: 100,
				system: "Wii",
				endTime: 9999,
				gameId: "GALE01",
				verificationResult: "pass",
			});

			expect(job.status.value).toBe("completed");
			expect(job.progress.value).toBe(100);
			expect(job.system.value).toBe("Wii");
			expect(job.endTime.value).toBe(9999);
			expect(job.gameId.value).toBe("GALE01");
			expect(job.verificationResult.value).toBe("pass");
		});
	});

	// ─── toJobProps ──────────────────────────────────────────────

	describe("toJobProps", () => {
		it("serializes all fields including endTime", () => {
			job.setStartTime(1000);
			job.endTime.value = 5000;
			job.setStatus("completed");
			job.updateProgress(100);

			const props = job.toJobProps();

			expect(props.id).toBe("test-job-1");
			expect(props.startTime).toBe(1000);
			expect(props.endTime).toBe(5000);
			expect(props.status).toBe("completed");
			expect(props.progress).toBe(100);
		});

		it("includes unflushed log buffer in serialization", () => {
			job.appendLog("buffered line");
			const props = job.toJobProps();
			expect(props.outputLog).toContain("buffered line");
		});
	});

	// ─── Structural immutability ─────────────────────────────────

	describe("structural fields", () => {
		it("preserves immutable identity fields", () => {
			expect(job.id).toBe("test-job-1");
			expect(job.filename).toBe("game.iso");
			expect(job.path).toBe("/roms/game.iso");
			expect(job.originalSize).toBe(1_000_000);
			expect(job.strategy).toBe("createdvd");
			expect(job.workflow).toBe("compress");
		});
	});
});
