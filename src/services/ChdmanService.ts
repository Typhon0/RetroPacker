
import { Job, useQueueStore } from '../stores/useQueueStore';
import { usePackerStore, CompressionPreset } from '../stores/usePackerStore';
import { BinaryManagerService } from './BinaryManagerService';
import { sendNotification, isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import { join } from '@tauri-apps/api/path';

export class ChdmanService {
    /**
     * Detects the strategy and builds arguments for chdman
     */
    static getStrategy(filePath: string): 'createcd' | 'createdvd' | 'raw' {
        const { mediaType } = usePackerStore.getState();

        if (mediaType && mediaType !== 'auto') {
            switch (mediaType) {
                case 'cd': return 'createcd';
                case 'dvd': return 'createdvd';
                case 'raw': return 'raw';
                // 'hdd' or 'ld' imply createdvd or specialized, mapping roughly for now
                case 'hdd': return 'createdvd'; // or createhd if added
                case 'ld': return 'createdvd'; // or createld if added
            }
        }

        const ext = filePath.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'iso':
                return 'createdvd';
            case 'cue':
            case 'toc':
            case 'gdi':
                return 'createcd';
            default:
                return 'createcd';
        }
    }

    static getCompressionArgs(preset: CompressionPreset): string[] {
        const { customCompression } = usePackerStore.getState();
        switch (preset) {
            case 'balanced': return ['-c', 'lzma,zlib,huff'];
            case 'max': return ['-c', 'lzma'];
            case 'fast': return ['-c', 'zstd'];
            case 'raw': return ['-c', 'none'];
            case 'custom': return ['-c', customCompression || 'lzma,zlib,huff'];
            default: return ['-c', 'lzma,zlib,huff'];
        }
    }

    static async buildCommandArgs(job: Job, outputDir: string, preset: CompressionPreset): Promise<string[]> {
        const { jobMode, hunkSize } = usePackerStore.getState();
        const inputPath = job.path;

        // Base args
        let args: string[] = [];

        if (jobMode === 'create') {
            const strategy = job.strategy;
            const outputPath = await join(outputDir, `${job.filename}.chd`);

            args = [strategy, '-i', inputPath, '-o', outputPath];

            const compressionArgs = this.getCompressionArgs(preset);
            args.push(...compressionArgs);

            // PS2 / HunkSize logic
            if (hunkSize) {
                args.push('-hs', hunkSize.toString());
            } else if (job.system === 'PS2' || job.filename.toLowerCase().endsWith('.iso')) {
                args.push('-hs', '2048');
            }
            args.push('-f'); // Force overwrite

        } else if (jobMode === 'extract') {
            // Extract logic: extractcd or extractdvd based on content? 
            // Usually extractcd -i file.chd -o file.cue -ob file.bin
            // For now, let's assume generic extract to .cue/.bin for CD and .iso for DVD?
            // Simplified: extractcd for now, user might need more options.
            // Let's try to detect based on internal metadata or extension?
            // Actually, namDHC has "Extract images from CHD".
            // We'll default to extracting to .cue/.bin (CD) or .iso (DVD).
            // Simplest is extractcd with output .cue

            // Heuristic: If filename suggests DVD, use extractdvd
            // Ideally we run 'info' first. For now, defaulting to extraction strategy matching creation.
            const strategy = job.strategy === 'createdvd' ? 'extractdvd' : 'extractcd';

            if (strategy === 'extractdvd') {
                const outputPath = await join(outputDir, `${job.filename}.iso`);
                args = [strategy, '-i', inputPath, '-o', outputPath, '-f'];
            } else {
                const outputCue = await join(outputDir, `${job.filename}.cue`);
                const outputBin = await join(outputDir, `${job.filename}.bin`);
                args = ['extractcd', '-i', inputPath, '-o', outputCue, '-ob', outputBin, '-f'];
            }
        } else if (jobMode === 'verify') {
            args = ['verify', '-i', inputPath];
        } else if (jobMode === 'info') {
            args = ['info', '-i', inputPath];
        }

        return args;
    }

    static async runJob(job: Job, outputDir: string): Promise<void> {
        const { appendLog, updateJob } = useQueueStore.getState();
        const { preset } = usePackerStore.getState();

        updateJob(job.id, {
            status: 'processing',
            progress: 0,
            errorMessage: undefined,
            startTime: Date.now()
        });

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

        const args = await this.buildCommandArgs(job, outputDir, preset);

        try {
            appendLog(job.id, `Starting job: chdman ${args.join(' ')}`);

            // Use the sidecar command via BinaryManagerService
            const command = BinaryManagerService.createCommand(args);

            command.on('close', async (data: { code: number | null; signal: number | null }) => {
                appendLog(job.id, `Process finished with code ${data.code}`);
                if (data.code === 0) {
                    updateJob(job.id, { status: 'completed', progress: 100, etaSeconds: 0 });
                    await ChdmanService.notifyCompletion(job, true);
                } else {
                    updateJob(job.id, { status: 'failed', errorMessage: `Exited with code ${data.code}` });
                    await ChdmanService.notifyCompletion(job, false);
                }
            });

            command.on('error', (error: unknown) => {
                appendLog(job.id, `Error: ${error}`);
                updateJob(job.id, { status: 'failed', errorMessage: String(error) });
            });

            command.stdout.on('data', (data: string) => {
                // chdman often uses \r to update the same line for progress.
                // We split by both \r and \n to process each segment.
                const segments = data.split(/[\r\n]+/);

                segments.forEach(line => {
                    const cleanLine = line.trim();
                    if (!cleanLine) return;

                    appendLog(job.id, cleanLine);

                    // Parse progress from line
                    // Examples: 
                    // "Compressing, 10.5% complete... (ratio=100.0%)"
                    // "Extracting, 45.2% complete..."
                    const match = cleanLine.match(/(?:Compressing|Extracting|Processing),\s+(\d+\.?\d*)%\s+complete/);
                    if (match) {
                        const percentage = parseFloat(match[1]);

                        // CALC ETA
                        let etaSeconds: number | undefined = undefined;
                        const state = useQueueStore.getState();
                        const currentJob = state.queue.find(j => j.id === job.id);
                        const startTime = currentJob?.startTime;

                        if (startTime && percentage > 0) {
                            const elapsedSeconds = (Date.now() - startTime) / 1000;
                            const totalEst = (elapsedSeconds / percentage) * 100;
                            etaSeconds = Math.max(0, totalEst - elapsedSeconds);
                        }

                        updateJob(job.id, { progress: percentage, etaSeconds });
                    }
                });
            });

            command.stderr.on('data', (line: string) => {
                // Try parsing progress from stderr too
                const segments = line.split(/[\r\n]+/);
                segments.forEach(seg => {
                    const clean = seg.trim();
                    if (!clean) return;
                    appendLog(job.id, `[stderr] ${clean}`);
                    const match = clean.match(/(?:Compressing|Extracting|Processing),\s+(\d+\.?\d*)%\s+complete/);
                    if (match) {
                        const percentage = parseFloat(match[1]);
                        const startTime = useQueueStore.getState().queue.find(j => j.id === job.id)?.startTime;
                        if (startTime && percentage > 0) {
                            const elapsedSeconds = (Date.now() - startTime) / 1000;
                            const totalEst = (elapsedSeconds / percentage) * 100;
                            const etaSeconds = Math.max(0, totalEst - elapsedSeconds);
                            updateJob(job.id, { progress: percentage, etaSeconds });
                        }
                    }
                });
            });

            const child = await command.spawn();
            appendLog(job.id, `PID: ${child.pid}`);

        } catch (e) {
            console.error(e);
            updateJob(job.id, { status: 'failed', errorMessage: 'Failed to spawn process' });
            appendLog(job.id, `Exception: ${e}`);
        }
    }

    static async notifyCompletion(job: Job, success: boolean) {
        // Check/Request permission
        let granted = await isPermissionGranted();
        if (!granted) {
            const permission = await requestPermission();
            granted = permission === 'granted';
        }

        if (granted) {
            sendNotification({
                title: success ? 'Compression Completed' : 'Compression Failed',
                body: `${job.filename} has ${success ? 'finished' : 'failed'} processing.`,
            });
        }
    }
}
