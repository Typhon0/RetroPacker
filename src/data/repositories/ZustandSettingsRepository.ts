/**
 * Zustand Settings Repository Adapter
 * Implementation of ISettingsRepository using the existing Zustand store.
 *
 * @module data/repositories/ZustandSettingsRepository
 */

import { usePackerStore } from "../../stores/usePackerStore";
import {
	ISettingsRepository,
	AppSettings,
} from "../../domain/repositories/ISettingsRepository";
import {
	CompressionPreset,
	ChdSettings,
	DolphinSettings,
} from "../../domain/types/settings.types";
import { Platform } from "../../domain/types/platform.types";
import { WorkflowType } from "../../domain/types/workflow.types";

/**
 * Adapter that implements ISettingsRepository using the existing Zustand store.
 */
export class ZustandSettingsRepository implements ISettingsRepository {
	/**
	 * Get all current settings.
	 */
	getSettings(): AppSettings {
		const state = usePackerStore.getState();
		return {
			activeWorkflow: state.activeWorkflow as WorkflowType,
			preset: state.preset,
			concurrency: state.concurrency,
			customCompression: state.customCompression,
			chd: state.chd,
			dolphin: state.dolphin,
			platform: state.platform as Platform,
			deleteSourceAfterSuccess: state.deleteSourceAfterSuccess,
		};
	}

	/**
	 * Get the current active workflow.
	 */
	getActiveWorkflow(): WorkflowType {
		return usePackerStore.getState().activeWorkflow as WorkflowType;
	}

	/**
	 * Set the active workflow.
	 */
	setActiveWorkflow(workflow: WorkflowType): void {
		usePackerStore.getState().setActiveWorkflow(workflow);
	}

	/**
	 * Get the current compression preset.
	 */
	getPreset(): CompressionPreset {
		return usePackerStore.getState().preset;
	}

	/**
	 * Set the compression preset.
	 */
	setPreset(preset: CompressionPreset): void {
		usePackerStore.getState().setPreset(preset);
	}

	/**
	 * Get the current concurrency setting.
	 */
	getConcurrency(): number {
		return usePackerStore.getState().concurrency;
	}

	/**
	 * Set the concurrency level.
	 */
	setConcurrency(concurrency: number): void {
		usePackerStore.getState().setConcurrency(concurrency);
	}

	/**
	 * Get CHD settings.
	 */
	getChdSettings(): ChdSettings {
		return usePackerStore.getState().chd;
	}

	/**
	 * Update a CHD setting.
	 */
	setChdSetting<K extends keyof ChdSettings>(
		key: K,
		value: ChdSettings[K],
	): void {
		usePackerStore.getState().setChdSetting(key, value);
	}

	/**
	 * Get Dolphin settings.
	 */
	getDolphinSettings(): DolphinSettings {
		return usePackerStore.getState().dolphin;
	}

	/**
	 * Update a Dolphin setting.
	 */
	setDolphinSetting<K extends keyof DolphinSettings>(
		key: K,
		value: DolphinSettings[K],
	): void {
		usePackerStore.getState().setDolphinSetting(key, value);
	}

	/**
	 * Get the delete source setting.
	 */
	getDeleteSourceAfterSuccess(): boolean {
		return usePackerStore.getState().deleteSourceAfterSuccess;
	}

	/**
	 * Set the delete source setting.
	 */
	setDeleteSourceAfterSuccess(value: boolean): void {
		usePackerStore.getState().setDeleteSourceAfterSuccess(value);
	}

	/**
	 * Subscribe to settings changes.
	 */
	subscribe(callback: (settings: AppSettings) => void): () => void {
		return usePackerStore.subscribe((state) => {
			callback({
				activeWorkflow: state.activeWorkflow as WorkflowType,
				preset: state.preset,
				concurrency: state.concurrency,
				customCompression: state.customCompression,
				chd: state.chd,
				dolphin: state.dolphin,
				platform: state.platform as Platform,
				deleteSourceAfterSuccess: state.deleteSourceAfterSuccess,
			});
		});
	}
}
