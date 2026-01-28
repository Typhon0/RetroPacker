import { useEffect, useRef } from "react";
import { useQueueStore, Job } from "../stores/useQueueStore";

/**
 * Hook to prevent system sleep during active processing.
 * Checks all workflow queues for active jobs.
 */
export function useSleepPrevention() {
	const queues = useQueueStore((state) => state.queues);
	const isProcessingMap = useQueueStore((state) => state.isProcessing);
	const wakeLockRef = useRef<WakeLockSentinel | null>(null);

	useEffect(() => {
		// Check if any workflow has active jobs
		const allJobs: Job[] = Object.values(queues).flat();
		const anyProcessing = Object.values(isProcessingMap).some(Boolean);
		const hasActiveJobs = allJobs.some((j: Job) => j.status === "processing");

		const requestWakeLock = async () => {
			if (anyProcessing && hasActiveJobs && !wakeLockRef.current) {
				try {
					if ("wakeLock" in navigator) {
						wakeLockRef.current = await navigator.wakeLock.request("screen");
						console.log("Wake lock acquired - preventing sleep");

						wakeLockRef.current.addEventListener("release", () => {
							console.log("Wake lock released");
							wakeLockRef.current = null;
						});
					}
				} catch (e) {
					console.warn("Wake lock request failed:", e);
				}
			}
		};

		const releaseWakeLock = async () => {
			if (wakeLockRef.current) {
				try {
					await wakeLockRef.current.release();
					wakeLockRef.current = null;
					console.log("Wake lock released - allowing sleep");
				} catch (e) {
					console.warn("Wake lock release failed:", e);
				}
			}
		};

		if (anyProcessing && hasActiveJobs) {
			requestWakeLock();
		} else {
			releaseWakeLock();
		}

		return () => {
			releaseWakeLock();
		};
	}, [queues, isProcessingMap]);

	// Re-acquire wake lock when page becomes visible again
	useEffect(() => {
		const handleVisibilityChange = async () => {
			const allJobs: Job[] = Object.values(queues).flat();
			const anyProcessing = Object.values(isProcessingMap).some(Boolean);
			const hasActiveJobs = allJobs.some((j: Job) => j.status === "processing");

			if (
				document.visibilityState === "visible" &&
				anyProcessing &&
				hasActiveJobs
			) {
				if (!wakeLockRef.current && "wakeLock" in navigator) {
					try {
						wakeLockRef.current = await navigator.wakeLock.request("screen");
						console.log("Wake lock re-acquired after visibility change");
					} catch (e) {
						console.warn("Failed to re-acquire wake lock:", e);
					}
				}
			}
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () =>
			document.removeEventListener("visibilitychange", handleVisibilityChange);
	}, [queues, isProcessingMap]);
}
