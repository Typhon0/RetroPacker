import { afterEach, describe, expect, it } from "vitest";
import { JobState } from "@/domain/entities/JobState";
import type { JobStatus, WorkflowType } from "@/domain/types/workflow.types";
import { getWorkflowOrder, jobStore } from "@/stores/JobStore";

function createJob(
	workflow: WorkflowType,
	id: string,
	originalSize: number,
	status: JobStatus,
	compressionRatio?: number,
): JobState {
	return new JobState(workflow, {
		id,
		filename: `${id}.iso`,
		path: `/games/${id}.iso`,
		system: "PS2",
		status,
		progress: status === "completed" ? 100 : 0,
		originalSize,
		compressionRatio,
		outputLog: [],
		strategy: "createdvd",
	});
}

afterEach(() => {
	for (const workflow of getWorkflowOrder()) {
		jobStore.clearQueue(workflow);
	}
});

describe("JobStore compression summaries", () => {
	it("computes workflow-level estimated savings from compression ratios", () => {
		jobStore.addJob("compress", createJob("compress", "a", 1000, "completed", 75));
		jobStore.addJob("compress", createJob("compress", "b", 3000, "completed", 50));
		jobStore.addJob("compress", createJob("compress", "c", 2000, "completed"));

		const summary = jobStore.queueSummaries.compress.value;

		expect(summary.jobsWithCompressionEstimate).toBe(2);
		expect(summary.estimatedCompressedBytes).toBeCloseTo(2250, 6);
		expect(summary.estimatedSavedBytes).toBeCloseTo(1750, 6);
		expect(summary.estimatedCompressionRatio).toBeCloseTo(56.25, 6);
	});

	it("aggregates estimated savings in global summary across workflows", () => {
		jobStore.addJob("compress", createJob("compress", "c1", 1000, "completed", 80));
		jobStore.addJob("extract", createJob("extract", "e1", 2000, "completed", 60));
		jobStore.addJob("verify", createJob("verify", "v1", 500, "completed"));

		const globalSummary = jobStore.globalSummary.value;

		expect(globalSummary.jobsWithCompressionEstimate).toBe(2);
		expect(globalSummary.estimatedCompressedBytes).toBeCloseTo(2000, 6);
		expect(globalSummary.estimatedSavedBytes).toBeCloseTo(1000, 6);
		expect(globalSummary.estimatedCompressionRatio).toBeCloseTo(
			66.6666667,
			4,
		);
	});

	it("ignores non-completed jobs when calculating saved-space estimates", () => {
		jobStore.addJob("compress", createJob("compress", "done", 1000, "completed", 50));
		jobStore.addJob(
			"compress",
			createJob("compress", "running", 2000, "processing", 40),
		);
		jobStore.addJob("compress", createJob("compress", "failed", 500, "failed", 20));

		const summary = jobStore.queueSummaries.compress.value;

		expect(summary.jobsWithCompressionEstimate).toBe(1);
		expect(summary.estimatedSavedBytes).toBeCloseTo(500, 6);
		expect(summary.estimatedCompressionRatio).toBeCloseTo(50, 6);
	});
});
