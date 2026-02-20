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

// ─── Compression Summaries (existing) ────────────────────────

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

// ─── Job Operations (Map index) ──────────────────────────────

describe("JobStore operations (Map index)", () => {
	it("addJob adds to both array and index", () => {
		const job = jobStore.addJob("compress", createJob("compress", "j1", 1000, "pending"));
		expect(jobStore.getJob("compress", "j1")).toBe(job);
		expect(jobStore.getQueue("compress").length).toBe(1);
	});

	it("addJob prevents duplicates via Map index", () => {
		jobStore.addJob("compress", createJob("compress", "dup", 1000, "pending"));
		jobStore.addJob("compress", createJob("compress", "dup", 2000, "pending"));

		expect(jobStore.getQueue("compress").length).toBe(1);
	});

	it("getJob returns undefined for non-existent jobs", () => {
		expect(jobStore.getJob("compress", "missing")).toBeUndefined();
	});

	it("getJobById finds job across all workflows", () => {
		jobStore.addJob("compress", createJob("compress", "cross-1", 1000, "pending"));
		jobStore.addJob("extract", createJob("extract", "cross-2", 2000, "pending"));

		expect(jobStore.getJobById("cross-1")?.workflow).toBe("compress");
		expect(jobStore.getJobById("cross-2")?.workflow).toBe("extract");
		expect(jobStore.getJobById("nonexistent")).toBeUndefined();
	});

	it("getWorkflowByJobId returns correct workflow", () => {
		jobStore.addJob("verify", createJob("verify", "wf-1", 500, "pending"));
		expect(jobStore.getWorkflowByJobId("wf-1")).toBe("verify");
		expect(jobStore.getWorkflowByJobId("missing")).toBeUndefined();
	});

	it("removeJob removes from both array and index", () => {
		jobStore.addJob("compress", createJob("compress", "rem", 1000, "pending"));
		expect(jobStore.getJob("compress", "rem")).toBeDefined();

		jobStore.removeJob("compress", "rem");
		expect(jobStore.getJob("compress", "rem")).toBeUndefined();
		expect(jobStore.getQueue("compress").length).toBe(0);
	});

	it("removeJob only removes targeted job, preserves others", () => {
		jobStore.addJob("compress", createJob("compress", "keep-1", 1000, "pending"));
		jobStore.addJob("compress", createJob("compress", "remove", 2000, "pending"));
		jobStore.addJob("compress", createJob("compress", "keep-2", 3000, "pending"));

		jobStore.removeJob("compress", "remove");

		expect(jobStore.getQueue("compress").length).toBe(2);
		expect(jobStore.getJob("compress", "keep-1")).toBeDefined();
		expect(jobStore.getJob("compress", "keep-2")).toBeDefined();
		expect(jobStore.getJob("compress", "remove")).toBeUndefined();
	});

	it("clearQueue removes all jobs for a workflow from array and index", () => {
		jobStore.addJob("compress", createJob("compress", "c1", 1000, "pending"));
		jobStore.addJob("compress", createJob("compress", "c2", 2000, "pending"));
		jobStore.addJob("extract", createJob("extract", "e1", 1500, "pending"));

		jobStore.clearQueue("compress");

		expect(jobStore.getQueue("compress").length).toBe(0);
		expect(jobStore.getJob("compress", "c1")).toBeUndefined();
		expect(jobStore.getJob("compress", "c2")).toBeUndefined();
		// Extract queue should be untouched
		expect(jobStore.getQueue("extract").length).toBe(1);
		expect(jobStore.getJob("extract", "e1")).toBeDefined();
	});
});

// ─── Queue Stats ─────────────────────────────────────────────

describe("JobStore queue stats", () => {
	it("computes correct counts by status", () => {
		jobStore.addJob("compress", createJob("compress", "s1", 100, "pending"));
		jobStore.addJob("compress", createJob("compress", "s2", 100, "processing"));
		jobStore.addJob("compress", createJob("compress", "s3", 100, "completed"));
		jobStore.addJob("compress", createJob("compress", "s4", 100, "failed"));

		const stats = jobStore.queueStats.compress.value;
		expect(stats.queueLength).toBe(4);
		expect(stats.pendingCount).toBe(1);
		expect(stats.processingCount).toBe(1);
		expect(stats.completedCount).toBe(1);
		expect(stats.failedCount).toBe(1);
	});

	it("returns zeroed stats for empty queue", () => {
		const stats = jobStore.queueStats.compress.value;
		expect(stats.queueLength).toBe(0);
		expect(stats.pendingCount).toBe(0);
	});
});

// ─── Processing & Retry ──────────────────────────────────────

describe("JobStore processing & retry", () => {
	it("setProcessing updates workflow processing flag", () => {
		expect(jobStore.isProcessing.compress.value).toBe(false);
		jobStore.setProcessing("compress", true);
		expect(jobStore.isProcessing.compress.value).toBe(true);
		expect(jobStore.anyProcessing.value).toBe(true);

		jobStore.setProcessing("compress", false);
		expect(jobStore.isProcessing.compress.value).toBe(false);
		expect(jobStore.anyProcessing.value).toBe(false);
	});

	it("retryFailed resets failed jobs to pending and adds start requests", () => {
		const j1 = jobStore.addJob("compress", createJob("compress", "r1", 1000, "failed"));
		const j2 = jobStore.addJob("compress", createJob("compress", "r2", 1000, "completed"));
		const j3 = jobStore.addJob("compress", createJob("compress", "r3", 1000, "failed"));

		const retried = jobStore.retryFailed("compress");

		expect(retried).toEqual(["r1", "r3"]);
		expect(j1.status.value).toBe("pending");
		expect(j2.status.value).toBe("completed"); // unchanged
		expect(j3.status.value).toBe("pending");

		// Start requests should include retried IDs
		expect(jobStore.startRequests.compress.value).toContain("r1");
		expect(jobStore.startRequests.compress.value).toContain("r3");
	});

	it("requestStart and consumeStartRequest manage the request queue", () => {
		jobStore.requestStart("compress", "start-1");
		expect(jobStore.startRequests.compress.value).toContain("start-1");

		// Duplicate request is ignored
		jobStore.requestStart("compress", "start-1");
		expect(
			jobStore.startRequests.compress.value.filter((r) => r === "start-1").length,
		).toBe(1);

		jobStore.consumeStartRequest("compress", "start-1");
		expect(jobStore.startRequests.compress.value).not.toContain("start-1");
	});
});

// ─── updateJob & appendLog ───────────────────────────────────

describe("JobStore updateJob & appendLog", () => {
	it("updateJob applies partial updates to existing job", () => {
		const job = jobStore.addJob("compress", createJob("compress", "upd", 1000, "pending"));
		jobStore.updateJob("compress", "upd", { status: "processing", system: "Wii" });

		expect(job.status.value).toBe("processing");
		expect(job.system.value).toBe("Wii");
	});

	it("updateJob does nothing for non-existent job", () => {
		// Should not throw
		jobStore.updateJob("compress", "nonexistent", { status: "completed" });
	});

	it("appendLog adds log line to existing job", () => {
		const job = jobStore.addJob("compress", createJob("compress", "log", 1000, "pending"));
		jobStore.appendLog("compress", "log", "Test log line");
		job.flushBufferedLogs();
		expect(job.outputLog.value).toContain("Test log line");
	});
});

// ─── Active jobs ─────────────────────────────────────────────

describe("JobStore active jobs", () => {
	it("activeJobs and hasActiveJobs reflect processing state", () => {
		expect(jobStore.hasActiveJobs.value).toBe(false);

		const job = jobStore.addJob("compress", createJob("compress", "act", 1000, "processing"));
		expect(jobStore.hasActiveJobs.value).toBe(true);
		expect(jobStore.activeJobs.value.length).toBe(1);
		expect(jobStore.activeJobs.value[0]).toBe(job);
	});
});
