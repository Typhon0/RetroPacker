/**
 * BatchProgressBar - Compact summary strip showing overall batch progress.
 *
 * Displays job counts by status (completed, processing, failed, pending)
 * and an overall progress bar. Only renders when there are jobs in the queue.
 *
 * @module components/dashboard/BatchProgressBar
 */

import { useSignalValue } from "@/hooks/useSignalValue";
import { jobStore } from "@/stores/JobStore";
import type { WorkflowType } from "@/stores/useQueueStore";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Loader2, AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface BatchProgressBarProps {
	workflow: WorkflowType;
}

function formatSize(bytes: number): string {
	const safe = Math.max(0, bytes);
	if (safe === 0) return "0 B";

	const units = ["B", "KB", "MB", "GB", "TB"];
	let size = safe;
	let unitIndex = 0;
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}
	return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function formatRatio(ratio: number | undefined): string | undefined {
	if (ratio === undefined || !Number.isFinite(ratio)) return undefined;
	return `${ratio.toFixed(1)}%`;
}

function getWorkflowLabel(workflow: WorkflowType): string {
	switch (workflow) {
		case "compress":
			return "Compress";
		case "extract":
			return "Extract";
		case "verify":
			return "Verify";
		case "info":
			return "Info";
		default:
			return "Queue";
	}
}

function formatSavingsLabel(savedBytes: number): string {
	const abs = formatSize(Math.abs(savedBytes));
	return savedBytes >= 0 ? `Saved ${abs}` : `Expanded ${abs}`;
}

export function BatchProgressBar({ workflow }: BatchProgressBarProps) {
	const stats = useSignalValue(jobStore.queueSummaries[workflow]);
	const globalStats = useSignalValue(jobStore.globalSummary);

	if (stats.total === 0) return null;

	const { total, completed, processing, failed, pending, overallProgress } = stats;
	const allDone = completed + failed === total;
	const workflowHasCompressionStats = stats.jobsWithCompressionEstimate > 0;
	const globalHasCompressionStats = globalStats.jobsWithCompressionEstimate > 0;
	const workflowDeltaLabel = formatSavingsLabel(stats.estimatedSavedBytes);
	const globalDeltaLabel = formatSavingsLabel(globalStats.estimatedSavedBytes);
	const workflowRatio = formatRatio(stats.estimatedCompressionRatio);
	const globalRatio = formatRatio(globalStats.estimatedCompressionRatio);
	const workflowLabel = getWorkflowLabel(workflow);
	const showDistinctGlobalStats =
		globalHasCompressionStats &&
		(globalStats.jobsWithCompressionEstimate !== stats.jobsWithCompressionEstimate ||
			Math.abs(globalStats.estimatedSavedBytes - stats.estimatedSavedBytes) >
				1024 * 1024 ||
			Math.abs(
				(globalStats.estimatedCompressionRatio ?? 0) -
					(stats.estimatedCompressionRatio ?? 0),
			) > 0.05);

	return (
		<div className="border-b bg-card/50 px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
			{/* Overall progress bar */}
			<div className="w-32 flex items-center gap-2">
				<Progress value={overallProgress} className="h-1.5" />
				<span className="text-muted-foreground font-mono whitespace-nowrap">
					{overallProgress.toFixed(0)}%
				</span>
			</div>

			<div className="h-3 w-px bg-border" />

			{/* Status counts */}
			<div className="flex items-center gap-3 text-muted-foreground">
				{completed > 0 && (
					<span className="flex items-center gap-1 text-green-500">
						<CheckCircle className="h-3 w-3" />
						{completed}
					</span>
				)}
				{processing > 0 && (
					<span className="flex items-center gap-1 text-blue-500">
						<Loader2 className="h-3 w-3 animate-spin" />
						{processing}
					</span>
				)}
				{failed > 0 && (
					<span className="flex items-center gap-1 text-red-500">
						<AlertCircle className="h-3 w-3" />
						{failed}
					</span>
				)}
				{pending > 0 && (
					<span className="flex items-center gap-1">
						<Clock className="h-3 w-3" />
						{pending}
					</span>
				)}
			</div>

			<div className="h-3 w-px bg-border" />

			{/* Summary text */}
			<span className="text-muted-foreground">
				{allDone
					? `Done — ${completed} of ${total} succeeded${failed > 0 ? `, ${failed} failed` : ""}`
					: `${completed + processing} of ${total} jobs`}
			</span>

			{workflowHasCompressionStats && (
				<span
					className={cn(
						"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono",
						stats.estimatedSavedBytes >= 0
							? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
							: "border-amber-500/30 bg-amber-500/10 text-amber-500",
					)}
				>
					<span className="text-[10px] uppercase tracking-wide opacity-70">
						{workflowLabel}
					</span>
					<span>{workflowDeltaLabel}</span>
					{workflowRatio && <span className="opacity-70">{workflowRatio}</span>}
				</span>
			)}

			{showDistinctGlobalStats && (
				<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/20 px-2.5 py-0.5 font-mono text-muted-foreground">
					<span className="text-[10px] uppercase tracking-wide opacity-70">
						Global
					</span>
					<span>{globalDeltaLabel}</span>
					{globalRatio && <span className="opacity-70">{globalRatio}</span>}
				</span>
			)}
		</div>
	);
}
