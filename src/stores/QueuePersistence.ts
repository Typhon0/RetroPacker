/**
 * Persistence layer for job queue structure using Tauri Store.
 * Excludes volatile data (logs, progress) to minimize disk I/O.
 */

import { LazyStore } from "@tauri-apps/plugin-store";
import type { JobProps } from "@/domain/entities/Job";
import type { WorkflowType } from "@/domain/types/workflow.types";
import { isWorkflowType, isJobStatus } from "@/domain/types/workflow.types";
import type { JobState } from "@/domain/entities/JobState";

const STORE_FILE = "retropacker-queue.json";
const STORE_KEY = "queues";
const PERSIST_DEBOUNCE_MS = 500;

/**
 * Persisted job structure (excludes volatile telemetry).
 */
interface PersistedJob {
    id: string;
    filename: string;
    path: string;
    system: string;
    status: string;
    originalSize: number;
    strategy: string;
    errorMessage?: string;
    platformOverride?: string;
    compressedSize?: number;
    compressionRatio?: number;
    discGroup?: string;
    discNumber?: number;
    sourceHash?: string;
    verificationResult?: string;
    gameId?: string;
    gameTitle?: string;
    region?: string;
}

interface PersistedQueues {
    version: 1;
    queues: Record<string, PersistedJob[]>;
}

let store: LazyStore | null = null;

function getStore(): LazyStore {
    if (!store) {
        store = new LazyStore(STORE_FILE);
    }
    return store;
}

/** Serialize JobState to persistence format. */
function toPersistedJob(job: JobState): PersistedJob {
    return {
        id: job.id,
        filename: job.filename,
        path: job.path,
        system: job.system.value,
        status: job.status.value,
        originalSize: job.originalSize,
        strategy: job.strategy,
        errorMessage: job.errorMessage.value,
        platformOverride: job.platformOverride.value,
        compressedSize: job.compressedSize.value,
        compressionRatio: job.compressionRatio.value,
        discGroup: job.discGroup.value,
        discNumber: job.discNumber.value,
        sourceHash: job.sourceHash.value,
        verificationResult: job.verificationResult.value,
        gameId: job.gameId.value,
        gameTitle: job.gameTitle.value,
        region: job.region.value,
    };
}

/** Restore JobProps from persistence. Resets 'processing' status to 'failed'. */
function toRehydratedJobProps(pj: PersistedJob): JobProps | null {
    if (!pj.id || !pj.path || !pj.filename) return null;

    let status = pj.status;
    let errorMessage = pj.errorMessage;

    if (status === "processing") {
        status = "failed";
        errorMessage = "Interrupted — app was closed during processing";
    }

    if (!isJobStatus(status)) {
        status = "pending";
    }

    return {
        id: pj.id,
        filename: pj.filename,
        path: pj.path,
        system: pj.system || "Unknown",
        status: status as JobProps["status"],
        progress: status === "completed" ? 100 : 0,
        originalSize: pj.originalSize ?? 0,
        strategy: (pj.strategy as JobProps["strategy"]) || "createcd",
        outputLog: [],
        errorMessage,
        platformOverride: pj.platformOverride as JobProps["platformOverride"],
        compressedSize: pj.compressedSize,
        compressionRatio: pj.compressionRatio,
        discGroup: pj.discGroup,
        discNumber: pj.discNumber,
        sourceHash: pj.sourceHash,
        verificationResult: pj.verificationResult as JobProps["verificationResult"],
        gameId: pj.gameId,
        gameTitle: pj.gameTitle,
        region: pj.region,
    };
}

// ─── Public API ──────────────────────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

/** Schedule debounced persistence override. */
export function schedulePersist(jobs: readonly JobState[]): void {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        void persistNow(jobs);
    }, PERSIST_DEBOUNCE_MS);
}

/** Write current queue state to disk immediately. */
async function persistNow(jobs: readonly JobState[]): Promise<void> {
    try {
        const queues: Record<string, PersistedJob[]> = {};
        for (const job of jobs) {
            const w = job.workflow;
            if (!queues[w]) queues[w] = [];
            queues[w].push(toPersistedJob(job));
        }

        const data: PersistedQueues = { version: 1, queues };
        const s = getStore();
        await s.set(STORE_KEY, data);
        await s.save();
    } catch (e) {
        console.error("[QueuePersistence] Failed to persist queue:", e);
    }
}

/** Load persisted queue data. Returns null if empty/invalid. */
export async function loadPersistedQueue(): Promise<Record<WorkflowType, JobProps[]> | null> {
    try {
        const s = getStore();
        const data = await s.get<PersistedQueues>(STORE_KEY);
        if (!data || data.version !== 1 || !data.queues) return null;

        const result: Partial<Record<WorkflowType, JobProps[]>> = {};

        for (const [workflow, jobs] of Object.entries(data.queues)) {
            if (!isWorkflowType(workflow)) continue;
            const rehydrated: JobProps[] = [];
            for (const pj of jobs) {
                const props = toRehydratedJobProps(pj);
                if (props) rehydrated.push(props);
            }
            if (rehydrated.length > 0) {
                result[workflow] = rehydrated;
            }
        }

        return Object.keys(result).length > 0 ? (result as Record<WorkflowType, JobProps[]>) : null;
    } catch (e) {
        console.error("[QueuePersistence] Failed to load persisted queue:", e);
        return null;
    }
}

/** Delete persisted queue data. */
export async function clearPersistedQueue(): Promise<void> {
    try {
        const s = getStore();
        await s.delete(STORE_KEY);
        await s.save();
    } catch (e) {
        console.error("[QueuePersistence] Failed to clear persisted queue:", e);
    }
}
