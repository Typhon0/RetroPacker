/**
 * Repository Interface - Settings Repository
 * Contract for application settings persistence.
 *
 * @module domain/repositories/ISettingsRepository
 */

import {
	CompressionPreset,
	ChdSettings,
	DolphinSettings,
} from "../types/settings.types";
import { Platform } from "../types/platform.types";
import { WorkflowType } from "../types/workflow.types";

/**
 * Application settings state.
 */
export interface AppSettings {
	/** Current active workflow tab. */
	readonly activeWorkflow: WorkflowType;
	/** Compression preset. */
	readonly preset: CompressionPreset;
	/** Number of concurrent jobs. */
	readonly concurrency: number;
	/** Custom compression codec string. */
	readonly customCompression: string;
	/** CHD-specific settings. */
	readonly chd: ChdSettings;
	/** Dolphin-specific settings. */
	readonly dolphin: DolphinSettings;
	/** Default platform for disambiguation. */
	readonly platform: Platform;
	/** Whether to delete source files after success. */
	readonly deleteSourceAfterSuccess: boolean;
}

/**
 * Settings Repository Interface
 *
 * Abstracts settings persistence, allowing for:
 * - Different implementations (Zustand, LocalStorage, Mock)
 * - Easy testing with mock implementations
 * - Dependency inversion for clean architecture
 */
export interface ISettingsRepository {
	/**
	 * Get all current settings.
	 *
	 * @returns Current application settings
	 */
	getSettings(): AppSettings;

	/**
	 * Get the current active workflow.
	 *
	 * @returns Active workflow type
	 */
	getActiveWorkflow(): WorkflowType;

	/**
	 * Set the active workflow.
	 *
	 * @param workflow - Workflow to make active
	 */
	setActiveWorkflow(workflow: WorkflowType): void;

	/**
	 * Get the current compression preset.
	 *
	 * @returns Current preset
	 */
	getPreset(): CompressionPreset;

	/**
	 * Set the compression preset.
	 *
	 * @param preset - Preset to set
	 */
	setPreset(preset: CompressionPreset): void;

	/**
	 * Get the current concurrency setting.
	 *
	 * @returns Number of concurrent jobs
	 */
	getConcurrency(): number;

	/**
	 * Set the concurrency level.
	 *
	 * @param concurrency - Number of concurrent jobs
	 */
	setConcurrency(concurrency: number): void;

	/**
	 * Get CHD settings.
	 *
	 * @returns CHD settings
	 */
	getChdSettings(): ChdSettings;

	/**
	 * Update a CHD setting.
	 *
	 * @param key - Setting key
	 * @param value - Setting value
	 */
	setChdSetting<K extends keyof ChdSettings>(
		key: K,
		value: ChdSettings[K],
	): void;

	/**
	 * Get Dolphin settings.
	 *
	 * @returns Dolphin settings
	 */
	getDolphinSettings(): DolphinSettings;

	/**
	 * Update a Dolphin setting.
	 *
	 * @param key - Setting key
	 * @param value - Setting value
	 */
	setDolphinSetting<K extends keyof DolphinSettings>(
		key: K,
		value: DolphinSettings[K],
	): void;

	/**
	 * Get the delete source setting.
	 *
	 * @returns Whether to delete source after success
	 */
	getDeleteSourceAfterSuccess(): boolean;

	/**
	 * Set the delete source setting.
	 *
	 * @param value - Whether to delete source after success
	 */
	setDeleteSourceAfterSuccess(value: boolean): void;

	/**
	 * Subscribe to settings changes.
	 *
	 * @param callback - Callback when settings change
	 * @returns Unsubscribe function
	 */
	subscribe(callback: (settings: AppSettings) => void): () => void;
}
