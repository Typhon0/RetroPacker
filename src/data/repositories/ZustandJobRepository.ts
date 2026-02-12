/**
 * Zustand Job Repository Adapter
 * Implementation of IJobRepository using the existing Zustand store.
 *
 * This adapter bridges the domain IJobRepository interface to the
 * existing useQueueStore, allowing gradual migration.
 *
 * @module data/repositories/ZustandJobRepository
 */

import { useQueueStore } from "../../stores/useQueueStore";
import type { Job } from "../../stores/useQueueStore";
import type { IJobRepository } from "../../domain/repositories/IJobRepository";
import type { JobProps, JobUpdate } from "../../domain/entities/Job";
import type { WorkflowType } from "../../domain/types/workflow.types";

/**
 * Adapter that implements IJobRepository using the existing Zustand store.
 * This allows the new use cases to work with the existing state management.
 */
export class ZustandJobRepository implements IJobRepository {
	/**
	 * Get all jobs for a workflow.
	 */
	getJobs(workflow: WorkflowType): JobProps[] {
		const state = useQueueStore.getState();
		return state.queues[workflow];
	}

	/**
	 * Get a specific job by ID.
	 */
	getJob(workflow: WorkflowType, id: string): JobProps | undefined {
		const state = useQueueStore.getState();
		return state.queues[workflow].find((job) => job.id === id);
	}

	/**
	 * Add a new job to a workflow queue.
	 */
	addJob(workflow: WorkflowType, job: JobProps): void {
		const state = useQueueStore.getState();
		state.addJob(workflow, job as Job);
	}

	/**
	 * Update an existing job.
	 */
	updateJob(workflow: WorkflowType, id: string, updates: JobUpdate): void {
		const state = useQueueStore.getState();
		state.updateJob(workflow, id, updates as Partial<Job>);
	}

	/**
	 * Remove a job from the queue.
	 */
	removeJob(workflow: WorkflowType, id: string): void {
		const state = useQueueStore.getState();
		state.removeJob(workflow, id);
	}

	/**
	 * Clear all jobs from a workflow queue.
	 */
	clearQueue(workflow: WorkflowType): void {
		const state = useQueueStore.getState();
		state.clearQueue(workflow);
	}

	/**
	 * Append a log line to a job's output.
	 */
	appendLog(workflow: WorkflowType, id: string, line: string): void {
		const state = useQueueStore.getState();
		state.appendLog(workflow, id, line);
	}

	/**
	 * Get the processing state for a workflow.
	 */
	isProcessing(workflow: WorkflowType): boolean {
		const state = useQueueStore.getState();
		return state.isProcessing[workflow];
	}

	/**
	 * Set the processing state for a workflow.
	 */
	setProcessing(workflow: WorkflowType, processing: boolean): void {
		const state = useQueueStore.getState();
		state.setProcessing(workflow, processing);
	}

	/**
	 * Subscribe to job changes in a workflow.
	 */
	subscribe(
		workflow: WorkflowType,
		callback: (jobs: JobProps[]) => void,
	): () => void {
		// Use standard Zustand subscribe with selector
		return useQueueStore.subscribe((state) => {
			callback(state.queues[workflow]);
		});
	}
}
