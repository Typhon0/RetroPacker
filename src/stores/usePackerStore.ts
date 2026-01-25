import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CompressionPreset = 'balanced' | 'max' | 'fast' | 'raw';

interface PackerState {
    preset: CompressionPreset;
    concurrency: number;
    setPreset: (preset: CompressionPreset) => void;
    setConcurrency: (con: number) => void;
}

export const usePackerStore = create<PackerState>()(
    persist(
        (set) => ({
            preset: 'balanced',
            concurrency: 2, // Default, logic should update this on init
            setPreset: (preset) => set({ preset }),
            setConcurrency: (concurrency) => set({ concurrency }),
        }),
        {
            name: 'retropacker-settings',
        }
    )
);
