/**
 * Backward-compatible queue store exports.
 *
 * Canonical state split:
 * - useJobStateStore: workflow control + structural queues
 * - JobStore/JobState: signal-backed per-job telemetry
 */

export { useJobStateStore as useQueueStore } from "@/stores/useJobStateStore";
export type { Job } from "@/stores/useJobStateStore";
export type { JobStatus, WorkflowType } from "@/domain/types/workflow.types";
