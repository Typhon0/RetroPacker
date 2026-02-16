/**
 * Backward-compatible queue store exports.
 *
 * The canonical stores are now:
 * - useJobStateStore: lightweight queue/status state
 * - useJobDataStore: heavyweight per-job metadata
 */

export { useJobStateStore as useQueueStore } from "@/stores/useJobStateStore";
export type { Job } from "@/stores/useJobStateStore";
export type { JobStatus, WorkflowType } from "@/domain/types/workflow.types";
