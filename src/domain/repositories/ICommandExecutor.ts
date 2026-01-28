/**
 * Repository Interface - Command Executor
 * Contract for executing external commands (chdman, DolphinTool).
 *
 * Follows Interface Segregation Principle - focused on command execution only.
 *
 * @module domain/repositories/ICommandExecutor
 */

/**
 * Supported binary executables.
 */
export type BinaryName = "chdman" | "DolphinTool";

/**
 * Result of a completed command execution.
 */
export interface CommandResult {
	/** Exit code (null if terminated abnormally). */
	readonly code: number | null;
	/** Signal that terminated the process (if any). */
	readonly signal: number | null;
}

/**
 * Handle to a spawned process.
 */
export interface SpawnedProcess {
	/** Process ID. */
	readonly pid: number;
	/** Kill the process. */
	kill(): Promise<void>;
}

/**
 * Callbacks for streaming command output.
 */
export interface CommandCallbacks {
	/** Called when a line is written to stdout. */
	onStdout?: (line: string) => void;
	/** Called when a line is written to stderr. */
	onStderr?: (line: string) => void;
	/** Called when progress is detected (0-100). */
	onProgress?: (percent: number) => void;
	/** Called when the command completes. */
	onClose?: (result: CommandResult) => void;
	/** Called when an error occurs. */
	onError?: (error: Error) => void;
}

/**
 * Command Executor Repository Interface
 *
 * Abstracts the execution of external binaries, allowing for:
 * - Different implementations (Tauri, Mock, Node.js)
 * - Easy testing with mock implementations
 * - Dependency inversion for clean architecture
 */
export interface ICommandExecutor {
	/**
	 * Execute a command and receive output via callbacks.
	 *
	 * @param binary - The binary to execute
	 * @param args - Command line arguments
	 * @param callbacks - Callbacks for output streaming
	 * @returns Spawned process handle
	 */
	spawn(
		binary: BinaryName,
		args: string[],
		callbacks: CommandCallbacks,
	): Promise<SpawnedProcess>;

	/**
	 * Execute a command and wait for completion.
	 *
	 * @param binary - The binary to execute
	 * @param args - Command line arguments
	 * @returns Command result with exit code
	 */
	execute(binary: BinaryName, args: string[]): Promise<CommandResult>;
}
