import { useEffect, useRef } from "react";
import { useSignalValue } from "@/hooks/useSignalValue";
import { jobStore } from "@/stores/JobStore";

/**
 * Hook to prevent system sleep during active processing.
 */
export function useSleepPrevention() {
	const hasActiveJobs = useSignalValue(jobStore.hasActiveJobs);
	const anyProcessing = useSignalValue(jobStore.anyProcessing);

	const wakeLockRef = useRef<WakeLockSentinel | null>(null);
	const lastActionRef = useRef<"acquire" | "release" | null>(null);

	useEffect(() => {
		const shouldHaveLock = anyProcessing && hasActiveJobs;

		if (shouldHaveLock && lastActionRef.current !== "acquire") {
			const requestWakeLock = async () => {
				if (!wakeLockRef.current && "wakeLock" in navigator) {
					try {
						wakeLockRef.current = await navigator.wakeLock.request("screen");
						lastActionRef.current = "acquire";
						console.log("Wake lock acquired - preventing sleep");

						wakeLockRef.current.addEventListener("release", () => {
							wakeLockRef.current = null;
						});
					} catch (e) {
						console.warn("Wake lock request failed:", e);
					}
				}
			};
			void requestWakeLock();
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
			void releaseWakeLock();
		}

		return () => {
			if (wakeLockRef.current) {
				wakeLockRef.current.release().catch(() => {});
				wakeLockRef.current = null;
			}
		};
	}, [hasActiveJobs, anyProcessing]);

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
