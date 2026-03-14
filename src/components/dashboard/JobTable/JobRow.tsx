/**
 * JobRow - Renders a single job row in the job table
 *
 * Single Responsibility: Only handles job row rendering and interactions.
 * Uses ID-based callbacks to maintain stable references for React.memo.
 *
 * @module components/dashboard/JobTable/JobRow
 */

import {
	AlertCircle,
	AlertTriangle,
	BadgeCheck,
	CheckCircle,
	Link2,
	PlayCircle,
	ShieldCheck,
	ShieldX,
} from "lucide-react";
import React from "react";
import { Progress } from "@/components/ui/progress";
import { createJobRowActions, RowActions } from "@/components/ui/row-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableCell, TableRow } from "@/components/ui/table";
import type { JobState } from "@/domain/entities/JobState";
import type { Platform } from "@/domain/types/platform.types";
import { useSignalValue } from "@/hooks/useSignalValue";
import {
	cn,
	estimateSavedBytes,
	formatDeltaSize,
	formatDuration,
	formatPlatformLabel,
	formatRatio,
	formatSize,
} from "@/lib/utils";
import { CoverThumbnail } from "../CoverThumbnail";
import { PlatformSelector } from "../PlatformSelector";

interface JobRowProps {
	job: JobState;
	depth: number;
	isSelected: boolean;
	folderOverride?: Platform;
	isCueBinLinked: boolean;
	linkedCompanionFilename?: string;
	onSelect: (jobId: string) => void;
	onStart: (jobId: string) => void;
	onRemove: (jobId: string) => void;
	onUpdatePlatform: (jobId: string, platform: Platform | undefined) => void;
	onOpenLocation: (jobId: string) => void;
}

const JobStatusIcon = React.memo(({ job }: { job: JobState }) => {
	const status = useSignalValue(job.status);
	const dataSha1 = useSignalValue(job.dataSha1);
	const verifiedName = useSignalValue(job.verifiedName);
	const verificationResult = useSignalValue(job.verificationResult);

	const wrapperClass = cn(
		"transition-opacity duration-200",
		status === "completed" && "status-complete",
	);

	if (status === "processing") {
		return (
			<div className={wrapperClass}>
				<PlayCircle className="h-4 w-4 text-info animate-pulse" />
			</div>
		);
	}
	if (job.workflow === "verify") {
		if (status === "failed" || verificationResult === "fail") {
			const tooltip = dataSha1
				? "Verification failed. Hash does not match database."
				: "Verification failed. Archive may be corrupted.";
			return (
				<div className={wrapperClass} title={tooltip}>
					<ShieldX className="h-4 w-4 text-destructive" />
				</div>
			);
		}
		if (status === "completed") {
			if (verifiedName) {
				return (
					<div className={wrapperClass} title={`Perfect Dump: ${verifiedName}`}>
						<BadgeCheck className="h-4 w-4 text-success" />
					</div>
				);
			}
			const tooltip = dataSha1
				? "Verified archive. Hash not found in database."
				: "Verified archive. Database match requires SHA-1.";
			return (
				<div className={wrapperClass} title={tooltip}>
					<ShieldCheck className="h-4 w-4 text-info" />
				</div>
			);
		}
	}
	if (status === "failed") {
		return (
			<div className={wrapperClass}>
				<AlertCircle className="h-4 w-4 text-destructive" />
			</div>
		);
	}
	if (status === "completed") {
		return (
			<div className={wrapperClass}>
				<CheckCircle className="h-4 w-4 text-success" />
			</div>
		);
	}
	return <div className="h-4 w-4 rounded-full border-2 border-muted" />;
});

const JobProgressCell = React.memo(({ job }: { job: JobState }) => {
	const progress = useSignalValue(job.progress);
	const status = useSignalValue(job.status);
	const indeterminate = useSignalValue(job.indeterminate);

	return (
		<TableCell className="w-[25%]">
			<div className="flex flex-col gap-1">
				<Progress
					value={progress}
					indeterminate={indeterminate && status === "processing"}
					className="h-2"
				/>
				{status === "processing" && (
					<span className="text-xs text-muted-foreground">
						{indeterminate ? "Processing…" : `${progress.toFixed(1)}%`}
					</span>
				)}
			</div>
		</TableCell>
	);
});

const JobEtaCell = React.memo(({ job }: { job: JobState }) => {
	const etaSeconds = useSignalValue(job.etaSeconds);
	const status = useSignalValue(job.status);

	return (
		<TableCell className="text-xs font-mono text-muted-foreground">
			{etaSeconds !== undefined && status === "processing"
				? formatDuration(etaSeconds)
				: "-"}
		</TableCell>
	);
});

const JobSizeCell = React.memo(({ job }: { job: JobState }) => {
	const status = useSignalValue(job.status);
	const compressionRatio = useSignalValue(job.compressionRatio);
	const showRatio = status === "completed" && compressionRatio !== undefined;
	const estimatedSavedBytes = showRatio
		? estimateSavedBytes(job.originalSize, compressionRatio)
		: undefined;
	const deltaLabel =
		estimatedSavedBytes === undefined
			? undefined
			: `${estimatedSavedBytes >= 0 ? "-" : "+"}${formatDeltaSize(estimatedSavedBytes)}`;
	const deltaTitle =
		estimatedSavedBytes === undefined
			? undefined
			: estimatedSavedBytes >= 0
				? `Estimated space saved: ${formatDeltaSize(estimatedSavedBytes)}`
				: `Estimated size increase: ${formatDeltaSize(estimatedSavedBytes)}`;
	const isSavingsPositive =
		estimatedSavedBytes !== undefined && estimatedSavedBytes >= 0;

	return (
		<TableCell className="text-right">
			<div className="inline-flex max-w-full items-center justify-end gap-1.5 whitespace-nowrap text-xs font-mono">
				<span className="text-muted-foreground">
					{formatSize(job.originalSize)}
				</span>
				{showRatio && (
					<span className="inline-flex items-center rounded-full border border-info/20 bg-info/5 px-2 py-0.5 text-info">
						{formatRatio(compressionRatio)}
					</span>
				)}
				{deltaLabel && (
					<span
						title={deltaTitle}
						className={cn(
							"inline-flex items-center rounded-full border px-2 py-0.5",
							isSavingsPositive
								? "border-success/20 bg-success/5 text-success"
								: "border-warning/20 bg-warning/5 text-warning",
						)}
					>
						{deltaLabel}
					</span>
				)}
			</div>
		</TableCell>
	);
});

const JobRowComponent = ({
	job,
	depth,
	isSelected,
	folderOverride,
	isCueBinLinked,
	linkedCompanionFilename,
	onSelect,
	onStart,
	onRemove,
	onUpdatePlatform,
	onOpenLocation,
}: JobRowProps): React.ReactElement => {
	const status = useSignalValue(job.status);
	const system = useSignalValue(job.system);
	const platformOverride = useSignalValue(job.platformOverride);

	const isDisabled = !!folderOverride;
	const isUnknownBlocked = system === "Unknown" && !platformOverride;
	const badgeLabel = platformOverride
		? formatPlatformLabel(platformOverride)
		: system;

	const mainExt = job.filename.split(".").pop()?.toUpperCase() || "MAIN";
	const linkExt =
		linkedCompanionFilename?.split(".").pop()?.toUpperCase() || "LINK";

	return (
		<TableRow
			className={cn(
				"cursor-pointer hover:bg-muted/10 group",
				isSelected && "bg-muted/50",
				isUnknownBlocked && "border-l-2 border-l-warning bg-warning/5",
			)}
			onClick={() => onSelect(job.id)}
		>
			<TableCell style={{ paddingLeft: `${depth * 16 + 8}px` }}>
				<div className="flex items-center gap-2">
					{isUnknownBlocked ? (
						<AlertTriangle className="h-4 w-4 text-warning" />
					) : (
						<JobStatusIcon job={job} />
					)}
					<CoverThumbnail system={system} size="sm" />
				</div>
			</TableCell>
			<TableCell className="font-medium max-w-[400px]">
				{isCueBinLinked && linkedCompanionFilename ? (
					<div className="flex w-full items-center gap-2">
						<div
							className="flex flex-1 min-w-0 items-center justify-between gap-2 rounded-md border border-border/50 bg-muted/40 px-2.5 py-1.5 shadow-sm font-medium"
							title={job.filename}
						>
							<span className="truncate text-sm leading-none">
								{job.filename}
							</span>
							<span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-secondary text-secondary-foreground">
								{mainExt}
							</span>
						</div>
						<Link2 className="h-4 w-4 shrink-0 text-muted-foreground/60" />
						<div
							className="flex flex-1 min-w-0 items-center justify-between gap-2 rounded-md border border-border/50 bg-muted/40 px-2.5 py-1.5 shadow-sm font-medium"
							title={linkedCompanionFilename}
						>
							<span className="truncate text-sm leading-none">
								{linkedCompanionFilename}
							</span>
							<span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-muted text-muted-foreground">
								{linkExt}
							</span>
						</div>
					</div>
				) : (
					<div className="flex min-w-0 flex-col gap-0.5">
						<div className="flex min-w-0 items-center gap-2">
							<span className="truncate">{job.filename}</span>
						</div>
					</div>
				)}
			</TableCell>
			<TableCell>
				{status === "pending" || isUnknownBlocked ? (
					<PlatformSelector
						value={platformOverride}
						onChange={(val) => onUpdatePlatform(job.id, val)}
						detectedSystem={system}
						isDisabled={isDisabled}
					/>
				) : (
					<StatusBadge variant="secondary">{badgeLabel}</StatusBadge>
				)}
			</TableCell>
			<JobProgressCell job={job} />
			<JobEtaCell job={job} />
			<JobSizeCell job={job} />
			<TableCell className="text-right">
				<RowActions
					actions={createJobRowActions({
						status,
						filename: job.filename,
						onStart: () => onStart(job.id),
						onOpenLocation: () => onOpenLocation(job.id),
						onRemove: () => onRemove(job.id),
					})}
				/>
			</TableCell>
		</TableRow>
	);
};

export const JobRow = React.memo(JobRowComponent);
