import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { JobProps } from "@/domain/entities/Job";
import { JobState } from "@/domain/entities/JobState";
import type { JobStatus, WorkflowType } from "@/domain/types/workflow.types";
import { getEmptyWorkflowQueues, jobStore } from "@/stores/JobStore";

export type { JobStatus, WorkflowType };
export type Job = JobState;

const createEmptyProcessing = (): Record<WorkflowType, boolean> => ({
	compress: false,
	extract: false,
	verify: false,
	info: false,
});

const createEmptyStartRequests = (): Record<WorkflowType, string[]> => ({
	compress: [],
	extract: [],
	verify: [],
	info: [],
});

interface QueueState {
	queues: Record<WorkflowType, JobState[]>;
	isProcessing: Record<WorkflowType, boolean>;
	startRequests: Record<WorkflowType, string[]>;

	addJob: (workflow: WorkflowType, job: JobProps) => JobState;
	removeJob: (workflow: WorkflowType, id: string) => void;
	updateJob: (
		workflow: WorkflowType,
		id: string,
		updates: Partial<JobProps>,
	) => void;
	clearQueue: (workflow: WorkflowType) => void;
	appendLog: (workflow: WorkflowType, id: string, line: string) => void;
	setProcessing: (workflow: WorkflowType, isProcessing: boolean) => void;
	requestStart: (workflow: WorkflowType, id: string) => void;
	consumeStartRequest: (workflow: WorkflowType, id: string) => void;
	retryFailed: (workflow: WorkflowType) => void;

	getQueue: (workflow: WorkflowType) => JobState[];
	getJob: (workflow: WorkflowType, id: string) => JobState | undefined;
}

export const useJobStateStore = create<QueueState>()(
	immer((set) => ({
		queues: jobStore.getAllQueuesSnapshot(),
		isProcessing: createEmptyProcessing(),
		startRequests: createEmptyStartRequests(),

		addJob: (workflow, job) => {
			return jobStore.addJob(workflow, job);
		},

		removeJob: (workflow, id) => {
			jobStore.removeJob(workflow, id);
			set((state) => {
				state.startRequests[workflow] = state.startRequests[workflow].filter(
					(requestedId) => requestedId !== id,
				);
			});
		},

		updateJob: (workflow, id, updates) => {
			jobStore.updateJob(workflow, id, updates);
		},

		clearQueue: (workflow) => {
			jobStore.clearQueue(workflow);
			set((state) => {
				state.isProcessing[workflow] = false;
				state.startRequests[workflow] = [];
			});
		},

		appendLog: (workflow, id, line) => {
			jobStore.appendLog(workflow, id, line);
		},

		setProcessing: (workflow, isProcessing) => {
			set((state) => {
				state.isProcessing[workflow] = isProcessing;
			});
		},

		requestStart: (workflow, id) => {
			set((state) => {
				if (!state.startRequests[workflow].includes(id)) {
					state.startRequests[workflow].push(id);
				}
			});
		},

		consumeStartRequest: (workflow, id) => {
			set((state) => {
				const idx = state.startRequests[workflow].indexOf(id);
				if (idx !== -1) {
					state.startRequests[workflow].splice(idx, 1);
				}
			});
		},

		retryFailed: (workflow) => {
			const retriedIds = jobStore.retryFailed(workflow);
			if (retriedIds.length === 0) return;

			set((state) => {
				for (const id of retriedIds) {
					if (!state.startRequests[workflow].includes(id)) {
						state.startRequests[workflow].push(id);
					}
				}
			});
		},

		getQueue: (workflow) => jobStore.getQueue(workflow),

		getJob: (workflow, id) => jobStore.getJob(workflow, id),
	})),
);

jobStore.jobs.subscribe(() => {
	useJobStateStore.setState((state) => ({
		...state,
		queues: jobStore.getAllQueuesSnapshot(),
	}));
});

export const EMPTY_QUEUES = getEmptyWorkflowQueues();
