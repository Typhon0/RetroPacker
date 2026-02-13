import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { JobProps } from "@/domain/entities/Job";
import type { JobStatus, WorkflowType } from "@/domain/types/workflow.types";

// Re-export domain types for backward compatibility
export type { JobStatus, WorkflowType };

/**
 * Mutable version of JobProps for Zustand store state.
 * Domain JobProps uses `readonly` modifiers, but Zustand
 * needs mutable state for efficient updates.
 */
export type Job = {
	-readonly [K in keyof JobProps]: JobProps[K] extends readonly (infer U)[]
		? U[]
		: JobProps[K];
};

const MAX_LOG_LINES_PER_JOB = 2000;

// Empty queue template
const createEmptyQueues = (): Record<WorkflowType, Job[]> => ({
	compress: [],
	extract: [],
	verify: [],
	info: [],
});

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
	queues: Record<WorkflowType, Job[]>;
	isProcessing: Record<WorkflowType, boolean>;
	startRequests: Record<WorkflowType, string[]>;

	// Actions
	addJob: (workflow: WorkflowType, job: Job) => void;
	removeJob: (workflow: WorkflowType, id: string) => void;
	updateJob: (
		workflow: WorkflowType,
		id: string,
		updates: Partial<Job>,
	) => void;
	clearQueue: (workflow: WorkflowType) => void;
	appendLog: (workflow: WorkflowType, id: string, line: string) => void;
	setProcessing: (workflow: WorkflowType, isProcessing: boolean) => void;
	requestStart: (workflow: WorkflowType, id: string) => void;
	consumeStartRequest: (workflow: WorkflowType, id: string) => void;

	// Helpers
	getQueue: (workflow: WorkflowType) => Job[];
	getJob: (workflow: WorkflowType, id: string) => Job | undefined;
}

export const useQueueStore = create<QueueState>()(
	immer((set, get) => ({
		queues: createEmptyQueues(),
		isProcessing: createEmptyProcessing(),
		startRequests: createEmptyStartRequests(),

		addJob: (workflow, job) =>
			set((state) => {
				state.queues[workflow].push(job);
			}),

		removeJob: (workflow, id) =>
			set((state) => {
				const queue = state.queues[workflow];
				const idx = queue.findIndex((j) => j.id === id);
				if (idx !== -1) {
					queue.splice(idx, 1);
				}
				state.startRequests[workflow] = state.startRequests[workflow].filter(
					(requestedId) => requestedId !== id,
				);
			}),

		updateJob: (workflow, id, updates) =>
			set((state) => {
				const job = state.queues[workflow].find((j) => j.id === id);
				if (job) {
					Object.assign(job, updates);
				}
			}),

		clearQueue: (workflow) =>
			set((state) => {
				state.queues[workflow] = [];
				state.isProcessing[workflow] = false;
				state.startRequests[workflow] = [];
			}),

		appendLog: (workflow, id, line) =>
			set((state) => {
				const job = state.queues[workflow].find((j) => j.id === id);
				if (job) {
					job.outputLog.push(line);
					const overflow = job.outputLog.length - MAX_LOG_LINES_PER_JOB;
					if (overflow > 0) {
						job.outputLog.splice(0, overflow);
					}
				}
			}),

		setProcessing: (workflow, isProcessing) =>
			set((state) => {
				state.isProcessing[workflow] = isProcessing;
			}),

		requestStart: (workflow, id) =>
			set((state) => {
				if (!state.startRequests[workflow].includes(id)) {
					state.startRequests[workflow].push(id);
				}
			}),

		consumeStartRequest: (workflow, id) =>
			set((state) => {
				const idx = state.startRequests[workflow].indexOf(id);
				if (idx !== -1) {
					state.startRequests[workflow].splice(idx, 1);
				}
			}),

		getQueue: (workflow) => get().queues[workflow],

		getJob: (workflow, id) => get().queues[workflow].find((j) => j.id === id),
	})),
);
