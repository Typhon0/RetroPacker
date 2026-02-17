import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { usePackerStore } from "../stores/usePackerStore";
import { useRepositories } from "../presentation/context/RepositoryContext";
import { ProcessJobUseCase } from "../domain/usecases/ProcessJobUseCase";
import { jobStore } from "@/stores/JobStore";
import { useSignalValue } from "@/hooks/useSignalValue";
import type { JobState } from "@/domain/entities/JobState";
import type { WorkflowType } from "@/domain/types/workflow.types";

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
	let pendingCount = 0;

	for (const job of queue) {
		if (job.status.value === "processing") {
			processingCount += 1;
		} else if (job.status.value === "pending") {
			pendingCount += 1;
		}
	}

	let nextRequestedJob: JobState | undefined;
	const staleRequestIds: string[] = [];

	for (const requestedId of startRequests) {
		const candidate = queue.find((job) => job.id === requestedId);
		if (candidate?.status.value === "pending") {
			nextRequestedJob = candidate;
			break;
		}
		staleRequestIds.push(requestedId);
	}

	const nextQueuedJob = isProcessing
		? queue.find((job) => job.status.value === "pending")
		: undefined;
	const nextJob = nextRequestedJob ?? nextQueuedJob;
	const hasOnlyStaleRequests = staleRequestIds.length === startRequests.length;
	const shouldAutoPause =
		isProcessing &&
		processingCount === 0 &&
		pendingCount === 0 &&
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
			outputDirectory: state.outputDirectory,
		})),
	);

	const repositories = useRepositories();

	const processJobUseCase = useMemo(
		() =>
			new ProcessJobUseCase({
				commandExecutor: repositories.commandExecutor,
				notificationService: repositories.notificationService,
				fileSystem: repositories.fileSystem,
			}),
		[
			repositories.commandExecutor,
			repositories.notificationService,
			repositories.fileSystem,
		],
	);

	useEffect(() => {
		const processQueue = async () => {
			const queue = jobStore.getQueue(workflow);
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
						console.error(`[QueueProcessor] Job execution failed unhandled:`, err);
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
		queueStats.queueLength,
		queueStats.pendingCount,
		queueStats.processingCount,
		startRequests,
		concurrency,
		isProcessing,
		workflow,
		settings,
		repositories.fileSystem,
		processJobUseCase,
	]);
}

