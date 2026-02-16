import { useCallback, useMemo } from "react";
import { useRepositories } from "../context/RepositoryContext";
import {
	ManageQueueUseCase,
	WorkflowFileConfig,
	WORKFLOW_FILE_CONFIGS,
} from "../../domain/usecases/ManageQueueUseCase";
import { DetectSystemUseCase } from "../../domain/usecases/DetectSystemUseCase";
import { WorkflowType } from "../../domain/types/workflow.types";

export interface QueueManager {
	addFile: (filePath: string, filename: string, size: number) => Promise<void>;
	addFiles: (paths: string[]) => Promise<void>;
	addFolders: (folderPaths: string[]) => Promise<void>;
	removeJob: (jobId: string) => void;
	clearQueue: () => void;
	assignDiscGroups: () => void;
	fileConfig: WorkflowFileConfig;
}
export function useQueueManager(workflow: WorkflowType): QueueManager {
	const { jobRepository, fileSystem } = useRepositories();

	const detectSystem = useMemo(
		() => new DetectSystemUseCase({ fileSystem }),
		[fileSystem],
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
		async (filePath: string, filename: string, size: number): Promise<void> => {
			await manageQueue.addFile(workflow, filePath, filename, size);
		},
		[manageQueue, workflow],
	);

	const addFiles = useCallback(
		async (paths: string[]): Promise<void> => {
			await manageQueue.addFiles(workflow, paths);
		},
		[manageQueue, workflow],
	);

	const addFolders = useCallback(
		async (folderPaths: string[]): Promise<void> => {
			await manageQueue.addFolders(workflow, folderPaths);
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
