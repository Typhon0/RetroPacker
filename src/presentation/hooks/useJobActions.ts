/**
 * Hook - Use Job Actions
 * Custom hook for job-related actions using Clean Architecture use cases.
 *
 * Single Responsibility: Provides a clean interface for job operations.
 *
 * @module presentation/hooks/useJobActions
 */

import { useCallback, useMemo } from "react";
import { useRepositories } from "../context/RepositoryContext";
import {
	ProcessJobUseCase,
	ProcessJobSettings,
} from "../../domain/usecases/ProcessJobUseCase";
import { JobProps } from "../../domain/entities/Job";
import { WorkflowType } from "../../domain/types/workflow.types";

/**
 * Job actions interface.
 */
export interface JobActions {
	/** Start processing a single job. */
	startJob: (job: JobProps, outputDir: string) => Promise<void>;
	/** Update a job's properties. */
	updateJob: (id: string, updates: Partial<JobProps>) => void;
	/** Remove a job from the queue. */
	removeJob: (id: string) => void;
	/** Append a log line to a job. */
	appendLog: (id: string, line: string) => void;
}

/**
 * Hook for job actions within a specific workflow.
 *
 * @param workflow - The workflow to operate on
 * @returns Job action functions
 *
 * @example
 * ```tsx
 * const { startJob, removeJob } = useJobActions('compress');
 *
 * const handleStart = async (job) => {
 *   const outputDir = await fileSystem.dirname(job.path);
 *   await startJob(job, outputDir);
 * };
 * ```
 */
export function useJobActions(workflow: WorkflowType): JobActions {
	const {
		commandExecutor,
		jobRepository,
		notificationService,
		fileSystem,
		settingsRepository,
	} = useRepositories();

	// Memoize the use case instance
	const processJobUseCase = useMemo(
		() =>
			new ProcessJobUseCase({
				commandExecutor,
				jobRepository,
				notificationService,
				fileSystem,
			}),
		[commandExecutor, jobRepository, notificationService, fileSystem],
	);

	// Start a job
	const startJob = useCallback(
		async (job: JobProps, outputDir: string): Promise<void> => {
			const settings = settingsRepository.getSettings();
			const processSettings: ProcessJobSettings = {
				preset: settings.preset,
				customCompression: settings.customCompression,
				chd: settings.chd,
				dolphin: settings.dolphin,
			};

			await processJobUseCase.execute(
				job,
				outputDir,
				workflow,
				processSettings,
			);
		},
		[processJobUseCase, settingsRepository, workflow],
	);

	// Update a job
	const updateJob = useCallback(
		(id: string, updates: Partial<JobProps>): void => {
			jobRepository.updateJob(workflow, id, updates);
		},
		[jobRepository, workflow],
	);

	// Remove a job
	const removeJob = useCallback(
		(id: string): void => {
			jobRepository.removeJob(workflow, id);
		},
		[jobRepository, workflow],
	);

	// Append log
	const appendLog = useCallback(
		(id: string, line: string): void => {
			jobRepository.appendLog(workflow, id, line);
		},
		[jobRepository, workflow],
	);

	return {
		startJob,
		updateJob,
		removeJob,
		appendLog,
	};
}
