import type { JobProps } from "../entities/Job";
import {
	isDvdSystem,
	isNintendoPlatform,
	isNintendoSystem,
} from "../types/platform.types";
import type { WorkflowType } from "../types/workflow.types";
import type { ProcessJobSettings } from "../usecases/ProcessJobUseCase";

export type ConflictType =
	| "duplicate_input"
	| "output_collision_queue"
	| "output_collision_batch";

export interface JobConflict {
	readonly newJobId: string;
	readonly type: ConflictType;
	readonly message: string;
	readonly conflictingPath?: string;
}

export interface ConflictReport {
	readonly validJobs: JobProps[];
	readonly conflicts: JobConflict[];
	readonly hasConflicts: boolean;
}

export class QueueAnalyzerService {
	/**
	 * Analyze a batch of new jobs against the existing queue to detect conflicts.
	 */
	static analyzeConflicts(
		workflow: WorkflowType,
		newJobs: JobProps[],
		existingJobs: JobProps[],
		settings: ProcessJobSettings,
	): ConflictReport {
		const validJobs: JobProps[] = [];
		const conflicts: JobConflict[] = [];

		// No output collisions for read-only workflows
		const checkOutputs = workflow === "compress" || workflow === "extract";

		// Track paths from existing jobs to find duplicates
		const existingInputPaths = new Set(existingJobs.map((j) => j.path));

		// Track predicted outputs
		// Map of outputFilePath -> source Job ID
		const existingOutputs = new Map<string, string>();
		if (checkOutputs) {
			for (const job of existingJobs) {
				const outputs = QueueAnalyzerService.predictOutputPaths(
					workflow,
					job,
					settings,
				);
				for (const out of outputs) {
					existingOutputs.set(out, job.id);
				}
			}
		}

		// Track outputs for the current batch
		const batchOutputs = new Map<string, string>();

		for (const newJob of newJobs) {
			// 1. Check Duplicate Input
			if (existingInputPaths.has(newJob.path)) {
				conflicts.push({
					newJobId: newJob.id,
					type: "duplicate_input",
					message: `File is already in the queue or batch: ${newJob.filename}`,
					conflictingPath: newJob.path,
				});
				continue;
			}
			existingInputPaths.add(newJob.path);

			// 2. Check Output Collisions
			let hasOutputCollision = false;
			if (checkOutputs) {
				const predictedOutputs = QueueAnalyzerService.predictOutputPaths(
					workflow,
					newJob,
					settings,
				);

				for (const outPath of predictedOutputs) {
					// Check against existing queue
					if (existingOutputs.has(outPath)) {
						conflicts.push({
							newJobId: newJob.id,
							type: "output_collision_queue",
							message: `Output filename collides with a job already in the queue: ${outPath}`,
							conflictingPath: outPath,
						});
						hasOutputCollision = true;
						break;
					}

					// Check against batch
					if (batchOutputs.has(outPath)) {
						conflicts.push({
							newJobId: newJob.id,
							type: "output_collision_batch",
							message: `Output filename collides with another file added at the same time: ${outPath}`,
							conflictingPath: outPath,
						});
						hasOutputCollision = true;
						break;
					}
				}

				if (!hasOutputCollision) {
					// Register this job's outputs in the batch tracker
					for (const outPath of predictedOutputs) {
						batchOutputs.set(outPath, newJob.id);
					}
				}
			}

			if (!hasOutputCollision) {
				validJobs.push(newJob);
			}
		}

		return {
			validJobs,
			conflicts,
			hasConflicts: conflicts.length > 0,
		};
	}

	/**
	 * Predict the output paths for a given job and workflow.
	 * Returns just the filenames (since directory is the same for all jobs in a queue).
	 */
	static predictOutputPaths(
		workflow: WorkflowType,
		job: JobProps,
		settings: ProcessJobSettings,
	): string[] {
		const baseName = QueueAnalyzerService.getOutputBaseName(job.filename);
		const usesDolphin = QueueAnalyzerService.checkUsesDolphin(job);

		if (workflow === "compress") {
			if (usesDolphin) {
				const format = settings.dolphin.format;
				const ext = format === "iso" ? "iso" : format === "gcz" ? "gcz" : "rvz";
				return [`${baseName}.${ext}`];
			}
			return [`${baseName}.chd`];
		}

		if (workflow === "extract") {
			if (usesDolphin) {
				return [`${baseName}.iso`];
			}

			const effectiveSystem = job.system.toLowerCase();
			const isDvd = isDvdSystem(effectiveSystem);

			if (isDvd) {
				return [`${baseName}.iso`];
			}
			return [`${baseName}.cue`, `${baseName}.bin`];
		}

		return [];
	}

	private static checkUsesDolphin(job: JobProps): boolean {
		const system = job.system?.toLowerCase() ?? "";
		if (isNintendoSystem(system) || isNintendoPlatform(system)) {
			return true;
		}
		const ext = job.path.split(".").pop()?.toLowerCase();
		if (ext && ["gcm", "wbfs", "rvz", "gcz", "wia"].includes(ext)) {
			return true;
		}
		return false;
	}

	private static getOutputBaseName(filename: string): string {
		const lastDot = filename.lastIndexOf(".");
		if (lastDot <= 0) {
			return filename;
		}
		return filename.slice(0, lastDot);
	}
}
