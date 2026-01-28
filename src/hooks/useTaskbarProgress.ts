import { useEffect } from "react";
import { useQueueStore, Job } from "../stores/useQueueStore";
import { getCurrentWindow, ProgressBarStatus } from "@tauri-apps/api/window";

/**
 * Hook to update Windows/macOS taskbar progress based on queue status.
 * Aggregates progress from all workflow queues.
 */
export function useTaskbarProgress() {
	const queues = useQueueStore((state) => state.queues);
	const isProcessingMap = useQueueStore((state) => state.isProcessing);

	useEffect(() => {
		const updateProgress = async () => {
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

			// Update taskbar
			await window.setProgressBar({
				status: ProgressBarStatus.Normal,
				progress: Math.min(1, Math.max(0, overallProgress)),
			});
		};

		updateProgress().catch(console.error);
	}, [queues, isProcessingMap]);
}
