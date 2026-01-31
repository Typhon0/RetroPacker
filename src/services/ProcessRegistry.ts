import type { SpawnedProcess } from "@/domain/repositories/ICommandExecutor";
import type { WorkflowType } from "@/domain/types/workflow.types";
import { Command } from "@tauri-apps/plugin-shell";

// biome-ignore lint/complexity/noStaticOnlyClass: static registry is intentional
export class ProcessRegistry {
	private static readonly processes = new Map<string, SpawnedProcess>();
	private static readonly cancelledJobs = new Set<string>();
	// Workflow-level cancellation flag to block new spawns during cancelAll
	private static readonly cancelledWorkflows = new Set<WorkflowType>();

	private static key(workflow: WorkflowType, jobId: string): string {
		return `${workflow}:${jobId}`;
	}

	static register(
		workflow: WorkflowType,
		jobId: string,
		process: SpawnedProcess,
	): void {
		const key = ProcessRegistry.key(workflow, jobId);

		// Race condition fix: Check if job was cancelled while spawning
		if (ProcessRegistry.cancelledJobs.has(key)) {
			console.log(
				`[ProcessRegistry] Job ${key} was cancelled before registration. Terminating now.`,
			);
			ProcessRegistry.terminateProcess(process).catch(console.error);
			return;
		}

		// Race condition fix: Check if entire workflow was cancelled while spawning
		if (ProcessRegistry.cancelledWorkflows.has(workflow)) {
			console.log(
				`[ProcessRegistry] Workflow ${workflow} was cancelled. Terminating ${key} immediately.`,
			);
			ProcessRegistry.terminateProcess(process).catch(console.error);
			return;
		}

		console.log(`[ProcessRegistry] Registering ${key} (PID: ${process.pid})`);
		ProcessRegistry.processes.set(key, process);
	}

	static unregister(workflow: WorkflowType, jobId: string): void {
		const key = ProcessRegistry.key(workflow, jobId);
		// console.log(`[ProcessRegistry] Unregistering ${key}`);
		ProcessRegistry.processes.delete(key);
	}

	/**
	 * Check if a job was cancelled by the user.
	 */
	static wasCancelled(workflow: WorkflowType, jobId: string): boolean {
		return ProcessRegistry.cancelledJobs.has(
			ProcessRegistry.key(workflow, jobId),
		);
	}

	/**
	 * Clear the cancelled flag for a job.
	 */
	static clearCancelled(workflow: WorkflowType, jobId: string): void {
		ProcessRegistry.cancelledJobs.delete(ProcessRegistry.key(workflow, jobId));
	}

	static async cancel(workflow: WorkflowType, jobId: string): Promise<boolean> {
		const key = ProcessRegistry.key(workflow, jobId);
		console.log(`[ProcessRegistry] Attempting to cancel ${key}`);
		const process = ProcessRegistry.processes.get(key);
		if (!process) {
			console.warn(`[ProcessRegistry] Process not found for ${key}`);
			// Log available keys for debugging
			console.log(
				`[ProcessRegistry] Available keys: ${Array.from(ProcessRegistry.processes.keys()).join(", ")}`,
			);
			return false;
		}

		ProcessRegistry.cancelledJobs.add(key);
		ProcessRegistry.processes.delete(key); // Remove immediately so UI updates fast
		// Fire-and-forget termination to avoid blocking
		ProcessRegistry.terminateProcess(process)
			.then(() => {
				console.log(`[ProcessRegistry] Cancelled ${key}`);
			})
			.catch((e) => {
				console.warn(
					`[ProcessRegistry] Error during termination of ${key}:`,
					e,
				);
			});
		return true;
	}

	static async cancelAll(workflow: WorkflowType): Promise<void> {
		// Set workflow cancellation flag FIRST to block any pending spawns
		ProcessRegistry.cancelledWorkflows.add(workflow);
		console.log(
			`[ProcessRegistry] Workflow ${workflow} marked for cancellation`,
		);

		const prefix = `${workflow}:`;
		const entries = Array.from(ProcessRegistry.processes.entries());
		const terminationPromises: Promise<void>[] = [];

		for (const [key, process] of entries) {
			if (!key.startsWith(prefix)) continue;
			ProcessRegistry.cancelledJobs.add(key);
			ProcessRegistry.processes.delete(key); // Remove immediately
			terminationPromises.push(
				ProcessRegistry.terminateProcess(process).catch((e) => {
					console.warn(`[ProcessRegistry] Error terminating ${key}:`, e);
				}),
			);
		}

		// Wait for all terminations in parallel
		await Promise.all(terminationPromises);
	}

	/**
	 * Check if a workflow is currently being cancelled.
	 * Use this to prevent starting new jobs during cancellation.
	 */
	static isWorkflowCancelled(workflow: WorkflowType): boolean {
		return ProcessRegistry.cancelledWorkflows.has(workflow);
	}

	/**
	 * Clear the workflow cancellation flag.
	 * Call this after the queue is cleared to allow new jobs.
	 */
	static clearWorkflowCancellation(workflow: WorkflowType): void {
		ProcessRegistry.cancelledWorkflows.delete(workflow);
		console.log(
			`[ProcessRegistry] Workflow ${workflow} cancellation flag cleared`,
		);
	}

	private static async terminateProcess(
		process: SpawnedProcess,
	): Promise<void> {
		// Helper to race a promise against a timeout
		const withTimeout = async (promise: Promise<void>, label: string) => {
			let timeoutId: ReturnType<typeof setTimeout>;
			const timeoutPromise = new Promise<void>((_, reject) => {
				timeoutId = setTimeout(
					() => reject(new Error(`${label} timed out`)),
					2000,
				);
			});
			try {
				await Promise.race([promise, timeoutPromise]);
			} finally {
				// @ts-ignore - timeoutId is assigned
				clearTimeout(timeoutId);
			}
		};

		try {
			await withTimeout(process.kill(), "Primary kill");
		} catch (e) {
			console.warn("Primary process kill failed or timed out", e);
		}

		const pid = process.pid;
		if (!pid) return;

		const isWindows =
			typeof navigator !== "undefined" &&
			navigator.userAgent.toLowerCase().includes("windows");

		try {
			if (isWindows) {
				const cmd = Command.create("taskkill", [
					"/PID",
					pid.toString(),
					"/T",
					"/F",
				]);
				// Use spawn() instead of execute() - execute() tries to decode output as UTF-8
				// which fails when taskkill returns Windows-encoded text. We don't need to
				// wait for completion, just fire-and-forget.
				await withTimeout(
					cmd.spawn().then(() => {}),
					"Taskkill",
				);
			} else {
				const cmd = Command.create("kill", ["-9", pid.toString()]);
				await withTimeout(
					cmd.execute().then(() => {}),
					"Kill -9",
				);
			}
		} catch (e) {
			console.warn("Fallback process kill failed or timed out", e);
		}
	}
}
