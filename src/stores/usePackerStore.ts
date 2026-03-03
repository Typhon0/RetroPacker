import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Platform } from "@/domain/types/platform.types";
import type {
	ChdSettings,
	CompressionPreset,
	DolphinSettings,
	MediaType,
} from "@/domain/types/settings.types";
import type { WorkflowType } from "@/domain/types/workflow.types";

// Re-export domain types for backward compatibility
export type {
	CompressionPreset,
	MediaType,
	Platform,
	ChdSettings,
	DolphinSettings,
};

type DetectionTraceFlagHost = typeof globalThis & {
	__RETROPACKER_DETECT_TRACE__?: boolean;
};

function setDetectionTraceGlobalFlag(enabled: boolean): void {
	(globalThis as DetectionTraceFlagHost).__RETROPACKER_DETECT_TRACE__ = enabled;
}

setDetectionTraceGlobalFlag(false);

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

	// Skip existing output files
	skipExisting: boolean;

	// Detection diagnostics
	enableDetectionTracing: boolean;

	// Output directory (empty = same as source)
	outputDirectory: string;

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

	setSkipExisting: (val: boolean) => void;

	setEnableDetectionTracing: (val: boolean) => void;

	setOutputDirectory: (dir: string) => void;
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

			skipExisting: false,

			enableDetectionTracing: false,

			outputDirectory: "",

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

			setSkipExisting: (skipExisting) => set({ skipExisting }),

			setEnableDetectionTracing: (enableDetectionTracing) => {
				setDetectionTraceGlobalFlag(enableDetectionTracing);
				set({ enableDetectionTracing });
			},

			setOutputDirectory: (outputDirectory) => set({ outputDirectory }),
		}),
		{
			name: "retropacker-settings",
			version: 5,
			onRehydrateStorage: () => (state) => {
				setDetectionTraceGlobalFlag(state?.enableDetectionTracing ?? false);
			},
		},
	),
);
