import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { JobProps } from "@/domain/entities/Job";
import type { Platform } from "@/domain/types/platform.types";
import type { JobStatus, WorkflowType } from "@/domain/types/workflow.types";
import { useJobDataStore, type JobDataEntry } from "@/stores/useJobDataStore";
import { useJobLogStore } from "@/stores/useJobLogStore";

export type { JobStatus, WorkflowType };

/**
 * Lightweight job state consumed by high-frequency UI (table/progress/status).
 * Heavy metadata (path/strategy/hash/metadata blobs) lives in useJobDataStore.
 */
export interface Job {
	id: string;
	filename: string;
	system: string;
	status: JobStatus;
	progress: number;
	originalSize: number;
	compressedSize?: number;
	errorMessage?: string;
	startTime?: number;
	etaSeconds?: number;
	platformOverride?: Platform;
}

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

	addJob: (workflow: WorkflowType, job: JobProps) => void;
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

	getQueue: (workflow: WorkflowType) => Job[];
	getJob: (workflow: WorkflowType, id: string) => Job | undefined;
}

function toJobState(job: JobProps): Job {
	return {
		id: job.id,
		filename: job.filename,
		system: job.system,
		status: job.status,
		progress: job.progress,
		originalSize: job.originalSize,
		compressedSize: job.compressedSize,
		errorMessage: job.errorMessage,
		startTime: job.startTime,
		etaSeconds: job.etaSeconds,
		platformOverride: job.platformOverride,
	};
}

function toJobData(job: JobProps): JobDataEntry {
	return {
		path: job.path,
		strategy: job.strategy,
		discGroup: job.discGroup,
		discNumber: job.discNumber,
		sourceHash: job.sourceHash,
		verificationResult: job.verificationResult,
		gameId: job.gameId,
		gameTitle: job.gameTitle,
		region: job.region,
	};
}

function splitUpdates(updates: Partial<JobProps>): {
	stateUpdates: Partial<Job>;
	dataUpdates: Partial<JobDataEntry>;
	shouldClearLogs: boolean;
} {
	const stateUpdates: Partial<Job> = {};
	const dataUpdates: Partial<JobDataEntry> = {};

	if (updates.filename !== undefined) stateUpdates.filename = updates.filename;
	if (updates.system !== undefined) stateUpdates.system = updates.system;
	if (updates.status !== undefined) stateUpdates.status = updates.status;
	if (updates.progress !== undefined) stateUpdates.progress = updates.progress;
	if (updates.originalSize !== undefined)
		stateUpdates.originalSize = updates.originalSize;
	if (updates.compressedSize !== undefined)
		stateUpdates.compressedSize = updates.compressedSize;
	if (updates.errorMessage !== undefined)
		stateUpdates.errorMessage = updates.errorMessage;
	if (updates.startTime !== undefined)
		stateUpdates.startTime = updates.startTime;
	if (updates.etaSeconds !== undefined)
		stateUpdates.etaSeconds = updates.etaSeconds;
	if (updates.platformOverride !== undefined)
		stateUpdates.platformOverride = updates.platformOverride;

	if (updates.path !== undefined) dataUpdates.path = updates.path;
	if (updates.strategy !== undefined) dataUpdates.strategy = updates.strategy;
	if (updates.discGroup !== undefined)
		dataUpdates.discGroup = updates.discGroup;
	if (updates.discNumber !== undefined)
		dataUpdates.discNumber = updates.discNumber;
	if (updates.sourceHash !== undefined)
		dataUpdates.sourceHash = updates.sourceHash;
	if (updates.verificationResult !== undefined)
		dataUpdates.verificationResult = updates.verificationResult;
	if (updates.gameId !== undefined) dataUpdates.gameId = updates.gameId;
	if (updates.gameTitle !== undefined)
		dataUpdates.gameTitle = updates.gameTitle;
	if (updates.region !== undefined) dataUpdates.region = updates.region;

	const shouldClearLogs =
		Array.isArray(updates.outputLog) && updates.outputLog.length === 0;

	return { stateUpdates, dataUpdates, shouldClearLogs };
}

export const useJobStateStore = create<QueueState>()(
	immer((set, get) => ({
		queues: createEmptyQueues(),
		isProcessing: createEmptyProcessing(),
		startRequests: createEmptyStartRequests(),

		addJob: (workflow, job) => {
			set((state) => {
				state.queues[workflow].push(toJobState(job));
			});
			useJobDataStore.getState().upsertJobData(job.id, toJobData(job));
		},

		removeJob: (workflow, id) => {
			set((state) => {
				const queue = state.queues[workflow];
				const idx = queue.findIndex((j) => j.id === id);
				if (idx !== -1) {
					queue.splice(idx, 1);
				}
				state.startRequests[workflow] = state.startRequests[workflow].filter(
					(requestedId) => requestedId !== id,
				);
			});
			useJobDataStore.getState().removeJobData(id);
			useJobLogStore.getState().clearJobLogs(id);
		},

		updateJob: (workflow, id, updates) => {
			const { stateUpdates, dataUpdates, shouldClearLogs } =
				splitUpdates(updates);

			if (Object.keys(stateUpdates).length > 0) {
				set((state) => {
					const job = state.queues[workflow].find((j) => j.id === id);
					if (job) {
						Object.assign(job, stateUpdates);
					}
				});
			}

			if (Object.keys(dataUpdates).length > 0) {
				useJobDataStore.getState().updateJobData(id, dataUpdates);
			}

			if (shouldClearLogs) {
				useJobLogStore.getState().clearJobLogs(id);
			}
		},

		clearQueue: (workflow) => {
			const jobIds = get().queues[workflow].map((job) => job.id);
			set((state) => {
				state.queues[workflow] = [];
				state.isProcessing[workflow] = false;
				state.startRequests[workflow] = [];
			});
			useJobDataStore.getState().clearJobs(jobIds);
			useJobLogStore.getState().clearLogsForJobs(jobIds);
		},

		appendLog: (_workflow, id, line) => {
			useJobLogStore.getState().appendLog(id, line);
		},

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

		retryFailed: (workflow) => {
			const failedJobIds = get()
				.queues[workflow].filter((job) => job.status === "failed")
				.map((job) => job.id);

			set((state) => {
				for (const job of state.queues[workflow]) {
					if (job.status === "failed") {
						job.status = "pending";
						job.progress = 0;
						job.errorMessage = undefined;
						job.etaSeconds = undefined;
						job.startTime = undefined;
						if (!state.startRequests[workflow].includes(job.id)) {
							state.startRequests[workflow].push(job.id);
						}
					}
				}
			});

			useJobLogStore.getState().clearLogsForJobs(failedJobIds);
		},

		getQueue: (workflow) => get().queues[workflow],

		getJob: (workflow, id) => get().queues[workflow].find((j) => j.id === id),
	})),
);
