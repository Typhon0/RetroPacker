import { create } from "zustand";
import { persist } from "zustand/middleware";
import { WorkflowType } from "./useQueueStore";

export type CompressionPreset = "balanced" | "max" | "fast" | "raw" | "custom";
export type MediaType = "auto" | "cd" | "dvd" | "hdd" | "ld" | "raw";
export type Platform =
	| "auto"
	| "ps1"
	| "ps2"
	| "saturn"
	| "dreamcast"
	| "gamecube"
	| "wii";

// Tool-specific settings
export interface ChdSettings {
	hunkSize?: number; // Bytes (e.g., 2048)
	mediaType: MediaType;
}

export interface DolphinSettings {
	blockSize: number; // Bytes (e.g., 131072 for 128KB)
	format: "rvz" | "iso" | "gcz" | "wia";
	compressionAlgorithm: "zstd" | "lzma" | "none";
	scrub: boolean;
	verifyAlgorithm: "md5" | "sha1" | "crc32";
	extractGameOnly: boolean;
}

interface PackerState {
	// UI State
	activeWorkflow: WorkflowType;

	// Common Settings
	preset: CompressionPreset;
	concurrency: number;
	customCompression: string;

	// Tool Specific
	chd: ChdSettings;
	dolphin: DolphinSettings;

	// Platform for disambiguation
	platform: Platform;

	// Delete source setting
	deleteSourceAfterSuccess: boolean;

	// Actions
	setActiveWorkflow: (workflow: WorkflowType) => void;
	setPreset: (preset: CompressionPreset) => void;
	setConcurrency: (con: number) => void;
	setCustomCompression: (val: string) => void;

	// CHD Actions - Type-safe setting update
	setChdSetting: <K extends keyof ChdSettings>(
		key: K,
		value: ChdSettings[K],
	) => void;

	// Dolphin Actions - Type-safe setting update
	setDolphinSetting: <K extends keyof DolphinSettings>(
		key: K,
		value: DolphinSettings[K],
	) => void;

	setPlatform: (platform: Platform) => void;

	setDeleteSourceAfterSuccess: (val: boolean) => void;
}

export const usePackerStore = create<PackerState>()(
	persist(
		(set) => ({
			// UI State
			activeWorkflow: "compress" as WorkflowType,

			preset: "balanced",
			concurrency: 2,
			customCompression: "lzma,zlib,huff",

			// Defaults
			chd: {
				hunkSize: undefined,
				mediaType: "auto",
			},
			dolphin: {
				blockSize: 131072, // 128KB default
				format: "rvz",
				compressionAlgorithm: "zstd",
				scrub: false,
				verifyAlgorithm: "md5",
				extractGameOnly: false,
			},

			platform: "auto",

			deleteSourceAfterSuccess: false,

			setActiveWorkflow: (activeWorkflow) => set({ activeWorkflow }),
			setPreset: (preset) => set({ preset }),
			setConcurrency: (concurrency) => set({ concurrency }),
			setCustomCompression: (customCompression) => set({ customCompression }),

			setChdSetting: (key, value) =>
				set((state) => ({
					chd: { ...state.chd, [key]: value },
				})),

			setDolphinSetting: (key, value) =>
				set((state) => ({
					dolphin: { ...state.dolphin, [key]: value },
				})),

			setPlatform: (platform) => set({ platform }),

			setDeleteSourceAfterSuccess: (deleteSourceAfterSuccess) =>
				set({ deleteSourceAfterSuccess }),
		}),
		{
			name: "retropacker-settings",
			version: 3, // Increment version for tab-based migration
		},
	),
);
