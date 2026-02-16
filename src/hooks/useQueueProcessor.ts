import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useQueueStore, WorkflowType } from "../stores/useQueueStore";
import { usePackerStore } from "../stores/usePackerStore";
import { useRepositories } from "../presentation/context/RepositoryContext";
import { ProcessJobUseCase } from "../domain/usecases/ProcessJobUseCase";
import { jobStore } from "@/stores/JobStore";
import { useSignalValue } from "@/hooks/useSignalValue";

/**
 * Hook to process jobs in a specific workflow queue.
 * Uses signal-derived queue stats so progress ticks do not wake the processor.
 */
export function useQueueProcessor(workflow: WorkflowType) {
	const queueStats = useSignalValue(jobStore.queueStats[workflow]);
	const isProcessing = useQueueStore((state) => state.isProcessing[workflow]);
	const startRequests = useQueueStore((state) => state.startRequests[workflow]);
	const consumeStartRequest = useQueueStore(
		(state) => state.consumeStartRequest,
	);
	const updateJob = useQueueStore((state) => state.updateJob);
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
			const latestStartRequests = useQueueStore.getState().startRequests[workflow];
			const processingCount = queue.filter(
				(job) => job.status.value === "processing",
			).length;

			let nextRequestedJob = undefined as (typeof queue)[number] | undefined;
			for (const requestedId of latestStartRequests) {
				const candidate = queue.find((job) => job.id === requestedId);
				if (candidate?.status.value === "pending") {
					nextRequestedJob = candidate;
					break;
				}
				consumeStartRequest(workflow, requestedId);
			}

			const nextQueuedJob = isProcessing
				? queue.find((job) => job.status.value === "pending")
				: undefined;
			const nextJobState = nextRequestedJob ?? nextQueuedJob;

			const canDispatch =
				processingCount < concurrency &&
				(isProcessing || latestStartRequests.length > 0) &&
				!!nextJobState;

			if (!canDispatch || !nextJobState) {
				return;
			}

			if (nextRequestedJob) {
				consumeStartRequest(workflow, nextRequestedJob.id);
			}

			try {
				const outputDir = settings.outputDirectory
					? settings.outputDirectory
					: await repositories.fileSystem.dirname(nextJobState.path);

				processJobUseCase
					.execute(nextJobState, outputDir, workflow, settings)
					.catch((err) => {
						console.error(`[QueueProcessor] Job execution failed unhandled:`, err);
					});
			} catch (e) {
				console.error("Failed to start job", e);
				updateJob(workflow, nextJobState.id, {
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
		consumeStartRequest,
		concurrency,
		isProcessing,
		workflow,
		settings,
		repositories.fileSystem,
		processJobUseCase,
		updateJob,
	]);
}
