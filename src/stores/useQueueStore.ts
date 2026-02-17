/**
 * Backward-compatible type exports.
 *
 * The Zustand bridge has been removed.
 * All runtime state is now in JobStore (signals).
 */

export type { WorkflowType, JobStatus } from "@/domain/types/workflow.types";
export type { JobState as Job } from "@/domain/entities/JobState";
