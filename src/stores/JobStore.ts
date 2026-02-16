import { computed, signal, type ReadonlySignal } from "@preact/signals-core";
import { JobState } from "@/domain/entities/JobState";
import type { JobProps } from "@/domain/entities/Job";
import type { Platform } from "@/domain/types/platform.types";
import type { JobStatus, WorkflowType } from "@/domain/types/workflow.types";

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
		};
	}

	let progressSum = 0;
	for (const job of queue) {
		const status = job.status.value;
		if (status === "completed") {
			progressSum += 100;
			continue;
		}
		if (status === "processing") {
			progressSum += job.progress.value;
		}
	}

	return {
		total: queueLength,
		completed: completedCount,
		processing: processingCount,
		failed: failedCount,
		pending: pendingCount,
		overallProgress: progressSum / queueLength,
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

	readonly jobs: ReadonlySignal<JobState[]> = this.jobsSignal;

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
		if (this.getJob(workflow, instance.id)) {
			return instance;
		}
		this.jobsSignal.value = [...this.jobsSignal.value, instance];
		return instance;
	}

	removeJob(workflow: WorkflowType, id: string): void {
		this.jobsSignal.value = this.jobsSignal.value.filter((job) => {
			return !(job.workflow === workflow && job.id === id);
		});
	}

	clearQueue(workflow: WorkflowType): void {
		this.jobsSignal.value = this.jobsSignal.value.filter(
			(job) => job.workflow !== workflow,
		);
	}

	updateJob(workflow: WorkflowType, id: string, updates: Partial<JobProps>): void {
		const job = this.getJob(workflow, id);
		if (!job) return;
		job.applyUpdates(updates);
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
		return retriedIds;
	}

	getQueue(workflow: WorkflowType): JobState[] {
		return this.queues[workflow].value;
	}

	getAllQueuesSnapshot(): Record<WorkflowType, JobState[]> {
		return toQueueSnapshot(this.jobsSignal.value);
	}

	getJob(workflow: WorkflowType, id: string): JobState | undefined {
		return this.queues[workflow].value.find((job) => job.id === id);
	}

	getJobById(id: string): JobState | undefined {
		return this.jobsSignal.value.find((job) => job.id === id);
	}

	getWorkflowByJobId(id: string): WorkflowType | undefined {
		return this.getJobById(id)?.workflow;
	}
}

export const jobStore = new JobStore();

export function getEmptyWorkflowQueues(): Record<WorkflowType, JobState[]> {
	return toQueueSnapshot([]);
}

export function getWorkflowOrder(): readonly WorkflowType[] {
	return WORKFLOWS;
}
