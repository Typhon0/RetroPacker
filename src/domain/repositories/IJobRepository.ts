/**
 * Repository Interface - Job Repository
 * Contract for job persistence and state management.
 *
 * @module domain/repositories/IJobRepository
 */

import { JobProps, JobUpdate } from "../entities/Job";
import { WorkflowType } from "../types/workflow.types";

/**
 * Job Repository Interface
 *
 * Abstracts job state management, allowing for:
 * - Different implementations (Zustand, Redux, Mock)
 * - Easy testing with mock implementations
 * - Dependency inversion for clean architecture
 */
export interface IJobRepository {
	/**
	 * Get all jobs for a workflow.
	 *
	 * @param workflow - The workflow type
	 * @returns Array of job properties
	 */
	getJobs(workflow: WorkflowType): JobProps[];

	/**
	 * Get a specific job by ID.
	 *
	 * @param workflow - The workflow type
	 * @param id - Job ID
	 * @returns Job properties or undefined if not found
	 */
	getJob(workflow: WorkflowType, id: string): JobProps | undefined;

	/**
	 * Add a new job to a workflow queue.
	 *
	 * @param workflow - The workflow type
	 * @param job - Job properties
	 */
	addJob(workflow: WorkflowType, job: JobProps): void;

	/**
	 * Update an existing job.
	 *
	 * @param workflow - The workflow type
	 * @param id - Job ID
	 * @param updates - Partial job updates
	 */
	updateJob(workflow: WorkflowType, id: string, updates: JobUpdate): void;

	/**
	 * Remove a job from the queue.
	 *
	 * @param workflow - The workflow type
	 * @param id - Job ID
	 */
	removeJob(workflow: WorkflowType, id: string): void;

	/**
	 * Clear all jobs from a workflow queue.
	 *
	 * @param workflow - The workflow type
	 */
	clearQueue(workflow: WorkflowType): void;

	/**
	 * Append a log line to a job's output.
	 *
	 * @param workflow - The workflow type
	 * @param id - Job ID
	 * @param line - Log line to append
	 */
	appendLog(workflow: WorkflowType, id: string, line: string): void;

	/**
	 * Get the processing state for a workflow.
	 *
	 * @param workflow - The workflow type
	 * @returns True if the workflow is processing
	 */
	isProcessing(workflow: WorkflowType): boolean;

	/**
	 * Set the processing state for a workflow.
	 *
	 * @param workflow - The workflow type
	 * @param processing - Whether processing is active
	 */
	setProcessing(workflow: WorkflowType, processing: boolean): void;

	/**
	 * Subscribe to job changes in a workflow.
	 *
	 * @param workflow - The workflow type
	 * @param callback - Callback when jobs change
	 * @returns Unsubscribe function
	 */
	subscribe(
		workflow: WorkflowType,
		callback: (jobs: JobProps[]) => void,
	): () => void;
}
