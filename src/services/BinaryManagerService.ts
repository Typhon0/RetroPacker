import { Command } from '@tauri-apps/plugin-shell';

// In bundled/sidecar mode, we don't manage paths or downloads.
// We just verify the sidecar command is available (optional) or just expose a method to get the Command.

export class BinaryManagerService {
    /**
     * Creates a Command instance for the bundled chdman sidecar.
     * @param args Arguments to pass to chdman
     */
    static createCommand(args: string[]): Command<string> {
        // 'chdman' maps to the binary defined in tauri.conf.json -> externalBin
        // Tauri handles the architecture resolution automatically.
        return Command.sidecar('binaries/chdman', args);
    }

    /**
     * Verifies that the sidecar can be executed.
     */
    static async checkBinaryExists(): Promise<boolean> {
        try {
            // Simple check: run --help
            const cmd = this.createCommand(['--help']);
            const result = await cmd.execute();
            return result.code === 0;
        } catch (e) {
            console.error('Failed to execute sidecar:', e);
            return false;
        }
    }
}
