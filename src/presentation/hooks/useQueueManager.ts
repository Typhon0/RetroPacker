import { useCallback, useMemo } from "react";
import type { WorkflowType } from "../../domain/types/workflow.types";
import { DetectSystemUseCase } from "../../domain/usecases/DetectSystemUseCase";
import {
	ManageQueueUseCase,
	type QueueAddProgress,
	type QueueAddProgressCallback,
	type QueueAddResult,
	WORKFLOW_FILE_CONFIGS,
	type WorkflowFileConfig,
} from "../../domain/usecases/ManageQueueUseCase";
import { useRepositories } from "../context/RepositoryContext";

export interface QueueManager {
	addFile: (
		filePath: string,
		filename: string,
		size: number,
	) => Promise<QueueAddResult>;
	addFiles: (
		paths: string[],
		onProgress?: QueueAddProgressCallback,
	) => Promise<QueueAddResult[]>;
	addFolders: (
		folderPaths: string[],
		onProgress?: QueueAddProgressCallback,
	) => Promise<QueueAddResult[]>;
	removeJob: (jobId: string) => void;
	clearQueue: () => void;
	assignDiscGroups: () => void;
	fileConfig: WorkflowFileConfig;
}

export type { QueueAddProgress };
export function useQueueManager(workflow: WorkflowType): QueueManager {
	const { jobRepository, fileSystem, commandExecutor } = useRepositories();

	const detectSystem = useMemo(
		() => new DetectSystemUseCase({ fileSystem, commandExecutor }),
		[fileSystem, commandExecutor],
	);

	const manageQueue = useMemo(
		() =>
			new ManageQueueUseCase({
				jobRepository,
				fileSystem,
				detectSystem,
			}),
		[jobRepository, fileSystem, detectSystem],
	);

	const addFile = useCallback(
		async (
			filePath: string,
			filename: string,
			size: number,
		): Promise<QueueAddResult> => {
			return manageQueue.addFile(workflow, filePath, filename, size);
		},
		[manageQueue, workflow],
	);

	const addFiles = useCallback(
		async (
			paths: string[],
			onProgress?: QueueAddProgressCallback,
		): Promise<QueueAddResult[]> => {
			return manageQueue.addFiles(workflow, paths, onProgress);
		},
		[manageQueue, workflow],
	);

	const addFolders = useCallback(
		async (
			folderPaths: string[],
			onProgress?: QueueAddProgressCallback,
		): Promise<QueueAddResult[]> => {
			return manageQueue.addFolders(workflow, folderPaths, onProgress);
		},
		[manageQueue, workflow],
	);

	const removeJob = useCallback(
		(jobId: string): void => {
			manageQueue.removeJob(workflow, jobId);
		},
		[manageQueue, workflow],
	);

	const clearQueue = useCallback((): void => {
		manageQueue.clearQueue(workflow);
	}, [manageQueue, workflow]);

	const assignDiscGroups = useCallback((): void => {
		manageQueue.assignDiscGroups(workflow);
	}, [manageQueue, workflow]);

	const fileConfig = WORKFLOW_FILE_CONFIGS[workflow];

	return {
		addFile,
		addFiles,
		addFolders,
		removeJob,
		clearQueue,
		assignDiscGroups,
		fileConfig,
	};
}
