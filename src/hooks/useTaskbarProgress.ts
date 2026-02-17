import { useEffect, useRef } from "react";
import { getCurrentWindow, ProgressBarStatus } from "@tauri-apps/api/window";
import { jobStore } from "@/stores/JobStore";
import { useSignalValue } from "@/hooks/useSignalValue";

/**
 * Hook to update Windows/macOS taskbar progress based on queue status.
 * Aggregates progress from all workflow queues.
 * Throttled to prevent excessive updates.
 */
export function useTaskbarProgress() {
	const globalSummary = useSignalValue(jobStore.globalSummary);
	const anyProcessing = useSignalValue(jobStore.anyProcessing);
	const lastUpdateRef = useRef(0);
	const pendingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastPayloadRef = useRef<
		| { status: ProgressBarStatus.None }
		| { status: ProgressBarStatus.Normal; progress: number }
		| null
	>(null);

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
			let nextPayload:
				| { status: ProgressBarStatus.None }
				| { status: ProgressBarStatus.Normal; progress: number };

			if (!anyProcessing || globalSummary.total === 0) {
				nextPayload = {
					status: ProgressBarStatus.None,
				};
			} else if (globalSummary.processing === 0 && globalSummary.completed === 0) {
				nextPayload = {
					status: ProgressBarStatus.None,
				};
			} else {
				nextPayload = {
					status: ProgressBarStatus.Normal,
					progress: Math.round(
						Math.min(100, Math.max(0, globalSummary.overallProgress)),
					),
				};
			}

			const lastPayload = lastPayloadRef.current;
			const isUnchanged =
				!!lastPayload &&
				lastPayload.status === nextPayload.status &&
				(nextPayload.status !== ProgressBarStatus.Normal ||
					(lastPayload.status === ProgressBarStatus.Normal &&
						lastPayload.progress === nextPayload.progress));

			if (isUnchanged) {
				return;
			}

			await window.setProgressBar(nextPayload);
			lastPayloadRef.current = nextPayload;
		};

		updateProgress().catch(console.error);

		return () => {
			if (pendingUpdateRef.current) {
				clearTimeout(pendingUpdateRef.current);
			}
		};
	}, [globalSummary, anyProcessing]);
}

