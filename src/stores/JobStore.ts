import { computed, signal, type ReadonlySignal } from "@preact/signals-core";
import { JobState } from "@/domain/entities/JobState";
import type { JobProps } from "@/domain/entities/Job";
import type { Platform } from "@/domain/types/platform.types";
import type { JobStatus, WorkflowType } from "@/domain/types/workflow.types";
import { schedulePersist, loadPersistedQueue, clearPersistedQueue } from "@/stores/QueuePersistence";

const WORKFLOWS: readonly WorkflowType[] = [
	"compress",
	"extract",
	"verify",
	"info",
];

export interface JobRuntimeSnapshot {
	status: JobStatus;
	system: string;
	platformOverride: Platform | undefined;
}

export interface WorkflowQueueStats {
	queueLength: number;
	pendingCount: number;
	processingCount: number;
	completedCount: number;
	failedCount: number;
}

export interface WorkflowProgressSummary {
	total: number;
	completed: number;
	processing: number;
	failed: number;
	pending: number;
	overallProgress: number;
	estimatedCompressedBytes: number;
	estimatedSavedBytes: number;
	estimatedCompressionRatio: number | undefined;
	jobsWithCompressionEstimate: number;
}

function createWorkflowRecord<T>(
	factory: (workflow: WorkflowType) => T,
): Record<WorkflowType, T> {
	return {
		compress: factory("compress"),
		extract: factory("extract"),
		verify: factory("verify"),
		info: factory("info"),
	};
}

function createQueueStats(queue: readonly JobState[]): WorkflowQueueStats {
	let pendingCount = 0;
	let processingCount = 0;
	let completedCount = 0;
	let failedCount = 0;

	for (const job of queue) {
		switch (job.status.value) {
			case "pending":
				pendingCount += 1;
				break;
			case "processing":
				processingCount += 1;
				break;
			case "completed":
				completedCount += 1;
				break;
			case "failed":
				failedCount += 1;
				break;
		}
	}

	return {
		queueLength: queue.length,
		pendingCount,
		processingCount,
		completedCount,
		failedCount,
	};
}

function createProgressSummary(queue: readonly JobState[]): WorkflowProgressSummary {
	const { queueLength, pendingCount, processingCount, completedCount, failedCount } =
		createQueueStats(queue);
	if (queueLength === 0) {
		return {
			total: 0,
			completed: 0,
			processing: 0,
			failed: 0,
			pending: 0,
			overallProgress: 0,
			estimatedCompressedBytes: 0,
			estimatedSavedBytes: 0,
			estimatedCompressionRatio: undefined,
			jobsWithCompressionEstimate: 0,
		};
	}

	let progressSum = 0;
	let estimatedOriginalBytes = 0;
	let estimatedCompressedBytes = 0;
	let jobsWithCompressionEstimate = 0;

	for (const job of queue) {
		const status = job.status.value;
		if (status === "completed") {
			progressSum += 100;
		} else if (status === "processing") {
			progressSum += job.progress.value;
		}

		if (status !== "completed") {
			continue;
		}

		const ratio = job.compressionRatio.value;
		if (ratio === undefined || !Number.isFinite(ratio) || job.originalSize <= 0) {
			continue;
		}

		const normalizedRatio = Math.max(0, ratio);
		estimatedOriginalBytes += job.originalSize;
		estimatedCompressedBytes += job.originalSize * (normalizedRatio / 100);
		jobsWithCompressionEstimate += 1;
	}

	const estimatedSavedBytes = estimatedOriginalBytes - estimatedCompressedBytes;
	const estimatedCompressionRatio =
		estimatedOriginalBytes > 0
			? (estimatedCompressedBytes / estimatedOriginalBytes) * 100
			: undefined;

	return {
		total: queueLength,
		completed: completedCount,
		processing: processingCount,
		failed: failedCount,
		pending: pendingCount,
		overallProgress: progressSum / queueLength,
		estimatedCompressedBytes,
		estimatedSavedBytes,
		estimatedCompressionRatio,
		jobsWithCompressionEstimate,
	};
}

function toQueueSnapshot(
	jobs: readonly JobState[],
): Record<WorkflowType, JobState[]> {
	const byWorkflow = {
		compress: [] as JobState[],
		extract: [] as JobState[],
		verify: [] as JobState[],
		info: [] as JobState[],
	};

	for (const job of jobs) {
		byWorkflow[job.workflow].push(job);
	}

	return byWorkflow;
}

class JobStore {
	private readonly jobsSignal = signal<JobState[]>([]);

	/** O(1) lookup index keyed by "workflow:id" */
	private readonly jobIndex = new Map<string, JobState>();

	readonly jobs: ReadonlySignal<JobState[]> = this.jobsSignal;

	readonly isProcessing = createWorkflowRecord(() => signal(false));

	readonly startRequests = createWorkflowRecord(() => signal<string[]>([]));

	readonly anyProcessing: ReadonlySignal<boolean> = computed(() =>
		WORKFLOWS.some((w) => this.isProcessing[w].value),
	);

	readonly queues = createWorkflowRecord((workflow) =>
		computed(() =>
			this.jobsSignal.value.filter((job) => job.workflow === workflow),
		),
	);

	readonly runtimeByWorkflow = createWorkflowRecord((workflow) =>
		computed<Record<string, JobRuntimeSnapshot>>(() => {
			const snapshots: Record<string, JobRuntimeSnapshot> = {};
			for (const job of this.queues[workflow].value) {
				snapshots[job.id] = {
					status: job.status.value,
					system: job.system.value,
					platformOverride: job.platformOverride.value,
				};
			}
			return snapshots;
		}),
	);

	readonly queueStats = createWorkflowRecord((workflow) =>
		computed(() => createQueueStats(this.queues[workflow].value)),
	);

	readonly queueSummaries = createWorkflowRecord((workflow) =>
		computed(() => createProgressSummary(this.queues[workflow].value)),
	);

	readonly activeJobs = computed(() =>
		this.jobsSignal.value.filter((job) => job.isProcessing.value),
	);

	readonly hasActiveJobs = computed(() => this.activeJobs.value.length > 0);

	readonly globalSummary = computed(() => createProgressSummary(this.jobsSignal.value));

	addJob(workflow: WorkflowType, job: JobProps | JobState): JobState {
		const instance = job instanceof JobState ? job : new JobState(workflow, job);
		const key = `${workflow}:${instance.id}`;
		if (this.jobIndex.has(key)) {
			return instance;
		}
		this.jobIndex.set(key, instance);
		this.jobsSignal.value = [...this.jobsSignal.value, instance];
		schedulePersist(this.jobsSignal.value);
		return instance;
	}

	removeJob(workflow: WorkflowType, id: string): void {
		this.jobIndex.delete(`${workflow}:${id}`);
		const remaining: JobState[] = [];
		for (const job of this.jobsSignal.value) {
			if (job.workflow === workflow && job.id === id) {
				job.dispose();
				continue;
			}
			remaining.push(job);
		}
		this.jobsSignal.value = remaining;
		const reqs = this.startRequests[workflow];
		if (reqs.value.includes(id)) {
			reqs.value = reqs.value.filter((r) => r !== id);
		}
		schedulePersist(remaining);
	}

	clearQueue(workflow: WorkflowType): void {
		const remaining: JobState[] = [];
		for (const job of this.jobsSignal.value) {
			if (job.workflow === workflow) {
				this.jobIndex.delete(`${workflow}:${job.id}`);
				job.dispose();
				continue;
			}
			remaining.push(job);
		}
		this.jobsSignal.value = remaining;
		this.isProcessing[workflow].value = false;
		this.startRequests[workflow].value = [];
		if (remaining.length === 0) {
			void clearPersistedQueue();
		} else {
			schedulePersist(remaining);
		}
	}

	updateJob(workflow: WorkflowType, id: string, updates: Partial<JobProps>): void {
		const job = this.getJob(workflow, id);
		if (!job) return;
		job.applyUpdates(updates);
		// Persist on status changes (structural)
		if (updates.status !== undefined) {
			schedulePersist(this.jobsSignal.value);
		}
	}

	appendLog(workflow: WorkflowType, id: string, line: string): void {
		const job = this.getJob(workflow, id);
		job?.appendLog(line);
	}

	retryFailed(workflow: WorkflowType): string[] {
		const retriedIds: string[] = [];
		for (const job of this.queues[workflow].value) {
			if (job.status.value !== "failed") continue;
			job.resetForRetry();
			retriedIds.push(job.id);
		}
		if (retriedIds.length > 0) {
			const reqs = this.startRequests[workflow];
			const current = new Set(reqs.value);
			for (const id of retriedIds) {
				current.add(id);
			}
			reqs.value = Array.from(current);
			schedulePersist(this.jobsSignal.value);
		}
		return retriedIds;
	}

	getQueue(workflow: WorkflowType): JobState[] {
		return this.queues[workflow].value;
	}

	getAllQueuesSnapshot(): Record<WorkflowType, JobState[]> {
		return toQueueSnapshot(this.jobsSignal.value);
	}

	getJob(workflow: WorkflowType, id: string): JobState | undefined {
		return this.jobIndex.get(`${workflow}:${id}`);
	}

	getJobById(id: string): JobState | undefined {
		// Try each workflow's key since we don't know the workflow
		for (const w of WORKFLOWS) {
			const job = this.jobIndex.get(`${w}:${id}`);
			if (job) return job;
		}
		return undefined;
	}

	getWorkflowByJobId(id: string): WorkflowType | undefined {
		return this.getJobById(id)?.workflow;
	}

	setProcessing(workflow: WorkflowType, value: boolean): void {
		this.isProcessing[workflow].value = value;
	}

	requestStart(workflow: WorkflowType, id: string): void {
		const reqs = this.startRequests[workflow];
		if (!reqs.value.includes(id)) {
			reqs.value = [...reqs.value, id];
		}
	}

	consumeStartRequest(workflow: WorkflowType, id: string): void {
		const reqs = this.startRequests[workflow];
		const idx = reqs.value.indexOf(id);
		if (idx !== -1) {
			reqs.value = reqs.value.filter((r) => r !== id);
		}
	}

	/** Restore queue from disk. Processing jobs marked as failed. */
	async rehydrate(): Promise<void> {
		try {
			const persisted = await loadPersistedQueue();
			if (!persisted) return;

			let count = 0;
			for (const [workflow, jobs] of Object.entries(persisted)) {
				for (const jobProps of jobs) {
					this.addJob(workflow as WorkflowType, jobProps);
					count += 1;
				}
			}

			if (count > 0) {
				console.log(`[JobStore] Rehydrated ${count} jobs from disk`);
			}
		} catch (e) {
			console.error("[JobStore] Failed to rehydrate queue:", e);
		}
	}
}

export const jobStore = new JobStore();

export function getEmptyWorkflowQueues(): Record<WorkflowType, JobState[]> {
	return toQueueSnapshot([]);
}

export function getWorkflowOrder(): readonly WorkflowType[] {
	return WORKFLOWS;
}
