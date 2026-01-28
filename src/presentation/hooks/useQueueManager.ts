/**
 * Hook - Use Queue Manager
 * Custom hook for queue management operations.
 *
 * Single Responsibility: Provides interface for queue operations.
 *
 * @module presentation/hooks/useQueueManager
 */

import { useCallback, useMemo } from "react";
import { useRepositories } from "../context/RepositoryContext";
import {
	ManageQueueUseCase,
	WorkflowFileConfig,
	WORKFLOW_FILE_CONFIGS,
} from "../../domain/usecases/ManageQueueUseCase";
import { DetectSystemUseCase } from "../../domain/usecases/DetectSystemUseCase";
import { WorkflowType } from "../../domain/types/workflow.types";

/**
 * Queue manager interface.
 */
export interface QueueManager {
	/** Add a file to the queue. */
	addFile: (filePath: string, filename: string, size: number) => Promise<void>;
	/** Add multiple files to the queue. */
	addFiles: (paths: string[]) => Promise<void>;
	/** Add all files from folders. */
	addFolders: (folderPaths: string[]) => Promise<void>;
	/** Remove a job from the queue. */
	removeJob: (jobId: string) => void;
	/** Clear all jobs from the queue. */
	clearQueue: () => void;
	/** Assign disc groups to multi-disc games. */
	assignDiscGroups: () => void;
	/** Get the file configuration for this workflow. */
	fileConfig: WorkflowFileConfig;
}

/**
 * Hook for queue management within a specific workflow.
 *
 * @param workflow - The workflow to manage
 * @returns Queue manager functions
 *
 * @example
 * ```tsx
 * const { addFiles, clearQueue, fileConfig } = useQueueManager('compress');
 *
 * const handleDrop = async (files: string[]) => {
 *   await addFiles(files);
 * };
 * ```
 */
export function useQueueManager(workflow: WorkflowType): QueueManager {
	const { jobRepository, fileSystem } = useRepositories();

	// Memoize use cases
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

	// Add a single file
	const addFile = useCallback(
		async (filePath: string, filename: string, size: number): Promise<void> => {
			await manageQueue.addFile(workflow, filePath, filename, size);
		},
		[manageQueue, workflow],
	);

	// Add multiple files
	const addFiles = useCallback(
		async (paths: string[]): Promise<void> => {
			await manageQueue.addFiles(workflow, paths);
		},
		[manageQueue, workflow],
	);

	// Add folders
	const addFolders = useCallback(
		async (folderPaths: string[]): Promise<void> => {
			await manageQueue.addFolders(workflow, folderPaths);
		},
		[manageQueue, workflow],
	);

	// Remove job
	const removeJob = useCallback(
		(jobId: string): void => {
			manageQueue.removeJob(workflow, jobId);
		},
		[manageQueue, workflow],
	);

	// Clear queue
	const clearQueue = useCallback((): void => {
		manageQueue.clearQueue(workflow);
	}, [manageQueue, workflow]);

	// Assign disc groups
	const assignDiscGroups = useCallback((): void => {
		manageQueue.assignDiscGroups(workflow);
	}, [manageQueue, workflow]);

	// Get file config
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
