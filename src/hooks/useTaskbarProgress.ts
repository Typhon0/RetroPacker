import { useEffect, useRef } from "react";
import { getCurrentWindow, ProgressBarStatus } from "@tauri-apps/api/window";
import { useQueueStore } from "../stores/useQueueStore";
import { jobStore } from "@/stores/JobStore";
import { useSignalValue } from "@/hooks/useSignalValue";

/**
 * Hook to update Windows/macOS taskbar progress based on queue status.
 * Aggregates progress from all workflow queues.
 * Throttled to prevent excessive updates.
 */
export function useTaskbarProgress() {
	const globalSummary = useSignalValue(jobStore.globalSummary);
	const isProcessingMap = useQueueStore((state) => state.isProcessing);
	const lastUpdateRef = useRef(0);
	const pendingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		const updateProgress = async () => {
			const now = Date.now();

			// Throttle: max 4 updates per second (250ms)
			if (now - lastUpdateRef.current < 250) {
				if (!pendingUpdateRef.current) {
					pendingUpdateRef.current = setTimeout(
						() => {
							pendingUpdateRef.current = null;
							updateProgress();
						},
						250 - (now - lastUpdateRef.current),
					);
				}
				return;
			}

			lastUpdateRef.current = now;
			const window = getCurrentWindow();
			const anyProcessing = Object.values(isProcessingMap).some(Boolean);

			if (!anyProcessing || globalSummary.total === 0) {
				await window.setProgressBar({
					status: ProgressBarStatus.None,
				});
				return;
			}

			if (globalSummary.processing === 0 && globalSummary.completed === 0) {
				await window.setProgressBar({
					status: ProgressBarStatus.None,
				});
				return;
			}

			await window.setProgressBar({
				status: ProgressBarStatus.Normal,
				progress: Math.round(
					Math.min(100, Math.max(0, globalSummary.overallProgress)),
				),
			});
		};

		updateProgress().catch(console.error);

		return () => {
			if (pendingUpdateRef.current) {
				clearTimeout(pendingUpdateRef.current);
			}
		};
	}, [globalSummary, isProcessingMap]);
}
