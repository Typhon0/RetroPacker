/**
 * JobRow - Renders a single job row in the job table
 *
 * Single Responsibility: Only handles job row rendering and interactions.
 * Uses ID-based callbacks to maintain stable references for React.memo.
 *
 * @module components/dashboard/JobTable/JobRow
 */

import React from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	XCircle,
	PlayCircle,
	CheckCircle,
	AlertCircle,
	Play,
	Trash2,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import type { JobState } from "@/domain/entities/JobState";
import type { Platform } from "@/domain/types/platform.types";
import { CoverThumbnail } from "../CoverThumbnail";
import { useSignalValue } from "@/hooks/useSignalValue";

interface JobRowProps {
	job: JobState;
	depth: number;
	isSelected: boolean;
	folderOverride?: Platform;
	onSelect: (jobId: string) => void;
	onStart: (jobId: string) => void;
	onRemove: (jobId: string) => void;
	onUpdatePlatform: (jobId: string, platform: Platform | undefined) => void;
}

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

const JobProgressCell = React.memo(({ job }: { job: JobState }) => {
	const progress = useSignalValue(job.progress);
	const status = useSignalValue(job.status);

	return (
		<TableCell className="w-[25%]">
			<div className="flex flex-col gap-1">
				<Progress value={progress} className="h-2" />
				{status === "processing" && (
					<span className="text-xs text-muted-foreground">{progress.toFixed(1)}%</span>
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

const JobRowComponent = ({
	job,
	depth,
	isSelected,
	folderOverride,
	onSelect,
	onStart,
	onRemove,
	onUpdatePlatform,
}: JobRowProps): React.ReactElement => {
	const status = useSignalValue(job.status);
	const system = useSignalValue(job.system);
	const platformOverride = useSignalValue(job.platformOverride);

	const isDisabled = !!folderOverride;
	const displayValue = platformOverride || system.toLowerCase();
	const isProcessing = status === "processing";

	return (
		<TableRow
			className={cn(
				"cursor-pointer hover:bg-muted/10 group",
				isSelected && "bg-muted/50",
			)}
			onClick={() => onSelect(job.id)}
		>
			<TableCell style={{ paddingLeft: `${depth * 16 + 8}px` }}>
				<div className="flex items-center gap-2">
					{getStatusIcon(status)}
					<CoverThumbnail system={system} size="sm" />
				</div>
			</TableCell>
			<TableCell className="font-medium truncate max-w-[200px]">
				{job.filename}
			</TableCell>
			<TableCell>
				{status === "pending" ? (
					<Select
						value={displayValue}
						onValueChange={(val) => {
							onUpdatePlatform(job.id, val as Platform);
						}}
						disabled={isDisabled}
					>
						<SelectTrigger
							className={cn("h-7 w-[100px] text-xs", isDisabled && "opacity-50")}
							onClick={(e) => e.stopPropagation()}
						>
							<SelectValue />
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
							].includes(system.toLowerCase()) && (
								<SelectItem value={system.toLowerCase()}>{system}</SelectItem>
							)}
							<SelectItem value="ps1">PS1</SelectItem>
							<SelectItem value="ps2">PS2</SelectItem>
							<SelectItem value="psp">PSP</SelectItem>
							<SelectItem value="dreamcast">Dreamcast</SelectItem>
							<SelectItem value="saturn">Saturn</SelectItem>
							<SelectItem value="gamecube">GameCube</SelectItem>
							<SelectItem value="wii">Wii</SelectItem>
						</SelectContent>
					</Select>
				) : (
					<span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-secondary text-secondary-foreground">
						{system}
					</span>
				)}
			</TableCell>
			<JobProgressCell job={job} />
			<JobEtaCell job={job} />
			<TableCell className="text-right text-xs font-mono">
				{formatSize(job.originalSize)}
			</TableCell>
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
