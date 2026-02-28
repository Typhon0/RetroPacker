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
	CheckCircle,
	FolderOpen,
	Link2,
	Play,
	PlayCircle,
	Trash2,
	XCircle,
} from "lucide-react";
import React from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import type { JobState } from "@/domain/entities/JobState";
import type { Platform } from "@/domain/types/platform.types";
import { useSignalValue } from "@/hooks/useSignalValue";
import { cn, formatDuration } from "@/lib/utils";
import { CoverThumbnail } from "../CoverThumbnail";

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

const PLATFORM_OVERRIDE_OPTIONS: ReadonlyArray<{
	value: Platform;
	label: string;
}> = [
	{ value: "ps1", label: "PS1" },
	{ value: "ps2", label: "PS2" },
	{ value: "psp", label: "PSP" },
	{ value: "saturn", label: "Saturn" },
	{ value: "dreamcast", label: "Dreamcast" },
	{ value: "gamecube", label: "GameCube" },
	{ value: "wii", label: "Wii" },
];

function getStatusIcon(status: string): React.ReactNode {
	switch (status) {
		case "completed":
			return <CheckCircle className="h-4 w-4 text-green-500" />;
		case "processing":
			return <PlayCircle className="h-4 w-4 text-blue-500 animate-pulse" />;
		case "failed":
			return <AlertCircle className="h-4 w-4 text-red-500" />;
		default:
			return <div className="h-4 w-4 rounded-full border-2 border-muted" />;
	}
}

function formatSize(bytes: number): string {
	if (bytes <= 0) return "Unknown";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let size = bytes;
	let unitIndex = 0;
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}
	return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function formatDeltaSize(bytes: number): string {
	if (bytes === 0) return "0 B";
	return formatSize(Math.abs(bytes));
}

function formatRatio(ratio: number): string {
	return `${Number.isInteger(ratio) ? ratio.toString() : ratio.toFixed(1)}%`;
}

function estimateSavedBytes(
	originalSize: number,
	compressionRatio: number,
): number {
	return originalSize - originalSize * (compressionRatio / 100);
}

function formatPlatformLabel(platform: Platform): string {
	switch (platform) {
		case "ps1":
			return "PS1";
		case "ps2":
			return "PS2";
		case "psp":
			return "PSP";
		case "saturn":
			return "Saturn";
		case "dreamcast":
			return "Dreamcast";
		case "gamecube":
			return "GameCube";
		case "wii":
			return "Wii";
		case "segacd":
			return "Sega CD";
		default:
			return "Auto";
	}
}

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
					<span className="inline-flex items-center rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-sky-500">
						{formatRatio(compressionRatio)}
					</span>
				)}
				{deltaLabel && (
					<span
						title={deltaTitle}
						className={cn(
							"inline-flex items-center rounded-full border px-2 py-0.5",
							isSavingsPositive
								? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
								: "border-amber-500/30 bg-amber-500/10 text-amber-500",
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
	const displayValue = platformOverride || system.toLowerCase();
	const isProcessing = status === "processing";
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
				isUnknownBlocked && "border-l-2 border-l-amber-500 bg-amber-500/5",
			)}
			onClick={() => onSelect(job.id)}
		>
			<TableCell style={{ paddingLeft: `${depth * 16 + 8}px` }}>
				<div className="flex items-center gap-2">
					{isUnknownBlocked ? (
						<AlertTriangle className="h-4 w-4 text-amber-500" />
					) : (
						getStatusIcon(status)
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
							<span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-500">
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
							<span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-500">
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
					<Select
						value={isUnknownBlocked ? undefined : displayValue}
						onValueChange={(val) => {
							onUpdatePlatform(job.id, val as Platform);
						}}
						disabled={isDisabled}
					>
						<SelectTrigger
							className={cn(
								"h-7 text-xs",
								isUnknownBlocked ? "w-[250px]" : "w-[140px]",
								isDisabled && "opacity-50",
								isUnknownBlocked && "border-amber-500/50 text-amber-500",
							)}
							onClick={(e) => e.stopPropagation()}
						>
							{isUnknownBlocked ? (
								<span className="flex items-center gap-1">
									<AlertTriangle className="h-3 w-3" />
									Platform Unknown. Please select:
								</span>
							) : (
								<SelectValue />
							)}
						</SelectTrigger>
						<SelectContent>
							{![
								"ps1",
								"ps2",
								"psp",
								"dreamcast",
								"saturn",
								"gamecube",
								"wii",
							].includes(system.toLowerCase()) &&
								system !== "Unknown" && (
									<SelectItem value={system.toLowerCase()}>{system}</SelectItem>
								)}
							{PLATFORM_OVERRIDE_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : (
					<span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-secondary text-secondary-foreground">
						{badgeLabel}
					</span>
				)}
			</TableCell>
			<JobProgressCell job={job} />
			<JobEtaCell job={job} />
			<JobSizeCell job={job} />
			<TableCell className="text-right">
				<div className="flex justify-end gap-1">
					{(status === "pending" || status === "failed") && (
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8 text-green-500 opacity-0 group-hover:opacity-100 transition-opacity"
							title="Start job"
							onClick={(e) => {
								e.stopPropagation();
								onStart(job.id);
							}}
						>
							<Play className="h-4 w-4" />
						</Button>
					)}
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-all"
						title="Open location"
						onClick={(e) => {
							e.stopPropagation();
							onOpenLocation(job.id);
						}}
					>
						<FolderOpen className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
						title={isProcessing ? "Cancel job" : "Remove job"}
						onClick={(e) => {
							e.stopPropagation();
							onRemove(job.id);
						}}
					>
						{isProcessing ? (
							<XCircle className="h-4 w-4 text-blue-500 animate-pulse" />
						) : (
							<Trash2 className="h-4 w-4" />
						)}
					</Button>
				</div>
			</TableCell>
		</TableRow>
	);
};

export const JobRow = React.memo(JobRowComponent);
