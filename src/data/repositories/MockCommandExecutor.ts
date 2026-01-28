/**
 * Mock Command Executor
 * Mock implementation of ICommandExecutor for testing/development.
 *
 * @module data/repositories/MockCommandExecutor
 */

import {
	ICommandExecutor,
	BinaryName,
	CommandCallbacks,
	CommandResult,
	SpawnedProcess,
} from "../../domain/repositories/ICommandExecutor";

/**
 * Mock implementation of command execution.
 * Simulates processing without actually running binaries.
 */
export class MockCommandExecutor implements ICommandExecutor {
	private pidCounter = 1000;

	/**
	 * Simulate spawning a binary with progress updates.
	 */
	async spawn(
		binary: BinaryName,
		args: string[],
		callbacks: CommandCallbacks,
	): Promise<SpawnedProcess> {
		const pid = this.pidCounter++;
		let isCancelled = false;

		callbacks.onStdout?.(
			`[MOCK] Starting ${binary} with args: ${args.slice(0, 3).join(" ")}...`,
		);
		callbacks.onStdout?.(`[MOCK] PID: ${pid}`);

		// Simulate processing with progress updates
		const simulateProgress = async (): Promise<void> => {
			for (let progress = 0; progress <= 100; progress += 5) {
				if (isCancelled) {
					callbacks.onStdout?.("[MOCK] Process cancelled");
					callbacks.onClose?.({ code: -1, signal: 9 });
					return;
				}

				await new Promise((resolve) => setTimeout(resolve, 100));

				callbacks.onProgress?.(progress);

				if (progress % 20 === 0) {
					callbacks.onStdout?.(`[MOCK] Processing... ${progress}% complete`);
				}
			}

			callbacks.onStdout?.("[MOCK] Process completed successfully");
			callbacks.onClose?.({ code: 0, signal: null });
		};

		// Start simulation in background
		simulateProgress();

		return {
			pid,
			kill: async () => {
				isCancelled = true;
			},
		};
	}

	/**
	 * Execute and wait for completion.
	 */
	async execute(binary: BinaryName, args: string[]): Promise<CommandResult> {
		console.log(`[MOCK] Executing ${binary} with args:`, args.slice(0, 3));

		// Simulate execution time
		await new Promise((resolve) => setTimeout(resolve, 500));

		return {
			code: 0,
			signal: null,
		};
	}
}
