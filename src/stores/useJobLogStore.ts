import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

const MAX_LOG_LINES_PER_JOB = 2000;
const LOG_FLUSH_INTERVAL_MS = 500;
const LOG_BATCH_SIZE = 10;

export const EMPTY_JOB_LOGS: readonly string[] = Object.freeze([]);

const logBuffers = new Map<string, string[]>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearFlushTimer(jobId: string): void {
	const timer = flushTimers.get(jobId);
	if (timer) {
		clearTimeout(timer);
		flushTimers.delete(jobId);
	}
}

function clearBufferedLogs(jobId: string): void {
	clearFlushTimer(jobId);
	logBuffers.delete(jobId);
}

interface JobLogState {
	logsByJobId: Record<string, string[]>;
	appendLog: (jobId: string, line: string) => void;
	appendLogs: (jobId: string, lines: readonly string[]) => void;
	flushBufferedLogs: (jobId: string) => void;
	clearJobLogs: (jobId: string) => void;
	clearLogsForJobs: (jobIds: readonly string[]) => void;
	getLogs: (jobId: string) => readonly string[];
}

export const useJobLogStore = create<JobLogState>()(
	immer((set, get) => ({
		logsByJobId: {},

		appendLog: (jobId, line) => {
			const buffer = logBuffers.get(jobId);
			if (buffer) {
				buffer.push(line);
			} else {
				logBuffers.set(jobId, [line]);
			}

			const activeBuffer = logBuffers.get(jobId);
			if (!activeBuffer) return;

			if (activeBuffer.length >= LOG_BATCH_SIZE) {
				get().flushBufferedLogs(jobId);
				return;
			}

			if (!flushTimers.has(jobId)) {
				const timer = setTimeout(() => {
					useJobLogStore.getState().flushBufferedLogs(jobId);
				}, LOG_FLUSH_INTERVAL_MS);
				flushTimers.set(jobId, timer);
			}
		},

		appendLogs: (jobId, lines) => {
			if (lines.length === 0) return;

			set((state) => {
				const logs = state.logsByJobId[jobId] ?? [];
				if (!state.logsByJobId[jobId]) {
					state.logsByJobId[jobId] = logs;
				}
				logs.push(...lines);
				const overflow = logs.length - MAX_LOG_LINES_PER_JOB;
				if (overflow > 0) {
					logs.splice(0, overflow);
				}
			});
		},

		flushBufferedLogs: (jobId) => {
			clearFlushTimer(jobId);
			const buffer = logBuffers.get(jobId);
			if (!buffer || buffer.length === 0) {
				logBuffers.delete(jobId);
				return;
			}

			logBuffers.delete(jobId);
			get().appendLogs(jobId, buffer);
		},

		clearJobLogs: (jobId) => {
			clearBufferedLogs(jobId);
			set((state) => {
				delete state.logsByJobId[jobId];
			});
		},

		clearLogsForJobs: (jobIds) => {
			if (jobIds.length === 0) return;

			for (const jobId of jobIds) {
				clearBufferedLogs(jobId);
			}

			set((state) => {
				for (const jobId of jobIds) {
					delete state.logsByJobId[jobId];
				}
			});
		},

		getLogs: (jobId) => get().logsByJobId[jobId] ?? EMPTY_JOB_LOGS,
	})),
);
