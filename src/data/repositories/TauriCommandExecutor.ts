/**
 * Tauri Command Executor
 * Implementation of ICommandExecutor using Tauri's shell plugin.
 *
 * @module data/repositories/TauriCommandExecutor
 */

import { Command } from "@tauri-apps/plugin-shell";
import {
	ICommandExecutor,
	BinaryName,
	CommandCallbacks,
	CommandResult,
	SpawnedProcess,
} from "../../domain/repositories/ICommandExecutor";

/**
 * Tauri implementation of command execution.
 * Uses Tauri's shell plugin to execute sidecar binaries.
 */
export class TauriCommandExecutor implements ICommandExecutor {
	/**
	 * Spawn a binary and receive output via callbacks.
	 */
	async spawn(
		binary: BinaryName,
		args: string[],
		callbacks: CommandCallbacks,
	): Promise<SpawnedProcess> {
		const command = Command.sidecar(`binaries/${binary}`, args);

		// Set up stdout handler
		command.stdout.on("data", (data: string) => {
			const lines = data.split(/[\r\n]+/).filter((line) => line.trim());
			for (const line of lines) {
				callbacks.onStdout?.(line.trim());

				// Parse progress if callback provided
				if (callbacks.onProgress) {
					const progress = this.parseProgress(line);
					if (progress !== null) {
						callbacks.onProgress(progress);
					}
				}
			}
		});

		// Set up stderr handler
		command.stderr.on("data", (data: string) => {
			const lines = data.split(/[\r\n]+/).filter((line) => line.trim());
			for (const line of lines) {
				callbacks.onStderr?.(line.trim());

				// chdman outputs progress to stderr sometimes
				if (callbacks.onProgress) {
					const progress = this.parseProgress(line);
					if (progress !== null) {
						callbacks.onProgress(progress);
					}
				}
			}
		});

		// Set up close handler
		command.on(
			"close",
			(data: { code: number | null; signal: number | null }) => {
				callbacks.onClose?.({
					code: data.code,
					signal: data.signal,
				});
			},
		);

		// Set up error handler
		command.on("error", (error: unknown) => {
			callbacks.onError?.(new Error(String(error)));
		});

		// Spawn the process
		const child = await command.spawn();

		return {
			pid: child.pid,
			kill: async () => {
				await child.kill();
			},
		};
	}

	/**
	 * Execute a binary and wait for completion.
	 */
	async execute(binary: BinaryName, args: string[]): Promise<CommandResult> {
		const command = Command.sidecar(`binaries/${binary}`, args);
		const output = await command.execute();

		return {
			code: output.code,
			signal: output.signal,
		};
	}

	/**
	 * Parse progress percentage from output line.
	 */
	private parseProgress(line: string): number | null {
		// chdman format: "Compressing, 50.5% complete..."
		const match = line.match(
			/(?:Compressing|Extracting|Processing|Verifying),?\s+(\d+\.?\d*)%\s+complete/i,
		);
		if (match) {
			return parseFloat(match[1]);
		}
		return null;
	}
}
