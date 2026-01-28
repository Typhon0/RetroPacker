/**
 * Domain Entity - Job
 * Core business entity representing a processing job.
 *
 * @module domain/entities/Job
 */

import {
	JobStatus,
	CompressionStrategy,
	VerificationResult,
	JOB_STATUS,
} from "../types/workflow.types";
import { Platform } from "../types/platform.types";

/**
 * Properties required to create a Job entity.
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

/**
 * Job Domain Entity
 *
 * Encapsulates business logic related to job processing.
 * Immutable - all mutations return new instances.
 */
export class Job {
	private constructor(private readonly props: JobProps) {}

	/**
	 * Create a new Job with pending status.
	 */
	static create(createProps: CreateJobProps): Job {
		return new Job({
			...createProps,
			status: JOB_STATUS.PENDING,
			progress: 0,
			outputLog: [],
		});
	}

	/**
	 * Reconstitute a Job from stored props.
	 */
	static fromProps(props: JobProps): Job {
		return new Job(props);
	}

	// ========== Getters ==========

	get id(): string {
		return this.props.id;
	}

	get filename(): string {
		return this.props.filename;
	}

	get path(): string {
		return this.props.path;
	}

	get system(): string {
		return this.props.system;
	}

	get status(): JobStatus {
		return this.props.status;
	}

	get progress(): number {
		return this.props.progress;
	}

	get originalSize(): number {
		return this.props.originalSize;
	}

	get compressedSize(): number | undefined {
		return this.props.compressedSize;
	}

	get outputLog(): readonly string[] {
		return this.props.outputLog;
	}

	get errorMessage(): string | undefined {
		return this.props.errorMessage;
	}

	get strategy(): CompressionStrategy {
		return this.props.strategy;
	}

	get startTime(): number | undefined {
		return this.props.startTime;
	}

	get etaSeconds(): number | undefined {
		return this.props.etaSeconds;
	}

	get discGroup(): string | undefined {
		return this.props.discGroup;
	}

	get discNumber(): number | undefined {
		return this.props.discNumber;
	}

	get sourceHash(): string | undefined {
		return this.props.sourceHash;
	}

	get verificationResult(): VerificationResult | undefined {
		return this.props.verificationResult;
	}

	get platformOverride(): Platform | undefined {
		return this.props.platformOverride;
	}

	get gameId(): string | undefined {
		return this.props.gameId;
	}

	get gameTitle(): string | undefined {
		return this.props.gameTitle;
	}

	get region(): string | undefined {
		return this.props.region;
	}

	// ========== Business Logic ==========

	/**
	 * Whether this job can be started or restarted.
	 */
	get isProcessable(): boolean {
		return (
			this.props.status === JOB_STATUS.PENDING ||
			this.props.status === JOB_STATUS.FAILED
		);
	}

	/**
	 * Whether the job is currently running.
	 */
	get isRunning(): boolean {
		return this.props.status === JOB_STATUS.PROCESSING;
	}

	/**
	 * Whether the job has completed successfully.
	 */
	get isCompleted(): boolean {
		return this.props.status === JOB_STATUS.COMPLETED;
	}

	/**
	 * Whether the job has failed.
	 */
	get isFailed(): boolean {
		return this.props.status === JOB_STATUS.FAILED;
	}

	/**
	 * Calculate compression ratio if compressed size is available.
	 * Returns a value between 0 and 1 (lower is better compression).
	 */
	get compressionRatio(): number | undefined {
		if (!this.props.compressedSize || this.props.originalSize === 0) {
			return undefined;
		}
		return this.props.compressedSize / this.props.originalSize;
	}

	/**
	 * Calculate space saved in bytes.
	 */
	get spaceSaved(): number | undefined {
		if (!this.props.compressedSize) {
			return undefined;
		}
		return this.props.originalSize - this.props.compressedSize;
	}

	/**
	 * Get elapsed time in seconds since job started.
	 */
	get elapsedSeconds(): number | undefined {
		if (!this.props.startTime) {
			return undefined;
		}
		return (Date.now() - this.props.startTime) / 1000;
	}

	/**
	 * Whether this job is part of a multi-disc set.
	 */
	get isMultiDisc(): boolean {
		return (
			this.props.discGroup !== undefined && this.props.discNumber !== undefined
		);
	}

	/**
	 * Get the effective platform (override or detected system).
	 */
	get effectivePlatform(): string {
		return this.props.platformOverride || this.props.system.toLowerCase();
	}

	// ========== Mutations (Return new instance) ==========

	/**
	 * Create a new Job with updated properties.
	 */
	update(updates: JobUpdate): Job {
		return new Job({
			...this.props,
			...updates,
		});
	}

	/**
	 * Add a log line to the output.
	 */
	appendLog(line: string): Job {
		return new Job({
			...this.props,
			outputLog: [...this.props.outputLog, line],
		});
	}

	/**
	 * Mark the job as processing.
	 */
	startProcessing(): Job {
		return new Job({
			...this.props,
			status: JOB_STATUS.PROCESSING,
			progress: 0,
			startTime: Date.now(),
			errorMessage: undefined,
		});
	}

	/**
	 * Mark the job as completed.
	 */
	complete(compressedSize?: number): Job {
		return new Job({
			...this.props,
			status: JOB_STATUS.COMPLETED,
			progress: 100,
			etaSeconds: 0,
			compressedSize,
		});
	}

	/**
	 * Mark the job as failed.
	 */
	fail(errorMessage: string): Job {
		return new Job({
			...this.props,
			status: JOB_STATUS.FAILED,
			errorMessage,
		});
	}

	/**
	 * Convert to plain object for persistence/serialization.
	 */
	toProps(): JobProps {
		return { ...this.props };
	}
}
