import { Command } from '@tauri-apps/plugin-shell';
import { Job, useQueueStore } from '../stores/useQueueStore';
import { usePackerStore, CompressionPreset } from '../stores/usePackerStore';

export class ChdmanService {
    /**
     * Detects the strategy and builds arguments for chdman
     */
    static getStrategy(filePath: string): 'createcd' | 'createdvd' | 'raw' {
        const ext = filePath.split('.').pop()?.toLowerCase();

        switch (ext) {
            case 'iso':
                return 'createdvd';
            case 'cue':
            case 'toc':
            case 'gdi':
                return 'createcd';
            default:
                // Fallback or error. For 'raw' preset or unknown files, we might treat differently.
                // Assuming unknown iso-like files are DVD or we default to createcd?
                // Safe default for unknown might be createcd, but let's default to createdvd for single files usually?
                // Actually, gdi is createcd.
                return 'createcd';
        }
    }

    static getCompressionArgs(preset: CompressionPreset): string[] {
        switch (preset) {
            case 'balanced':
                return ['-c', 'lzma,zlib,huff']; // Good balance
            case 'max':
                return ['-c', 'lzma']; // Strongest, slower
            case 'fast':
                return ['-c', 'zstd']; // Fast decode
            case 'raw':
                return ['-c', 'none']; // No compression
            default:
                return ['-c', 'lzma,zlib,huff'];
        }
    }

    static buildCommandArgs(job: Job, outputDir: string, preset: CompressionPreset): string[] {
        const strategy = job.strategy;
        const inputPath = job.path;
        const outputPath = `${outputDir}/${job.filename}.chd`; // Simplified output path logic

        const baseArgs = [strategy, '-i', inputPath, '-o', outputPath];
        const compressionArgs = this.getCompressionArgs(preset);

        // Specific overrides
        if (job.system === 'PS2' || job.filename.toLowerCase().endsWith('.iso')) {
            // PS2 specific: Hunk Size 2048
            baseArgs.push('-hs', '2048');
        }

        // Force overwrite for now or handle appropriately? chdman usually fails if exists.
        baseArgs.push('-f');

        return [...baseArgs, ...compressionArgs];
    }

    static async runJob(job: Job, outputDir: string): Promise<void> {
        const { appendLog, updateJob } = useQueueStore.getState();
        const { preset } = usePackerStore.getState();

        updateJob(job.id, { status: 'processing', progress: 0, errorMessage: undefined });

        // @ts-ignore
        const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

        if (!isTauri) {
            // MOCK MODE
            appendLog(job.id, `[MOCK MODE] Tauri not detected. Simulating job...`);
            let progress = 0;
            const interval = setInterval(() => {
                progress += 5;
                updateJob(job.id, { progress });
                if (progress % 20 === 0) {
                    appendLog(job.id, `[MOCK] Compressing... ${progress}% complete... (ratio=${(Math.random() * 10 + 90).toFixed(1)}%)`);
                }

                if (progress >= 100) {
                    clearInterval(interval);
                    updateJob(job.id, { status: 'completed', progress: 100 });
                    appendLog(job.id, `[MOCK] Job completed successfully.`);
                }
            }, 200);
            return;
        }

        // Determine strategy if not already set (though store has it, might need refresher)
        // We assume strategy is set when adding job.

        const args = this.buildCommandArgs(job, outputDir, preset);

        appendLog(job.id, `Starting job: chdman ${args.join(' ')}`);

        try {
            const command = Command.sidecar('binaries/chdman', args);

            command.on('close', (data) => {
                appendLog(job.id, `Process finished with code ${data.code}`);
                if (data.code === 0) {
                    updateJob(job.id, { status: 'completed', progress: 100 });
                } else {
                    updateJob(job.id, { status: 'failed', errorMessage: `Exited with code ${data.code}` });
                }
            });

            command.on('error', (error) => {
                appendLog(job.id, `Error: ${error}`);
                updateJob(job.id, { status: 'failed', errorMessage: String(error) });
            });

            command.stdout.on('data', (line) => {
                appendLog(job.id, line);
                // Parse progress from stdout
                // chdman output: "Compressing, 10.5% complete... (ratio=100.0%)"
                const match = line.match(/Compressing,\s+(\d+\.?\d*)%\s+complete/);
                if (match) {
                    const percentage = parseFloat(match[1]);
                    updateJob(job.id, { progress: percentage });
                }
            });

            command.stderr.on('data', (line) => {
                appendLog(job.id, `[stderr] ${line}`);
            });

            const child = await command.spawn();
            appendLog(job.id, `PID: ${child.pid}`);

        } catch (e) {
            console.error(e);
            updateJob(job.id, { status: 'failed', errorMessage: 'Failed to spawn process' });
            appendLog(job.id, `Exception: ${e}`);
        }
    }
}
