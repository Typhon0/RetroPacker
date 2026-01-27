import { create } from 'zustand';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Job {
    id: string;
    filename: string;
    path: string;
    system: string; // e.g., 'PS2', 'DC'
    status: JobStatus;
    progress: number;
    originalSize: number;
    compressedSize?: number;
    outputLog: string[];
    errorMessage?: string;
    strategy: 'createcd' | 'createdvd' | 'raw';
    startTime?: number;
    etaSeconds?: number;
}

interface QueueState {
    queue: Job[];
    isProcessing: boolean;
    addJob: (job: Job) => void;
    removeJob: (id: string) => void;
    updateJob: (id: string, updates: Partial<Job>) => void;
    clearQueue: () => void;
    appendLog: (id: string, line: string) => void;
    setProcessing: (isProcessing: boolean) => void;
}

export const useQueueStore = create<QueueState>((set) => ({
    queue: [],
    addJob: (job) => set((state) => ({ queue: [...state.queue, job] })),
    removeJob: (id) => set((state) => ({ queue: state.queue.filter((j) => j.id !== id) })),
    updateJob: (id, updates) =>
        set((state) => ({
            queue: state.queue.map((j) => (j.id === id ? { ...j, ...updates } : j)),
        })),
    clearQueue: () => set({ queue: [] }),
    appendLog: (id, line) =>
        set((state) => ({
            queue: state.queue.map((j) =>
                j.id === id ? { ...j, outputLog: [...j.outputLog, line] } : j
            ),
        })),
    isProcessing: false,
    setProcessing: (isProcessing) => set({ isProcessing }),
}));
