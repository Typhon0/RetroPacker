import type { SpawnedProcess } from "@/domain/repositories/ICommandExecutor";
import type { WorkflowType } from "@/domain/types/workflow.types";
import { Command } from "@tauri-apps/plugin-shell";

/**
 * Module-level registry for managing spawned processes.
 * Replaces static class pattern for better tree-shaking and simplicity.
 */

// State - Module Scoped
const processes = new Map<string, SpawnedProcess>();
const cancelledJobs = new Set<string>();
const cancelledWorkflows = new Set<WorkflowType>();

// Helper to generate unique key
const getKey = (workflow: WorkflowType, jobId: string): string => {
	return `${workflow}:${jobId}`;
};

/**
 * Register a new process.
 * Checks for cancellation flags to prevent race conditions.
 */
export function register(
	workflow: WorkflowType,
	jobId: string,
	process: SpawnedProcess,
): void {
	const key = getKey(workflow, jobId);

	// Race condition fix: Check if job was cancelled while spawning
	if (cancelledJobs.has(key)) {
		terminateProcess(process).catch(() => {});
		return;
	}

	// Race condition fix: Check if entire workflow was cancelled
	if (cancelledWorkflows.has(workflow)) {
		terminateProcess(process).catch(() => {});
		return;
	}

	processes.set(key, process);
}

/**
 * Unregister a process (cleanup).
 */
export function unregister(workflow: WorkflowType, jobId: string): void {
	const key = getKey(workflow, jobId);
	processes.delete(key);
}

/**
 * Check if a specific job was cancelled.
 */
export function wasCancelled(workflow: WorkflowType, jobId: string): boolean {
	return cancelledJobs.has(getKey(workflow, jobId));
}

/**
 * Clear cancellation flag for a specific job.
 */
export function clearCancelled(workflow: WorkflowType, jobId: string): void {
	cancelledJobs.delete(getKey(workflow, jobId));
}

/**
 * Cancel a specific job.
 */
export async function cancel(
	workflow: WorkflowType,
	jobId: string,
): Promise<boolean> {
	const key = getKey(workflow, jobId);
	const process = processes.get(key);

	if (!process) {
		return false;
	}

	cancelledJobs.add(key);
	processes.delete(key); // Remove immediately to update UI

	// Fire-and-forget termination
	terminateProcess(process).catch((e) => {
		console.warn(`Failed to terminate ${key}:`, e);
	});

	return true;
}

/**
 * Cancel all jobs for a workflow.
 * Sets a latch flag that prevents new jobs from starting until cleared.
 */
export async function cancelAll(workflow: WorkflowType): Promise<void> {
	// Latch: Block new spawns immediately
	cancelledWorkflows.add(workflow);

	const prefix = `${workflow}:`;
	const terminationPromises: Promise<void>[] = [];

	for (const [key, process] of processes.entries()) {
		if (key.startsWith(prefix)) {
			cancelledJobs.add(key);
			processes.delete(key);
			terminationPromises.push(
				terminateProcess(process).catch((e) => {
					console.warn(`Failed to terminate ${key}:`, e);
				}),
			);
		}
	}

	await Promise.all(terminationPromises);
}

/**
 * Check if the workflow is currently in a cancelled state (Latch).
 */
export function isWorkflowCancelled(workflow: WorkflowType): boolean {
	return cancelledWorkflows.has(workflow);
}

/**
 * Clear the workflow cancellation latch.
 * Must be called explicitly (e.g. on 'Start') to resume processing.
 */
export function clearWorkflowCancellation(workflow: WorkflowType): void {
	cancelledWorkflows.delete(workflow);
}

/**
 * Internal helper to terminate a process safely with timeout.
 */
async function terminateProcess(process: SpawnedProcess): Promise<void> {
	const withTimeout = async (promise: Promise<void>, label: string) => {
		let timeoutId: ReturnType<typeof setTimeout> | undefined;

		const timeoutPromise = new Promise<void>((_, reject) => {
			timeoutId = setTimeout(() => {
				reject(new Error(`${label} timed out`));
			}, 2000);
		});

		try {
			await Promise.race([promise, timeoutPromise]);
		} finally {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		}
	};

	// 1. Primary Polite Kill
	try {
		await withTimeout(process.kill(), "Primary kill");
	} catch {
		// Ignore failures, proceed to force kill
	}

	const pid = process.pid;
	if (!pid) return;

	const isWindows =
		typeof navigator !== "undefined" &&
		navigator.userAgent.toLowerCase().includes("windows");

	// 2. Force Kill (Taskkill / kill -9)
	try {
		if (isWindows) {
			const cmd = Command.create("taskkill", [
				"/PID",
				pid.toString(),
				"/T",
				"/F",
			]);
			// Fix: Handle spawn promise safely
			await withTimeout(
				cmd
					.spawn()
					.then(() => {
						/* Process spawned successfully */
					})
					.catch(() => {
						/* Ignore spawn errors */
					}),
				"Taskkill",
			);
		} else {
			const cmd = Command.create("kill", ["-9", pid.toString()]);
			await withTimeout(
				cmd
					.execute()
					.then(() => {})
					.catch(() => {}),
				"Kill -9",
			);
		}
	} catch {
		// Final fallback: ignore
	}
}

// Export as a namespace object for backward compatibility if needed,
// but prefer named imports.
export const ProcessRegistry = {
	register,
	unregister,
	wasCancelled,
	clearCancelled,
	cancel,
	cancelAll,
	isWorkflowCancelled,
	clearWorkflowCancellation,
};
