import { useEffect, useMemo } from "react";
import { useQueueStore, WorkflowType, Job } from "../stores/useQueueStore";
import { usePackerStore } from "../stores/usePackerStore";
import { useRepositories } from "../presentation/context/RepositoryContext";
import { ProcessJobUseCase } from "../domain/usecases/ProcessJobUseCase";
import { useShallow } from "zustand/react/shallow";

/**
 * Hook to process jobs in a specific workflow queue.
 * Now refactored to use Clean Architecture Use Case.
 */
export function useQueueProcessor(workflow: WorkflowType) {
	const queue = useQueueStore((state) => state.queues[workflow]);
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
			const processingCount = queue.filter(
				(j: Job) => j.status === "processing",
			).length;
			let nextRequestedJob: Job | undefined;
			for (const requestedId of startRequests) {
				const candidate = queue.find((j: Job) => j.id === requestedId);
				if (candidate?.status === "pending") {
					nextRequestedJob = candidate;
					break;
				}
				consumeStartRequest(workflow, requestedId);
			}

			const nextQueuedJob = isProcessing
				? queue.find((j: Job) => j.status === "pending")
				: undefined;
			const nextJob = nextRequestedJob ?? nextQueuedJob;

			const canDispatch =
				processingCount < concurrency &&
				(isProcessing || startRequests.length > 0) &&
				!!nextJob;

			if (!canDispatch || !nextJob) {
				return;
			}

			if (nextRequestedJob) {
				consumeStartRequest(workflow, nextRequestedJob.id);
			}

			try {
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
				useQueueStore.getState().updateJob(workflow, nextJob.id, {
					status: "failed",
					errorMessage: "Could not determine output path or start job",
				});
			}
		};

		processQueue();
	}, [
		queue,
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
