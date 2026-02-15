/**
 * BatchProgressBar - Compact summary strip showing overall batch progress.
 *
 * Displays job counts by status (completed, processing, failed, pending)
 * and an overall progress bar. Only renders when there are jobs in the queue.
 *
 * @module components/dashboard/BatchProgressBar
 */

import { useMemo } from "react";
import { useQueueStore } from "@/stores/useQueueStore";
import type { WorkflowType } from "@/stores/useQueueStore";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Loader2, AlertCircle, Clock } from "lucide-react";

interface BatchProgressBarProps {
	workflow: WorkflowType;
}

export function BatchProgressBar({ workflow }: BatchProgressBarProps) {
	const queue = useQueueStore((state) => state.queues[workflow]);

	const stats = useMemo(() => {
		const total = queue.length;
		if (total === 0) return null;

		let completed = 0;
		let processing = 0;
		let failed = 0;
		let pending = 0;
		let progressSum = 0;

		for (const job of queue) {
			switch (job.status) {
				case "completed":
					completed++;
					progressSum += 100;
					break;
				case "processing":
					processing++;
					progressSum += job.progress;
					break;
				case "failed":
					failed++;
					break;
				case "pending":
					pending++;
					break;
			}
		}

		const overallProgress = total > 0 ? progressSum / total : 0;
		return { total, completed, processing, failed, pending, overallProgress };
	}, [queue]);

	if (!stats || stats.total === 0) return null;

	const { total, completed, processing, failed, pending, overallProgress } =
		stats;
	const allDone = completed + failed === total;

	return (
		<div className="border-b bg-card/50 px-4 py-1.5 flex items-center gap-4 text-xs">
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
		</div>
	);
}
