import { useCallback, useMemo } from "react";
import type { JobProps } from "../../domain/entities/Job";
import type { WorkflowType } from "../../domain/types/workflow.types";
import { DetectSystemUseCase } from "../../domain/usecases/DetectSystemUseCase";
import {
	ManageQueueUseCase,
	type PreparedAddition,
	type QueueAddProgress,
	type QueueAddProgressCallback,
	type QueueAddResult,
	WORKFLOW_FILE_CONFIGS,
	type WorkflowFileConfig,
} from "../../domain/usecases/ManageQueueUseCase";
import type { ProcessJobSettings } from "../../domain/usecases/ProcessJobUseCase";
import { useRepositories } from "../context/RepositoryContext";

export interface QueueManager {
	addFile: (
		filePath: string,
		filename: string,
		size: number,
	) => Promise<QueueAddResult>;
	prepareAddFiles: (
		paths: string[],
		settings: ProcessJobSettings,
		onProgress?: QueueAddProgressCallback,
	) => Promise<PreparedAddition>;
	prepareAddFolders: (
		folderPaths: string[],
		settings: ProcessJobSettings,
		onProgress?: QueueAddProgressCallback,
	) => Promise<PreparedAddition>;
	commitAddition: (jobs: JobProps[]) => QueueAddResult[];
	removeJob: (jobId: string) => void;
	clearQueue: () => void;
	assignDiscGroups: () => void;
	fileConfig: WorkflowFileConfig;
}

export type { QueueAddProgress, PreparedAddition };
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

	const prepareAddFiles = useCallback(
		async (
			paths: string[],
			settings: ProcessJobSettings,
			onProgress?: QueueAddProgressCallback,
		): Promise<PreparedAddition> => {
			return manageQueue.prepareAddFiles(workflow, paths, settings, onProgress);
		},
		[manageQueue, workflow],
	);

	const prepareAddFolders = useCallback(
		async (
			folderPaths: string[],
			settings: ProcessJobSettings,
			onProgress?: QueueAddProgressCallback,
		): Promise<PreparedAddition> => {
			return manageQueue.prepareAddFolders(
				workflow,
				folderPaths,
				settings,
				onProgress,
			);
		},
		[manageQueue, workflow],
	);

	const commitAddition = useCallback(
		(jobs: JobProps[]): QueueAddResult[] => {
			return manageQueue.commitAddition(workflow, jobs);
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
		prepareAddFiles,
		prepareAddFolders,
		commitAddition,
		removeJob,
		clearQueue,
		assignDiscGroups,
		fileConfig,
	};
}
