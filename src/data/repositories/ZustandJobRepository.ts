/**
 * Zustand Job Repository Adapter
 * Implementation of IJobRepository using split state/data stores.
 *
 * @module data/repositories/ZustandJobRepository
 */

import type { IJobRepository } from "../../domain/repositories/IJobRepository";
import type { JobProps, JobUpdate } from "../../domain/entities/Job";
import type { WorkflowType } from "../../domain/types/workflow.types";
import { useQueueStore } from "../../stores/useQueueStore";
import { useJobDataStore } from "../../stores/useJobDataStore";
import { EMPTY_JOB_LOGS, useJobLogStore } from "../../stores/useJobLogStore";

/**
 * Adapter that implements IJobRepository using split Zustand stores.
 */
export class ZustandJobRepository implements IJobRepository {
	private toJobProps(workflow: WorkflowType, id: string): JobProps | undefined {
		const stateStore = useQueueStore.getState();
		const queueJob = stateStore.queues[workflow].find((job) => job.id === id);
		if (!queueJob) return undefined;

		const data = useJobDataStore.getState().jobDataById[id];
		const logs = useJobLogStore.getState().logsByJobId[id] ?? EMPTY_JOB_LOGS;
		if (!data) {
			return undefined;
		}

		return {
			id: queueJob.id,
			filename: queueJob.filename,
			path: data.path,
			system: queueJob.system,
			status: queueJob.status,
			progress: queueJob.progress,
			originalSize: queueJob.originalSize,
			compressedSize: queueJob.compressedSize,
			outputLog: logs,
			errorMessage: queueJob.errorMessage,
			strategy: data.strategy,
			startTime: queueJob.startTime,
			etaSeconds: queueJob.etaSeconds,
			discGroup: data.discGroup,
			discNumber: data.discNumber,
			sourceHash: data.sourceHash,
			verificationResult: data.verificationResult,
			platformOverride: queueJob.platformOverride,
			gameId: data.gameId,
			gameTitle: data.gameTitle,
			region: data.region,
		};
	}

	/**
	 * Get all jobs for a workflow.
	 */
	getJobs(workflow: WorkflowType): JobProps[] {
		const ids = useQueueStore.getState().queues[workflow].map((job) => job.id);
		return ids
			.map((id) => this.toJobProps(workflow, id))
			.filter((job): job is JobProps => !!job);
	}

	/**
	 * Get a specific job by ID.
	 */
	getJob(workflow: WorkflowType, id: string): JobProps | undefined {
		return this.toJobProps(workflow, id);
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

		const unsubscribeState = useQueueStore.subscribe(() => {
			emit();
		});
		const unsubscribeData = useJobDataStore.subscribe(() => {
			emit();
		});

		return () => {
			unsubscribeState();
			unsubscribeData();
		};
	}
}
