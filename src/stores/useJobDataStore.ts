import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { VerificationResult } from "@/domain/types/workflow.types";
import type { CompressionStrategy } from "@/domain/types/workflow.types";

export interface JobDataEntry {
	path: string;
	strategy: CompressionStrategy;
	discGroup?: string;
	discNumber?: number;
	sourceHash?: string;
	verificationResult?: VerificationResult;
	gameId?: string;
	gameTitle?: string;
	region?: string;
}

interface JobDataState {
	jobDataById: Record<string, JobDataEntry>;
	upsertJobData: (jobId: string, data: JobDataEntry) => void;
	updateJobData: (jobId: string, updates: Partial<JobDataEntry>) => void;
	removeJobData: (jobId: string) => void;
	clearJobs: (jobIds: readonly string[]) => void;
	getJobData: (jobId: string) => JobDataEntry | undefined;
}

export const useJobDataStore = create<JobDataState>()(
	immer((set, get) => ({
		jobDataById: {},

		upsertJobData: (jobId, data) =>
			set((state) => {
				state.jobDataById[jobId] = data;
			}),

		updateJobData: (jobId, updates) =>
			set((state) => {
				const existing = state.jobDataById[jobId];
				if (!existing) return;
				Object.assign(existing, updates);
			}),

		removeJobData: (jobId) =>
			set((state) => {
				delete state.jobDataById[jobId];
			}),

		clearJobs: (jobIds) => {
			if (jobIds.length === 0) return;
			set((state) => {
				for (const jobId of jobIds) {
					delete state.jobDataById[jobId];
				}
			});
		},

		getJobData: (jobId) => get().jobDataById[jobId],
	})),
);
