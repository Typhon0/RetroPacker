import { useEffect, useRef } from "react";
import { useQueueStore } from "../stores/useQueueStore";

/**
 * Hook to prevent system sleep during active processing.
 * Uses optimized selectors to minimize re-renders.
 */
export function useSleepPrevention() {
	// Use a selector that only returns a boolean, not the entire queue
	const hasActiveJobs = useQueueStore((state) =>
		Object.values(state.queues)
			.flat()
			.some((j) => j.status === "processing"),
	);
	const anyProcessing = useQueueStore((state) =>
		Object.values(state.isProcessing).some(Boolean),
	);

	const wakeLockRef = useRef<WakeLockSentinel | null>(null);
	const lastActionRef = useRef<"acquire" | "release" | null>(null);

	useEffect(() => {
		const shouldHaveLock = anyProcessing && hasActiveJobs;

		// Debounce: Only take action if the desired state changed
		if (shouldHaveLock && lastActionRef.current !== "acquire") {
			const requestWakeLock = async () => {
				if (!wakeLockRef.current && "wakeLock" in navigator) {
					try {
						wakeLockRef.current = await navigator.wakeLock.request("screen");
						lastActionRef.current = "acquire";
						console.log("Wake lock acquired - preventing sleep");

						wakeLockRef.current.addEventListener("release", () => {
							wakeLockRef.current = null;
							// Don't set lastActionRef here - let effect logic handle it
						});
					} catch (e) {
						console.warn("Wake lock request failed:", e);
					}
				}
			};
			requestWakeLock();
		} else if (!shouldHaveLock && lastActionRef.current !== "release") {
			const releaseWakeLock = async () => {
				if (wakeLockRef.current) {
					try {
						await wakeLockRef.current.release();
						wakeLockRef.current = null;
						lastActionRef.current = "release";
						console.log("Wake lock released - allowing sleep");
					} catch (e) {
						console.warn("Wake lock release failed:", e);
					}
				} else {
					lastActionRef.current = "release";
				}
			};
			releaseWakeLock();
		}

		return () => {
			// Cleanup on unmount
			if (wakeLockRef.current) {
				wakeLockRef.current.release().catch(() => {});
				wakeLockRef.current = null;
			}
		};
	}, [hasActiveJobs, anyProcessing]);

	// Re-acquire wake lock when page becomes visible again
	useEffect(() => {
		const handleVisibilityChange = async () => {
			if (
				document.visibilityState === "visible" &&
				hasActiveJobs &&
				anyProcessing &&
				!wakeLockRef.current
			) {
				if ("wakeLock" in navigator) {
					try {
						wakeLockRef.current = await navigator.wakeLock.request("screen");
						lastActionRef.current = "acquire";
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
	}, [hasActiveJobs, anyProcessing]);
}
