import { useCallback, useEffect } from "react";
import type { WorkflowType } from "@/domain/types/workflow.types";
import { ProcessRegistry } from "@/services/ProcessRegistry";
import { jobStore } from "@/stores/JobStore";

/**
 * Global keyboard shortcuts for common actions.
 *
 * - Space: Toggle Start/Pause processing
 * - Ctrl+Delete: Clear queue
 * - Ctrl+R: Retry failed jobs
 */
export function useKeyboardShortcuts(
	activeWorkflow: WorkflowType,
	isProcessing: boolean,
) {
	const handleToggleProcessing = useCallback(() => {
		if (!isProcessing) {
			ProcessRegistry.clearWorkflowCancellation(activeWorkflow);
		}
		jobStore.setProcessing(activeWorkflow, !isProcessing);
	}, [activeWorkflow, isProcessing]);

	const handleClearQueue = useCallback(async () => {
		try {
			await ProcessRegistry.cancelAll(activeWorkflow);
			jobStore.clearQueue(activeWorkflow);
		} catch (error) {
			console.error("Failed to cancel processes during clear", error);
		}
	}, [activeWorkflow]);

	const handleRetryFailed = useCallback(() => {
		ProcessRegistry.clearWorkflowCancellation(activeWorkflow);
		jobStore.retryFailed(activeWorkflow);
	}, [activeWorkflow]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			// Ignore shortcuts when typing in inputs, textareas, or selects
			const target = e.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.tagName === "SELECT" ||
				target.isContentEditable
			) {
				return;
			}

			// Space: Toggle Start/Pause
			if (e.code === "Space" && !e.ctrlKey && !e.metaKey && !e.altKey) {
				e.preventDefault();
				handleToggleProcessing();
				return;
			}

			// Ctrl+Delete: Clear queue
			if (e.code === "Delete" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				void handleClearQueue();
				return;
			}

			// Ctrl+R: Retry failed (prevent browser refresh)
			if (e.code === "KeyR" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				handleRetryFailed();
				return;
			}
		};

		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [handleToggleProcessing, handleClearQueue, handleRetryFailed]);
}
