import { describe, expect, it } from "vitest";
import { JobState } from "@/domain/entities/JobState";
import { planQueueDispatch } from "@/hooks/useQueueProcessor";

function createJob(
	id: string,
	status: "pending" | "processing" | "completed" | "failed",
	system = "PS2",
): JobState {
	return new JobState("compress", {
		id,
		filename: `${id}.iso`,
		path: `/games/${id}.iso`,
		system,
		status,
		progress: status === "completed" ? 100 : 0,
		originalSize: 1024,
		outputLog: [],
		strategy: "createdvd",
	});
}

describe("planQueueDispatch", () => {
	it("prioritizes requested pending jobs and marks stale requests", () => {
		const pendingA = createJob("pending-a", "pending");
		const pendingB = createJob("pending-b", "pending");

		const plan = planQueueDispatch({
			queue: [pendingA, pendingB],
			startRequests: ["missing", "pending-b"],
			isProcessing: true,
			concurrency: 2,
		});

		expect(plan.staleRequestIds).toEqual(["missing"]);
		expect(plan.selectedRequestedId).toBe("pending-b");
		expect(plan.nextJob?.id).toBe("pending-b");
		expect(plan.canDispatch).toBe(true);
		expect(plan.shouldAutoPause).toBe(false);

		pendingA.dispose();
		pendingB.dispose();
	});

	it("does not dispatch when processing slots are full", () => {
		const processingA = createJob("processing-a", "processing");
		const processingB = createJob("processing-b", "processing");
		const pendingC = createJob("pending-c", "pending");

		const plan = planQueueDispatch({
			queue: [processingA, processingB, pendingC],
			startRequests: [],
			isProcessing: true,
			concurrency: 2,
		});

		expect(plan.processingCount).toBe(2);
		expect(plan.nextJob?.id).toBe("pending-c");
		expect(plan.canDispatch).toBe(false);
		expect(plan.shouldAutoPause).toBe(false);

		processingA.dispose();
		processingB.dispose();
		pendingC.dispose();
	});

	it("allows manual start requests even when workflow is paused", () => {
		const pending = createJob("manual-pending", "pending");

		const plan = planQueueDispatch({
			queue: [pending],
			startRequests: ["manual-pending"],
			isProcessing: false,
			concurrency: 1,
		});

		expect(plan.selectedRequestedId).toBe("manual-pending");
		expect(plan.nextJob?.id).toBe("manual-pending");
		expect(plan.canDispatch).toBe(true);
		expect(plan.shouldAutoPause).toBe(false);

		pending.dispose();
	});

	it("requests auto-pause when workflow is idle", () => {
		const completed = createJob("done", "completed");

		const plan = planQueueDispatch({
			queue: [completed],
			startRequests: [],
			isProcessing: true,
			concurrency: 1,
		});

		expect(plan.canDispatch).toBe(false);
		expect(plan.shouldAutoPause).toBe(true);

		completed.dispose();
	});

	it("does not auto-pause while a pending job exists", () => {
		const pending = createJob("pending", "pending");

		const plan = planQueueDispatch({
			queue: [pending],
			startRequests: [],
			isProcessing: true,
			concurrency: 1,
		});

		expect(plan.canDispatch).toBe(true);
		expect(plan.shouldAutoPause).toBe(false);

		pending.dispose();
	});

	it("auto-pauses when only unknown pending jobs remain", () => {
		const unknownPending = createJob("unknown-pending", "pending", "Unknown");

		const plan = planQueueDispatch({
			queue: [unknownPending],
			startRequests: [],
			isProcessing: true,
			concurrency: 1,
		});

		expect(plan.nextJob).toBeUndefined();
		expect(plan.canDispatch).toBe(false);
		expect(plan.shouldAutoPause).toBe(true);

		unknownPending.dispose();
	});
});
