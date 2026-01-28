import { create } from "zustand";

export type JobStatus = "pending" | "processing" | "completed" | "failed";
export type WorkflowType = "compress" | "extract" | "verify" | "info";

export interface Job {
	id: string;
	filename: string;
	path: string;
	system: string; // e.g., 'PS2', 'DC', 'Wii'
	status: JobStatus;
	progress: number;
	originalSize: number;
	compressedSize?: number;
	outputLog: string[];
	errorMessage?: string;
	strategy: "createcd" | "createdvd" | "raw";
	startTime?: number;
	etaSeconds?: number;
	// Multi-disc grouping
	discGroup?: string;
	discNumber?: number;
	// Verification
	sourceHash?: string;
	verificationResult?: "pass" | "fail" | "unknown";
	// Per-job platform override
	platformOverride?:
		| "auto"
		| "ps1"
		| "ps2"
		| "saturn"
		| "dreamcast"
		| "gamecube"
		| "wii";
	// Info results (for info workflow)
	gameId?: string;
	gameTitle?: string;
	region?: string;
}

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

interface QueueState {
	queues: Record<WorkflowType, Job[]>;
	isProcessing: Record<WorkflowType, boolean>;

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

	// Helpers
	getQueue: (workflow: WorkflowType) => Job[];
	getJob: (workflow: WorkflowType, id: string) => Job | undefined;
}

export const useQueueStore = create<QueueState>((set, get) => ({
	queues: createEmptyQueues(),
	isProcessing: createEmptyProcessing(),

	addJob: (workflow, job) =>
		set((state) => ({
			queues: {
				...state.queues,
				[workflow]: [...state.queues[workflow], job],
			},
		})),

	removeJob: (workflow, id) =>
		set((state) => ({
			queues: {
				...state.queues,
				[workflow]: state.queues[workflow].filter((j) => j.id !== id),
			},
		})),

	updateJob: (workflow, id, updates) =>
		set((state) => ({
			queues: {
				...state.queues,
				[workflow]: state.queues[workflow].map((j) =>
					j.id === id ? { ...j, ...updates } : j,
				),
			},
		})),

	clearQueue: (workflow) =>
		set((state) => ({
			queues: {
				...state.queues,
				[workflow]: [],
			},
		})),

	appendLog: (workflow, id, line) =>
		set((state) => ({
			queues: {
				...state.queues,
				[workflow]: state.queues[workflow].map((j) =>
					j.id === id ? { ...j, outputLog: [...j.outputLog, line] } : j,
				),
			},
		})),

	setProcessing: (workflow, isProcessing) =>
		set((state) => ({
			isProcessing: {
				...state.isProcessing,
				[workflow]: isProcessing,
			},
		})),

	getQueue: (workflow) => get().queues[workflow],

	getJob: (workflow, id) => get().queues[workflow].find((j) => j.id === id),
}));
