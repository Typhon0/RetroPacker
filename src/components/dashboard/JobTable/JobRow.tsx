/**
 * JobRow - Renders a single job row in the job table
 *
 * Single Responsibility: Only handles job row rendering and interactions.
 *
 * @module components/dashboard/JobTable/JobRow
 */

import type React from "react";
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
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import type { Job, WorkflowType } from "@/stores/useQueueStore";
import { CoverThumbnail } from "../CoverThumbnail";

interface JobRowProps {
	job: Job;
	workflow: WorkflowType;
	depth: number;
	isSelected: boolean;
	folderOverride?: Job["platformOverride"];
	onSelect: () => void;
	onStart: () => void;
	onRemove: () => void;
	onUpdatePlatform: (platform: Job["platformOverride"]) => void;
}

/**
 * Get status icon for job status.
 */
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

/**
 * Format file size for display.
 */
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

/**
 * Renders a single job row with status, progress, and actions.
 */
export function JobRow({
	job,
	depth,
	isSelected,
	folderOverride,
	onSelect,
	onStart,
	onRemove,
	onUpdatePlatform,
}: JobRowProps): React.ReactElement {
	const isDisabled = !!folderOverride;
	const displayValue = job.platformOverride || job.system.toLowerCase();

	return (
		<TableRow
			className={cn(
				"cursor-pointer hover:bg-muted/10 group",
				isSelected && "bg-muted/50",
			)}
			onClick={onSelect}
		>
			<TableCell style={{ paddingLeft: `${depth * 16 + 8}px` }}>
				<div className="flex items-center gap-2">
					{getStatusIcon(job.status)}
					<CoverThumbnail
						filename={job.filename}
						filePath={job.path}
						system={job.system}
						size="sm"
					/>
				</div>
			</TableCell>
			<TableCell className="font-medium truncate max-w-[200px]">
				{job.filename}
			</TableCell>
			<TableCell>
				{job.status === "pending" ? (
					<Select
						value={displayValue}
						onValueChange={(val) => {
							onUpdatePlatform(val as Job["platformOverride"]);
						}}
						disabled={isDisabled}
					>
						<SelectTrigger
							className={cn(
								"h-7 w-[100px] text-xs",
								isDisabled && "opacity-50",
							)}
							onClick={(e) => e.stopPropagation()}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{![
								"ps1",
								"ps2",
								"dreamcast",
								"saturn",
								"gamecube",
								"wii",
							].includes(job.system.toLowerCase()) && (
								<SelectItem value={job.system.toLowerCase()}>
									{job.system}
								</SelectItem>
							)}
							<SelectItem value="ps1">PS1</SelectItem>
							<SelectItem value="ps2">PS2</SelectItem>
							<SelectItem value="dreamcast">Dreamcast</SelectItem>
							<SelectItem value="saturn">Saturn</SelectItem>
							<SelectItem value="gamecube">GameCube</SelectItem>
							<SelectItem value="wii">Wii</SelectItem>
						</SelectContent>
					</Select>
				) : (
					<span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-secondary text-secondary-foreground">
						{job.system}
					</span>
				)}
			</TableCell>
			<TableCell className="w-[25%]">
				<div className="flex flex-col gap-1">
					<Progress value={job.progress} className="h-2" />
					{job.status === "processing" && (
						<span className="text-xs text-muted-foreground">
							{job.progress.toFixed(1)}%
						</span>
					)}
				</div>
			</TableCell>
			<TableCell className="text-xs font-mono text-muted-foreground">
				{job.etaSeconds !== undefined && job.status === "processing"
					? formatDuration(job.etaSeconds)
					: "-"}
			</TableCell>
			<TableCell className="text-right text-xs font-mono">
				{formatSize(job.originalSize)}
			</TableCell>
			<TableCell className="text-right">
				<div className="flex justify-end gap-1">
					{(job.status === "pending" || job.status === "failed") && (
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8 text-green-500 opacity-0 group-hover:opacity-100 transition-opacity"
							title="Start job"
							onClick={(e) => {
								e.stopPropagation();
								onStart();
							}}
						>
							<Play className="h-4 w-4" />
						</Button>
					)}
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
						title="Remove job"
						onClick={(e) => {
							e.stopPropagation();
							onRemove();
						}}
					>
						<XCircle className="h-4 w-4" />
					</Button>
				</div>
			</TableCell>
		</TableRow>
	);
}
