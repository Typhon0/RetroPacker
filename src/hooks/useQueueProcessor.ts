import { useEffect, useMemo } from "react";
import { useQueueStore, WorkflowType } from "../stores/useQueueStore";
import { usePackerStore } from "../stores/usePackerStore";
import { useRepositories } from "../presentation/context/RepositoryContext";
import { ProcessJobUseCase } from "../domain/usecases/ProcessJobUseCase";
import { useShallow } from "zustand/react/shallow";

/**
 * Hook to process jobs in a specific workflow queue.
 * Now refactored to use Clean Architecture Use Case.
 */
export function useQueueProcessor(workflow: WorkflowType) {
	const queueSignal = useQueueStore(
		useShallow((state) => {
			const queue = state.queues[workflow];
			let pendingCount = 0;
			let processingCount = 0;
			for (const job of queue) {
				if (job.status === "pending") {
					pendingCount += 1;
					continue;
				}
				if (job.status === "processing") {
					processingCount += 1;
				}
			}
			return {
				queueLength: queue.length,
				pendingCount,
				processingCount,
			};
		}),
	);
	const isProcessing = useQueueStore((state) => state.isProcessing[workflow]);
	const startRequests = useQueueStore((state) => state.startRequests[workflow]);
	const consumeStartRequest = useQueueStore(
		(state) => state.consumeStartRequest,
	);
	const concurrency = usePackerStore((state) => state.concurrency);
	// Use useShallow to avoid creating new object references on every render
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

	// Inject repositories
	const repositories = useRepositories();

	// Memoize ProcessJobUseCase so we don't create a new instance per job
	const processJobUseCase = useMemo(
		() => new ProcessJobUseCase(repositories),
		[repositories],
	);

	useEffect(() => {
		const processQueue = async () => {
			const { queues, startRequests: allStartRequests } =
				useQueueStore.getState();
			const queue = queues[workflow];
			const latestStartRequests = allStartRequests[workflow];
			const processingCount = queue.filter(
				(job) => job.status === "processing",
			).length;
			let nextRequestedJob = undefined as (typeof queue)[number] | undefined;
			for (const requestedId of latestStartRequests) {
				const candidate = queue.find((job) => job.id === requestedId);
				if (candidate?.status === "pending") {
					nextRequestedJob = candidate;
					break;
				}
				consumeStartRequest(workflow, requestedId);
			}

			const nextQueuedJob = isProcessing
				? queue.find((job) => job.status === "pending")
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
				const nextJob = repositories.jobRepository.getJob(
					workflow,
					nextJobState.id,
				);
				if (!nextJob) {
					useQueueStore.getState().updateJob(workflow, nextJobState.id, {
						status: "failed",
						errorMessage: "Missing job metadata",
					});
					return;
				}

				const outputDir = settings.outputDirectory
					? settings.outputDirectory
					: await repositories.fileSystem.dirname(nextJob.path);

				// Use memoized Use Case instance

				// Execute Job
				// Note: floating promise is intentional here as we don't await completion to allow concurrency
				processJobUseCase
					.execute(nextJob, outputDir, workflow, settings)
					.catch((err) => {
						console.error(
							`[QueueProcessor] Job execution failed unhandled:`,
							err,
						);
					});
			} catch (e) {
				console.error("Failed to start job", e);
				useQueueStore.getState().updateJob(workflow, nextJobState.id, {
					status: "failed",
					errorMessage: "Could not determine output path or start job",
				});
			}
		};

		processQueue();
	}, [
		queueSignal.queueLength,
		queueSignal.pendingCount,
		queueSignal.processingCount,
		startRequests,
		consumeStartRequest,
		concurrency,
		isProcessing,
		workflow,
		settings,
		repositories,
		processJobUseCase,
	]);
}
