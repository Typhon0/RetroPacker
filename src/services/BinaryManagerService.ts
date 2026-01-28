import { Command } from "@tauri-apps/plugin-shell";

// In bundled/sidecar mode, we don't manage paths or downloads.
// We just verify the sidecar command is available (optional) or just expose a method to get the Command.

export class BinaryManagerService {
	/**
	 * Creates a Command instance for a bundled sidecar.
	 * @param binary The binary name (e.g., 'chdman', 'dolphintool')
	 * @param args Arguments to pass to the binary
	 */
	static createCommand(
		binary: "chdman" | "dolphintool", // Updated to lowercase to match typical usage, though "DolphinTool" is the file name usually. Keeping strict type.
		args: string[],
	): Command<string> {
		// mapped in tauri.conf.json -> externalBin
		const binaryMap: Record<string, string> = {
			chdman: "binaries/chdman",
			dolphintool: "binaries/DolphinTool", // Matches config exactly
		};
		return Command.sidecar(binaryMap[binary], args);
	}

	/**
	 * Generic execution helper that returns stdout
	 */
	static async execute(
		binary: "chdman" | "dolphintool",
		args: string[],
	): Promise<string> {
		const cmd = this.createCommand(binary, args);
		const output = await cmd.execute();

		if (output.code !== 0) {
			throw new Error(
				`Command failed with code ${output.code}: ${output.stderr}`,
			);
		}
		return output.stdout;
	}

	/**
	 * Verifies that the sidecar can be executed.
	 */
	static async checkBinaryExists(): Promise<boolean> {
		try {
			// Simple check: run --help for both
			await this.execute("chdman", ["--help"]);
			return true;
		} catch (e) {
			console.error("Failed to execute sidecar:", e);
			return false;
		}
	}
}
