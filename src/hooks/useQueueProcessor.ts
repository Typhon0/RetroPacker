import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { JobState } from "@/domain/entities/JobState";
import type { WorkflowType } from "@/domain/types/workflow.types";
import { useSignalValue } from "@/hooks/useSignalValue";
import { filterVisibleCueBinJobs } from "@/lib/cueBinLinking";
import { jobStore } from "@/stores/JobStore";
import { ProcessJobUseCase } from "../domain/usecases/ProcessJobUseCase";
import { useRepositories } from "../presentation/context/RepositoryContext";
import { usePackerStore } from "../stores/usePackerStore";
import { usePrevious } from "./usePrevious";

export interface QueueDispatchPlan {
	processingCount: number;
	nextJob: JobState | undefined;
	staleRequestIds: string[];
	selectedRequestedId?: string;
	canDispatch: boolean;
	shouldAutoPause: boolean;
}

export function planQueueDispatch(params: {
	queue: readonly JobState[];
	startRequests: readonly string[];
	isProcessing: boolean;
	concurrency: number;
}): QueueDispatchPlan {
	const { queue, startRequests, isProcessing, concurrency } = params;
	let processingCount = 0;
	let dispatchablePendingCount = 0;

	for (const job of queue) {
		if (job.status.value === "processing") {
			processingCount += 1;
		} else if (job.status.value === "pending" && job.isReadyToProcess.value) {
			dispatchablePendingCount += 1;
		}
	}

	let nextRequestedJob: JobState | undefined;
	const staleRequestIds: string[] = [];

	for (const requestedId of startRequests) {
		const candidate = queue.find((job) => job.id === requestedId);
		if (
			candidate?.status.value === "pending" &&
			candidate.isReadyToProcess.value
		) {
			nextRequestedJob = candidate;
			break;
		}
		staleRequestIds.push(requestedId);
	}

	const nextQueuedJob = isProcessing
		? queue.find(
				(job) => job.status.value === "pending" && job.isReadyToProcess.value,
			)
		: undefined;
	const nextJob = nextRequestedJob ?? nextQueuedJob;
	const hasOnlyStaleRequests = staleRequestIds.length === startRequests.length;
	const shouldAutoPause =
		isProcessing &&
		processingCount === 0 &&
		dispatchablePendingCount === 0 &&
		hasOnlyStaleRequests;

	return {
		processingCount,
		nextJob,
		staleRequestIds,
		selectedRequestedId: nextRequestedJob?.id,
		canDispatch:
			processingCount < concurrency &&
			(isProcessing || startRequests.length > 0) &&
			!!nextJob,
		shouldAutoPause,
	};
}

/**
 * Hook to process jobs in a specific workflow queue.
 * Uses signal-derived queue stats so progress ticks do not wake the processor.
 */
export function useQueueProcessor(workflow: WorkflowType) {
	const queueStats = useSignalValue(jobStore.queueStats[workflow]);
	const isProcessing = useSignalValue(jobStore.isProcessing[workflow]);
	const startRequests = useSignalValue(jobStore.startRequests[workflow]);
	const concurrency = usePackerStore((state) => state.concurrency);

	const settings = usePackerStore(
		useShallow((state) => ({
			preset: state.preset,
			customCompression: state.customCompression,
			chd: state.chd,
			dolphin: state.dolphin,
			deleteSourceAfterSuccess: state.deleteSourceAfterSuccess,
			skipExisting: state.skipExisting,
			outputDirectory: state.outputDirectory,
		})),
	);

	const repositories = useRepositories();

	const processJobUseCase = useMemo(
		() =>
			new ProcessJobUseCase({
				commandExecutor: repositories.commandExecutor,
				databaseRepository: repositories.databaseRepository,
				notificationService: repositories.notificationService,
				fileSystem: repositories.fileSystem,
			}),
		[
			repositories.commandExecutor,
			repositories.databaseRepository,
			repositories.notificationService,
			repositories.fileSystem,
		],
	);

	const prevIsProcessing = usePrevious(isProcessing);
	const dispatchRevision = `${queueStats.queueLength}:${queueStats.pendingCount}:${queueStats.processingCount}:${startRequests.join(",")}`;

	// Batch completion notification + M3U generation
	useEffect(() => {
		// If we were processing, but now we're not, and the queue has jobs,
		// and there are no more pending/processing jobs...
		if (
			prevIsProcessing === true &&
			isProcessing === false &&
			queueStats.queueLength > 0 &&
			queueStats.pendingCount === 0 &&
			queueStats.processingCount === 0
		) {
			const label = workflow.charAt(0).toUpperCase() + workflow.slice(1);
			const text =
				queueStats.failedCount > 0
					? `Batch ${label} complete with ${queueStats.failedCount} failures.`
					: `Batch ${label} completed successfully!`;

			repositories.notificationService
				.notifySuccess(`${label} Complete`, text)
				.catch((err) => console.warn("Notification delivery failed:", err));

			// M3U playlist generation for compress workflow
			if (workflow === "compress" && queueStats.completedCount > 0) {
				void (async () => {
					try {
						const queue = jobStore.getQueue(workflow);
						const visibleQueue = filterVisibleCueBinJobs(queue);
						const completedPaths: string[] = [];

						for (const job of visibleQueue) {
							if (job.status.value !== "completed") continue;
							const baseName = job.filename.replace(/\.[^.]+$/, "");
							const outputDir = settings.outputDirectory
								? settings.outputDirectory
								: await repositories.fileSystem.dirname(job.path);
							const chdPath = await repositories.fileSystem.joinPath(
								outputDir,
								`${baseName}.chd`,
							);
							completedPaths.push(chdPath);
						}

						if (completedPaths.length > 0) {
							const firstVisibleJob = visibleQueue[0];
							if (!firstVisibleJob) {
								return;
							}
							const { generateM3uFiles } = await import(
								"@/services/M3uGeneratorService"
							);
							const outputDir = settings.outputDirectory
								? settings.outputDirectory
								: await repositories.fileSystem.dirname(firstVisibleJob.path);
							const generated = await generateM3uFiles(
								outputDir,
								completedPaths,
								repositories.fileSystem,
							);
							if (generated.length > 0) {
								console.log(
									`[QueueProcessor] Generated ${generated.length} M3U playlist(s)`,
								);
							}
						}
					} catch (err) {
						console.warn(
							`[QueueProcessor] M3U generation failed for workflow ${workflow}:`,
							err,
						);
					}
				})();
			}
		}
	}, [
		isProcessing,
		prevIsProcessing,
		queueStats.queueLength,
		queueStats.pendingCount,
		queueStats.processingCount,
		queueStats.failedCount,
		queueStats.completedCount,
		workflow,
		repositories.notificationService,
		repositories.fileSystem,
		settings.outputDirectory,
	]);

	useEffect(() => {
		void dispatchRevision;
		const processQueue = async () => {
			const queue = filterVisibleCueBinJobs(jobStore.getQueue(workflow));
			const latestStartRequests = jobStore.startRequests[workflow].value;
			const plan = planQueueDispatch({
				queue,
				startRequests: latestStartRequests,
				isProcessing,
				concurrency,
			});

			for (const staleRequestId of plan.staleRequestIds) {
				jobStore.consumeStartRequest(workflow, staleRequestId);
			}

			if (plan.shouldAutoPause) {
				jobStore.setProcessing(workflow, false);
				return;
			}

			if (!plan.canDispatch || !plan.nextJob) {
				return;
			}

			if (plan.selectedRequestedId) {
				jobStore.consumeStartRequest(workflow, plan.selectedRequestedId);
			}

			try {
				const outputDir = settings.outputDirectory
					? settings.outputDirectory
					: await repositories.fileSystem.dirname(plan.nextJob.path);

				processJobUseCase
					.execute(plan.nextJob, outputDir, workflow, settings)
					.catch((err) => {
						console.error(
							`[QueueProcessor] Job execution failed unhandled:`,
							err,
						);
					});
			} catch (e) {
				console.error("Failed to start job", e);
				jobStore.updateJob(workflow, plan.nextJob.id, {
					status: "failed",
					errorMessage: "Could not determine output path or start job",
				});
			}
		};

		void processQueue();
	}, [
		dispatchRevision,
		concurrency,
		isProcessing,
		workflow,
		settings,
		repositories.fileSystem,
		processJobUseCase,
	]);
}
