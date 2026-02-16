import type { IJobRepository } from "../../domain/repositories/IJobRepository";
import type { JobProps, JobUpdate } from "../../domain/entities/Job";
import type { WorkflowType } from "../../domain/types/workflow.types";
import { jobStore } from "../../stores/JobStore";
import { useQueueStore } from "../../stores/useQueueStore";

export class ZustandJobRepository implements IJobRepository {
	getJobs(workflow: WorkflowType): JobProps[] {
		return jobStore.getQueue(workflow).map((job) => job.toJobProps());
	}

	getJob(workflow: WorkflowType, id: string): JobProps | undefined {
		return jobStore.getJob(workflow, id)?.toJobProps();
	}

	addJob(workflow: WorkflowType, job: JobProps): void {
		useQueueStore.getState().addJob(workflow, job);
	}

	updateJob(workflow: WorkflowType, id: string, updates: JobUpdate): void {
		useQueueStore.getState().updateJob(workflow, id, updates);
	}

	removeJob(workflow: WorkflowType, id: string): void {
		useQueueStore.getState().removeJob(workflow, id);
	}

	clearQueue(workflow: WorkflowType): void {
		useQueueStore.getState().clearQueue(workflow);
	}

	appendLog(workflow: WorkflowType, id: string, line: string): void {
		useQueueStore.getState().appendLog(workflow, id, line);
	}

	isProcessing(workflow: WorkflowType): boolean {
		return useQueueStore.getState().isProcessing[workflow];
	}

	setProcessing(workflow: WorkflowType, processing: boolean): void {
		useQueueStore.getState().setProcessing(workflow, processing);
	}
}
