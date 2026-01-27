import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CompressionPreset = 'balanced' | 'max' | 'fast' | 'raw' | 'custom';
export type JobMode = 'create' | 'extract' | 'verify' | 'info';
export type MediaType = 'auto' | 'cd' | 'dvd' | 'hdd' | 'ld' | 'raw';

interface PackerState {
    preset: CompressionPreset;
    concurrency: number;
    customCompression: string;
    hunkSize: number | undefined;

    // New Multi-Mode State
    jobMode: JobMode;
    mediaType: MediaType;

    setPreset: (preset: CompressionPreset) => void;
    setConcurrency: (con: number) => void;
    setCustomCompression: (val: string) => void;
    setHunkSize: (num: number | undefined) => void;

    setJobMode: (mode: JobMode) => void;
    setMediaType: (type: MediaType) => void;
}

export const usePackerStore = create<PackerState>()(
    persist(
        (set) => ({
            preset: 'balanced',
            concurrency: 2,
            customCompression: 'lzma,zlib,huff',
            hunkSize: undefined,

            jobMode: 'create',
            mediaType: 'auto',

            setPreset: (preset) => set({ preset }),
            setConcurrency: (concurrency) => set({ concurrency }),
            setCustomCompression: (customCompression) => set({ customCompression }),
            setHunkSize: (hunkSize) => set({ hunkSize }),

            setJobMode: (jobMode) => set({ jobMode }),
            setMediaType: (mediaType) => set({ mediaType }),
        }),
        {
            name: 'retropacker-settings',
        }
    )
);
