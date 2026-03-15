import { FolderOpen, Play, Trash2, XCircle } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RowAction {
	key: string;
	icon: React.ReactNode;
	label: string;
	onClick: () => void;
	variant?: "default" | "success" | "destructive";
	visible?: boolean;
	isProcessing?: boolean;
	processingIcon?: React.ReactNode;
}

interface RowActionsProps {
	actions: RowAction[];
	className?: string;
}

const actionVariantStyles = {
	default: "text-muted-foreground hover:text-foreground",
	success: "text-success",
	destructive: "text-muted-foreground hover:text-destructive",
} as const;

function RowActions({ actions, className }: RowActionsProps) {
	const visibleActions = actions.filter((a) => a.visible !== false);
	if (visibleActions.length === 0) return null;

	return (
		<div className={cn("flex justify-end gap-1", className)}>
			{visibleActions.map((action) => {
				const variant = action.variant ?? "default";
				const baseClass =
					variant === "success" ? "text-success" : actionVariantStyles[variant];

				return (
					<Button
						key={action.key}
						variant="ghost"
						size="icon"
						className={cn(
							"h-8 w-8 transition-[transform,opacity] duration-150 hover:scale-110",
							baseClass,
							variant === "destructive"
								? "focus-visible:opacity-100"
								: "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100",
						)}
						aria-label={action.label}
						onClick={(e) => {
							e.stopPropagation();
							action.onClick();
						}}
					>
						{action.isProcessing && action.processingIcon
							? action.processingIcon
							: action.icon}
					</Button>
				);
			})}
		</div>
	);
}

/**
 * Create standard job row actions.
 */
function createJobRowActions(opts: {
	status: string;
	filename: string;
	onStart: () => void;
	onOpenLocation: () => void;
	onRemove: () => void;
}): RowAction[] {
	const isProcessing = opts.status === "processing";
	const canStart = opts.status === "pending" || opts.status === "failed";

	return [
		{
			key: "start",
			icon: <Play className="h-4 w-4" />,
			label: `Start job: ${opts.filename}`,
			onClick: opts.onStart,
			variant: "success",
			visible: canStart,
		},
		{
			key: "open-location",
			icon: <FolderOpen className="h-4 w-4" />,
			label: `Open location: ${opts.filename}`,
			onClick: opts.onOpenLocation,
		},
		{
			key: "remove",
			icon: isProcessing ? (
				<XCircle className="h-4 w-4 text-info animate-pulse" />
			) : (
				<Trash2 className="h-4 w-4" />
			),
			label: isProcessing
				? `Cancel job: ${opts.filename}`
				: `Remove job: ${opts.filename}`,
			onClick: opts.onRemove,
			variant: "destructive",
		},
	];
}

/**
 * Create standard folder row actions.
 */
function createFolderRowActions(opts: {
	name: string;
	pendingCount: number;
	isProcessing: boolean;
	onStartFolder: () => void;
	onOpenLocation: () => void;
	onRemove: () => void;
}): RowAction[] {
	return [
		{
			key: "start",
			icon: <Play className="h-4 w-4" />,
			label: `Start all jobs in ${opts.name}`,
			onClick: opts.onStartFolder,
			variant: "success",
			visible: opts.pendingCount > 0,
		},
		{
			key: "open-location",
			icon: <FolderOpen className="h-4 w-4" />,
			label: `Open folder: ${opts.name}`,
			onClick: opts.onOpenLocation,
		},
		{
			key: "remove",
			icon: opts.isProcessing ? (
				<XCircle className="h-4 w-4 text-info animate-pulse" />
			) : (
				<Trash2 className="h-4 w-4" />
			),
			label: opts.isProcessing
				? `Cancel processing: ${opts.name}`
				: `Remove folder: ${opts.name}`,
			onClick: opts.onRemove,
			variant: "destructive",
		},
	];
}

export {
	RowActions,
	createJobRowActions,
	createFolderRowActions,
	type RowAction,
	type RowActionsProps,
};
