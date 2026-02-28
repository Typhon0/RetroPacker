import type { JobProps, JobUpdate } from "../../domain/entities/Job";
import type { IJobRepository } from "../../domain/repositories/IJobRepository";
import type { WorkflowType } from "../../domain/types/workflow.types";
import { jobStore } from "../../stores/JobStore";

export class ZustandJobRepository implements IJobRepository {
	getJobs(workflow: WorkflowType): JobProps[] {
		return jobStore.getQueue(workflow).map((job) => job.toJobProps());
	}

	getJob(workflow: WorkflowType, id: string): JobProps | undefined {
		return jobStore.getJob(workflow, id)?.toJobProps();
	}

	addJob(workflow: WorkflowType, job: JobProps): void {
		jobStore.addJob(workflow, job);
	}

	updateJob(workflow: WorkflowType, id: string, updates: JobUpdate): void {
		jobStore.updateJob(workflow, id, updates);
	}

	removeJob(workflow: WorkflowType, id: string): void {
		jobStore.removeJob(workflow, id);
	}

	clearQueue(workflow: WorkflowType): void {
		jobStore.clearQueue(workflow);
	}

	appendLog(workflow: WorkflowType, id: string, line: string): void {
		jobStore.appendLog(workflow, id, line);
	}

	isProcessing(workflow: WorkflowType): boolean {
		return jobStore.isProcessing[workflow].value;
	}

	setProcessing(workflow: WorkflowType, processing: boolean): void {
		jobStore.setProcessing(workflow, processing);
	}
}
