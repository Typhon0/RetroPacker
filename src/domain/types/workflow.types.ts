/**
 * Domain Types - Workflow
 * Core type definitions for job processing workflows.
 *
 * @module domain/types/workflow.types
 */

/**
 * Possible states for a job in the processing queue.
 */
export const JOB_STATUS = {
	PENDING: "pending",
	PROCESSING: "processing",
	COMPLETED: "completed",
	FAILED: "failed",
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

/**
 * Available workflow types in the application.
 */
export const WORKFLOW_TYPE = {
	COMPRESS: "compress",
	EXTRACT: "extract",
	VERIFY: "verify",
	INFO: "info",
} as const;

export type WorkflowType = (typeof WORKFLOW_TYPE)[keyof typeof WORKFLOW_TYPE];

/**
 * Type guard to check if a string is a valid WorkflowType.
 */
export function isWorkflowType(value: string): value is WorkflowType {
	return Object.values(WORKFLOW_TYPE).includes(value as WorkflowType);
}

/**
 * Type guard to check if a string is a valid JobStatus.
 */
export function isJobStatus(value: string): value is JobStatus {
	return Object.values(JOB_STATUS).includes(value as JobStatus);
}

/**
 * Compression strategy for CHD creation.
 */
export type CompressionStrategy = "createcd" | "createdvd" | "raw";

/**
 * Verification result status.
 */
export type VerificationResult = "pass" | "fail" | "unknown";
