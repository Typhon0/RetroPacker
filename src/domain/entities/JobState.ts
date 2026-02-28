import {
	computed,
	type ReadonlySignal,
	type Signal,
	signal,
} from "@preact/signals-core";
import type { JobProps } from "@/domain/entities/Job";
import type { Platform } from "@/domain/types/platform.types";
import type {
	CompressionStrategy,
	JobStatus,
	VerificationResult,
	WorkflowType,
} from "@/domain/types/workflow.types";

const MAX_LOG_LINES_PER_JOB = 2000;
const LOG_FLUSH_INTERVAL_MS = 200;
const LOG_BATCH_SIZE = 20;

/**
 * Active in-memory job entity backed by fine-grained signals.
 *
 * Structural fields are immutable for stable identity.
 * Volatile telemetry and metadata are stored in signals.
 */
export class JobState {
	readonly workflow: WorkflowType;
	readonly id: string;
	readonly filename: string;
	readonly path: string;
	readonly originalSize: number;
	readonly strategy: CompressionStrategy;

	readonly system: Signal<string>;
	readonly status: Signal<JobStatus>;
	readonly progress: Signal<number>;
	readonly compressedSize: Signal<number | undefined>;
	readonly compressionRatio: Signal<number | undefined>;
	readonly outputLog: Signal<readonly string[]>;
	readonly errorMessage: Signal<string | undefined>;
	readonly startTime: Signal<number | undefined>;
	readonly endTime: Signal<number | undefined>;
	readonly etaSeconds: Signal<number | undefined>;
	readonly discGroup: Signal<string | undefined>;
	readonly discNumber: Signal<number | undefined>;
	readonly sourceHash: Signal<string | undefined>;
	readonly verificationResult: Signal<VerificationResult | undefined>;
	readonly platformOverride: Signal<Platform | undefined>;
	readonly gameId: Signal<string | undefined>;
	readonly gameTitle: Signal<string | undefined>;
	readonly region: Signal<string | undefined>;
	readonly indeterminate: Signal<boolean>;

	readonly isProcessing: ReadonlySignal<boolean>;
	readonly isFailed: ReadonlySignal<boolean>;
	readonly isReadyToProcess: ReadonlySignal<boolean>;
	readonly elapsedMs: ReadonlySignal<number | undefined>;

	private logBuffer: string[] = [];
	private flushTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(workflow: WorkflowType, props: JobProps) {
		this.workflow = workflow;
		this.id = props.id;
		this.filename = props.filename;
		this.path = props.path;
		this.originalSize = props.originalSize;
		this.strategy = props.strategy;

		this.system = signal(props.system);
		this.status = signal(props.status);
		this.progress = signal(props.progress);
		this.compressedSize = signal(props.compressedSize);
		this.compressionRatio = signal(props.compressionRatio);
		this.outputLog = signal(props.outputLog.slice(-MAX_LOG_LINES_PER_JOB));
		this.errorMessage = signal(props.errorMessage);
		this.startTime = signal(props.startTime);
		this.endTime = signal(props.endTime);
		this.etaSeconds = signal(props.etaSeconds);
		this.discGroup = signal(props.discGroup);
		this.discNumber = signal(props.discNumber);
		this.sourceHash = signal(props.sourceHash);
		this.verificationResult = signal(props.verificationResult);
		this.platformOverride = signal(props.platformOverride);
		this.gameId = signal(props.gameId);
		this.gameTitle = signal(props.gameTitle);
		this.region = signal(props.region);
		this.indeterminate = signal(false);

		this.isProcessing = computed(() => this.status.value === "processing");
		this.isFailed = computed(() => this.status.value === "failed");
		this.isReadyToProcess = computed(
			() =>
				this.system.value !== "Unknown" ||
				this.platformOverride.value !== undefined,
		);
		this.elapsedMs = computed(() => {
			const start = this.startTime.value;
			const end = this.endTime.value;
			if (start === undefined || end === undefined) return undefined;
			return end - start;
		});
	}

	updateProgress(value: number, etaSeconds?: number): void {
		const clamped = Math.max(0, Math.min(100, value));
		this.progress.value = clamped;
		if (etaSeconds !== undefined) {
			this.etaSeconds.value = Math.max(0, etaSeconds);
		}
	}

	setStatus(value: JobStatus): void {
		this.status.value = value;
	}

	setErrorMessage(value: string | undefined): void {
		this.errorMessage.value = value;
	}

	setStartTime(value: number | undefined): void {
		this.startTime.value = value;
	}

	setEtaSeconds(value: number | undefined): void {
		this.etaSeconds.value = value;
	}

	setCompressionRatio(value: number | undefined): void {
		this.compressionRatio.value = value;
	}

	appendLog(line: string): void {
		this.logBuffer.push(line);
		if (this.logBuffer.length >= LOG_BATCH_SIZE) {
			this.flushBufferedLogs();
			return;
		}
		this.scheduleBufferedFlush();
	}

	appendLogs(lines: readonly string[]): void {
		if (lines.length === 0) return;
		this.logBuffer.push(...lines);
		if (this.logBuffer.length >= LOG_BATCH_SIZE) {
			this.flushBufferedLogs();
			return;
		}
		this.scheduleBufferedFlush();
	}

	clearLogs(): void {
		this.clearBufferedLogs();
		if (this.outputLog.value.length === 0) return;
		this.outputLog.value = [];
	}

	resetForRetry(): void {
		this.status.value = "pending";
		this.progress.value = 0;
		this.errorMessage.value = undefined;
		this.etaSeconds.value = undefined;
		this.startTime.value = undefined;
		this.endTime.value = undefined;
		this.compressionRatio.value = undefined;
		this.indeterminate.value = false;
		this.clearLogs();
	}

	applyUpdates(updates: Partial<JobProps>): void {
		if ("system" in updates && updates.system !== undefined) {
			this.system.value = updates.system;
		}
		if ("status" in updates && updates.status !== undefined) {
			this.status.value = updates.status;
		}
		if ("progress" in updates && updates.progress !== undefined) {
			this.updateProgress(updates.progress);
		}
		if ("compressedSize" in updates) {
			this.compressedSize.value = updates.compressedSize;
		}
		if ("compressionRatio" in updates) {
			this.compressionRatio.value = updates.compressionRatio;
		}
		if ("outputLog" in updates && Array.isArray(updates.outputLog)) {
			this.clearBufferedLogs();
			this.outputLog.value = updates.outputLog.slice(-MAX_LOG_LINES_PER_JOB);
		}
		if ("errorMessage" in updates) {
			this.errorMessage.value = updates.errorMessage;
		}
		if ("startTime" in updates) this.startTime.value = updates.startTime;
		if ("endTime" in updates) this.endTime.value = updates.endTime;
		if ("etaSeconds" in updates) this.etaSeconds.value = updates.etaSeconds;
		if ("discGroup" in updates) this.discGroup.value = updates.discGroup;
		if ("discNumber" in updates) this.discNumber.value = updates.discNumber;
		if ("sourceHash" in updates) this.sourceHash.value = updates.sourceHash;
		if ("verificationResult" in updates) {
			this.verificationResult.value = updates.verificationResult;
		}
		if ("platformOverride" in updates) {
			this.platformOverride.value = updates.platformOverride;
		}
		if ("gameId" in updates) this.gameId.value = updates.gameId;
		if ("gameTitle" in updates) this.gameTitle.value = updates.gameTitle;
		if ("region" in updates) this.region.value = updates.region;
	}

	toJobProps(): JobProps {
		const logs =
			this.logBuffer.length > 0
				? [...this.outputLog.value, ...this.logBuffer].slice(
						-MAX_LOG_LINES_PER_JOB,
					)
				: this.outputLog.value;

		return {
			id: this.id,
			filename: this.filename,
			path: this.path,
			system: this.system.value,
			status: this.status.value,
			progress: this.progress.value,
			originalSize: this.originalSize,
			compressedSize: this.compressedSize.value,
			compressionRatio: this.compressionRatio.value,
			outputLog: logs,
			errorMessage: this.errorMessage.value,
			strategy: this.strategy,
			startTime: this.startTime.value,
			endTime: this.endTime.value,
			etaSeconds: this.etaSeconds.value,
			discGroup: this.discGroup.value,
			discNumber: this.discNumber.value,
			sourceHash: this.sourceHash.value,
			verificationResult: this.verificationResult.value,
			platformOverride: this.platformOverride.value,
			gameId: this.gameId.value,
			gameTitle: this.gameTitle.value,
			region: this.region.value,
		};
	}

	dispose(): void {
		this.clearBufferedLogs();
	}

	flushBufferedLogs(): void {
		this.clearFlushTimer();
		if (this.logBuffer.length === 0) return;

		const next = [...this.outputLog.value, ...this.logBuffer];
		this.logBuffer = [];
		this.outputLog.value =
			next.length > MAX_LOG_LINES_PER_JOB
				? next.slice(-MAX_LOG_LINES_PER_JOB)
				: next;
	}

	private scheduleBufferedFlush(): void {
		if (this.flushTimer) return;
		this.flushTimer = setTimeout(() => {
			this.flushBufferedLogs();
		}, LOG_FLUSH_INTERVAL_MS);
	}

	private clearBufferedLogs(): void {
		this.clearFlushTimer();
		this.logBuffer = [];
	}

	private clearFlushTimer(): void {
		if (!this.flushTimer) return;
		clearTimeout(this.flushTimer);
		this.flushTimer = undefined;
	}
}
