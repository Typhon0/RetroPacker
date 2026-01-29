import { useEffect } from "react";
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
	const concurrency = usePackerStore((state) => state.concurrency);
	// Use useShallow to avoid creating new object references on every render
	const settings = usePackerStore(
		useShallow((state) => ({
			preset: state.preset,
			customCompression: state.customCompression,
			chd: state.chd,
			dolphin: state.dolphin,
		})),
	);

	// Inject repositories
	const repositories = useRepositories();

	useEffect(() => {
		const processQueue = async () => {
			const processingCount = queue.filter(
				(j: Job) => j.status === "processing",
			).length;
			const nextJob = queue.find((j: Job) => j.status === "pending");

			// Debug Heartbeat - commented out to reduce overhead
			// if (isProcessing && (processingCount < concurrency || nextJob)) {
			// 	console.log(
			// 		`[QueueProcessor:${workflow}] Heartbeat - Processing: ${isProcessing}, Active: ${processingCount}, Pending: ${queue.length}, Next: ${nextJob?.filename}`,
			// 	);
			// }

			if (isProcessing && processingCount < concurrency) {
				if (nextJob) {
					try {
						const outputDir = await repositories.fileSystem.dirname(
							nextJob.path,
						);

						// Instantiate Use Case with dependencies
						const processJobUseCase = new ProcessJobUseCase(repositories);

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
				}
			}
		};

		processQueue();
	}, [queue, concurrency, isProcessing, workflow, settings, repositories]);
}
