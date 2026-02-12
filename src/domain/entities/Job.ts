/**
 * Domain Entity - Job
 * Type definitions for processing jobs.
 *
 * @module domain/entities/Job
 */

import type {
	JobStatus,
	CompressionStrategy,
	VerificationResult,
} from "../types/workflow.types";
import type { Platform } from "../types/platform.types";

/**
 * Properties representing a Job entity.
 */
export interface JobProps {
	readonly id: string;
	readonly filename: string;
	readonly path: string;
	readonly system: string;
	readonly status: JobStatus;
	readonly progress: number;
	readonly originalSize: number;
	readonly compressedSize?: number;
	readonly outputLog: readonly string[];
	readonly errorMessage?: string;
	readonly strategy: CompressionStrategy;
	readonly startTime?: number;
	readonly etaSeconds?: number;
	readonly discGroup?: string;
	readonly discNumber?: number;
	readonly sourceHash?: string;
	readonly verificationResult?: VerificationResult;
	readonly platformOverride?: Platform;
	readonly gameId?: string;
	readonly gameTitle?: string;
	readonly region?: string;
}

/**
 * Properties for creating a new Job.
 */
export interface CreateJobProps {
	readonly id: string;
	readonly filename: string;
	readonly path: string;
	readonly system: string;
	readonly originalSize: number;
	readonly strategy: CompressionStrategy;
	readonly discGroup?: string;
	readonly discNumber?: number;
}

/**
 * Job update properties (partial).
 */
export type JobUpdate = Partial<Omit<JobProps, "id" | "filename" | "path">>;
