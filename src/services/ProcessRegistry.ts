import type { SpawnedProcess } from "@/domain/repositories/ICommandExecutor";
import type { ICommandExecutor } from "@/domain/repositories/ICommandExecutor";
import type { WorkflowType } from "@/domain/types/workflow.types";

/**
 * Module-level registry for managing spawned processes.
 * Replaces static class pattern for better tree-shaking and simplicity.
 */

// State - Module Scoped
const processes = new Map<string, SpawnedProcess>();
const cancelledJobs = new Set<string>();
const cancelledWorkflows = new Set<WorkflowType>();

// Injected command executor for force-kill support
let commandExecutor: ICommandExecutor | null = null;

/**
 * Initialize the ProcessRegistry with a command executor.
 * Must be called before any cancel operations that require force-kill.
 */
export function init(executor: ICommandExecutor): void {
	commandExecutor = executor;
}

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
		terminateProcess(process).catch(() => { });
		return;
	}

	// Race condition fix: Check if entire workflow was cancelled
	if (cancelledWorkflows.has(workflow)) {
		terminateProcess(process).catch(() => { });
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

	// Latch cancellation immediately to cover the race where a job is already
	// starting but not yet registered in the process map.
	cancelledJobs.add(key);

	const process = processes.get(key);
	if (!process) {
		// Cancellation is still considered successful because any later register()
		// call for this key will observe the latch and terminate immediately.
		return true;
	}

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
	const withTimeout = async (
		operation: () => Promise<void>,
		label: string,
		timeoutMs: number,
	) => {
		let timeoutId: ReturnType<typeof setTimeout> | undefined;

		const timeoutPromise = new Promise<void>((_, reject) => {
			timeoutId = setTimeout(() => {
				reject(new Error(`${label} timed out`));
			}, timeoutMs);
		});

		try {
			await Promise.race([operation(), timeoutPromise]);
		} finally {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		}
	};

	const sleep = (ms: number): Promise<void> =>
		new Promise((resolve) => {
			setTimeout(resolve, ms);
		});

	const isTimeoutError = (error: unknown, label: string): boolean => {
		return error instanceof Error && error.message === `${label} timed out`;
	};

	const KILL_TIMEOUT_MS = 2000;
	const FORCE_KILL_GRACE_MS = 250;
	const primaryKillLabel = "Primary kill";

	// 1. Primary Polite Kill
	try {
		await withTimeout(() => process.kill(), primaryKillLabel, KILL_TIMEOUT_MS);
		return;
	} catch (error) {
		// If the kill request failed quickly, avoid force-killing by PID.
		// A reused PID is more dangerous than a best-effort polite shutdown.
		if (!isTimeoutError(error, primaryKillLabel)) {
			return;
		}
	}

	const pid = process.pid;
	if (!pid || !commandExecutor) return;
	const executor = commandExecutor;

	// Give the OS/plugin a moment to release process handles before escalating.
	await sleep(FORCE_KILL_GRACE_MS);

	// 2. Force Kill via injected command executor
	try {
		await withTimeout(
			() => executor.forceKillProcess(pid),
			"Force kill",
			KILL_TIMEOUT_MS,
		);
	} catch {
		// Final fallback: ignore
	}
}

/**
 * Reset all internal state. Intended for test isolation only.
 */
export function reset(): void {
	processes.clear();
	cancelledJobs.clear();
	cancelledWorkflows.clear();
	commandExecutor = null;
}

// Export as a namespace object for backward compatibility if needed,
// but prefer named imports.
export const ProcessRegistry = {
	init,
	register,
	unregister,
	wasCancelled,
	clearCancelled,
	cancel,
	cancelAll,
	isWorkflowCancelled,
	clearWorkflowCancellation,
	reset,
};
