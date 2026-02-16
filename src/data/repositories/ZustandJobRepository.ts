/**
 * Zustand Job Repository Adapter
 * Implementation of IJobRepository using signal-backed JobStore.
 *
 * @module data/repositories/ZustandJobRepository
 */

import type { IJobRepository } from "../../domain/repositories/IJobRepository";
import type { JobProps, JobUpdate } from "../../domain/entities/Job";
import type { WorkflowType } from "../../domain/types/workflow.types";
import { jobStore } from "../../stores/JobStore";
import { useQueueStore } from "../../stores/useQueueStore";

/**
 * Adapter that implements IJobRepository with JobState + signal storage.
 */
export class ZustandJobRepository implements IJobRepository {
	/**
	 * Get all jobs for a workflow.
	 */
	getJobs(workflow: WorkflowType): JobProps[] {
		return jobStore.getQueue(workflow).map((job) => job.toJobProps());
	}

	/**
	 * Get a specific job by ID.
	 */
	getJob(workflow: WorkflowType, id: string): JobProps | undefined {
		return jobStore.getJob(workflow, id)?.toJobProps();
	}

	/**
	 * Add a new job to a workflow queue.
	 */
	addJob(workflow: WorkflowType, job: JobProps): void {
		useQueueStore.getState().addJob(workflow, job);
	}

	/**
	 * Update an existing job.
	 */
	updateJob(workflow: WorkflowType, id: string, updates: JobUpdate): void {
		useQueueStore.getState().updateJob(workflow, id, updates);
	}

	/**
	 * Remove a job from the queue.
	 */
	removeJob(workflow: WorkflowType, id: string): void {
		useQueueStore.getState().removeJob(workflow, id);
	}

	/**
	 * Clear all jobs from a workflow queue.
	 */
	clearQueue(workflow: WorkflowType): void {
		useQueueStore.getState().clearQueue(workflow);
	}

	/**
	 * Append a log line to a job's output.
	 */
	appendLog(workflow: WorkflowType, id: string, line: string): void {
		useQueueStore.getState().appendLog(workflow, id, line);
	}

	/**
	 * Get the processing state for a workflow.
	 */
	isProcessing(workflow: WorkflowType): boolean {
		return useQueueStore.getState().isProcessing[workflow];
	}

	/**
	 * Set the processing state for a workflow.
	 */
	setProcessing(workflow: WorkflowType, processing: boolean): void {
		useQueueStore.getState().setProcessing(workflow, processing);
	}

	/**
	 * Subscribe to job changes in a workflow.
	 */
	subscribe(
		workflow: WorkflowType,
		callback: (jobs: JobProps[]) => void,
	): () => void {
		const emit = () => {
			callback(this.getJobs(workflow));
		};

		const unsubscribeQueue = jobStore.queues[workflow].subscribe(emit);
		const unsubscribeRuntime = jobStore.runtimeByWorkflow[workflow].subscribe(emit);
		const unsubscribeSummary = jobStore.queueSummaries[workflow].subscribe(emit);

		return () => {
			unsubscribeQueue();
			unsubscribeRuntime();
			unsubscribeSummary();
		};
	}
}
