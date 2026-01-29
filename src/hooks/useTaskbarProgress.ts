import { useEffect, useRef } from "react";
import { useQueueStore } from "../stores/useQueueStore";
import type { Job } from "../stores/useQueueStore";
import { getCurrentWindow, ProgressBarStatus } from "@tauri-apps/api/window";

/**
 * Hook to update Windows/macOS taskbar progress based on queue status.
 * Aggregates progress from all workflow queues.
 * Throttled to prevent excessive updates.
 */
export function useTaskbarProgress() {
	const queues = useQueueStore((state) => state.queues);
	const isProcessingMap = useQueueStore((state) => state.isProcessing);
	const lastUpdateRef = useRef(0);
	const pendingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		const updateProgress = async () => {
			const now = Date.now();

			// Throttle: max 4 updates per second (250ms)
			if (now - lastUpdateRef.current < 250) {
				// Schedule a delayed update if not already scheduled
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

			// Flatten all queues
			const allJobs: Job[] = Object.values(queues).flat();
			const anyProcessing = Object.values(isProcessingMap).some(Boolean);

			if (!anyProcessing || allJobs.length === 0) {
				await window.setProgressBar({
					status: ProgressBarStatus.None,
				});
				return;
			}

			// Calculate overall progress
			const processingJobs = allJobs.filter(
				(j: Job) => j.status === "processing" || j.status === "completed",
			);

			if (processingJobs.length === 0) {
				await window.setProgressBar({
					status: ProgressBarStatus.None,
				});
				return;
			}

			// Calculate weighted progress
			const totalJobs = allJobs.length;
			const completedJobs = allJobs.filter(
				(j: Job) => j.status === "completed",
			).length;
			const processingProgress = allJobs
				.filter((j: Job) => j.status === "processing")
				.reduce((sum: number, j: Job) => sum + (j.progress || 0), 0);

			// Overall progress: (completed + partial progress of processing) / total
			const overallProgress =
				(completedJobs * 100 + processingProgress) / (totalJobs * 100);

			// Update taskbar with integer progress (0-100)
			await window.setProgressBar({
				status: ProgressBarStatus.Normal,
				progress: Math.round(Math.min(1, Math.max(0, overallProgress)) * 100),
			});
		};

		updateProgress().catch(console.error);

		return () => {
			if (pendingUpdateRef.current) {
				clearTimeout(pendingUpdateRef.current);
			}
		};
	}, [queues, isProcessingMap]);
}
