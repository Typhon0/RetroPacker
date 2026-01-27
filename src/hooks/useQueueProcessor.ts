import { useEffect } from 'react';
import { useQueueStore } from '../stores/useQueueStore';
import { usePackerStore } from '../stores/usePackerStore';
import { ChdmanService } from '../services/ChdmanService';
import { dirname } from '@tauri-apps/api/path';

export function useQueueProcessor() {
    const queue = useQueueStore((state) => state.queue);
    const isProcessing = useQueueStore((state) => state.isProcessing);
    const concurrency = usePackerStore((state) => state.concurrency);

    useEffect(() => {
        const processQueue = async () => {
            const processingCount = queue.filter((j) => j.status === 'processing').length;

            if (isProcessing && processingCount < concurrency) {
                // Find next pending job
                const nextJob = queue.find((j) => j.status === 'pending');

                if (nextJob) {
                    try {
                        // Default output to same directory as input
                        const outputDir = await dirname(nextJob.path);
                        ChdmanService.runJob(nextJob, outputDir);
                    } catch (e) {
                        console.error("Failed to start job", e);
                        useQueueStore.getState().updateJob(nextJob.id, {
                            status: 'failed',
                            errorMessage: 'Could not determine output path'
                        });
                    }
                }
            }
        };

        processQueue();
    }, [queue, concurrency, isProcessing]);
}
