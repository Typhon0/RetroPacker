/**
 * Renders a folder row with expand/collapse and platform override controls.
 */

import React from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	ChevronRight,
	ChevronDown,
	Folder,
	Play,
	XCircle,
	Trash2,
	FolderOpen,
} from "lucide-react";
import type { Platform } from "@/domain/types/platform.types";
import type { TreeNode } from "./JobTreeBuilder";

interface FolderRowProps {
	node: TreeNode;
	depth: number;
	isExpanded: boolean;
	totalItems: number;
	pendingInFolder: number;
	isProcessing: boolean;
	folderOverride?: Platform;
	inferredPlatform?: Platform;
	onToggle: () => void;
	onStartFolder: () => void;
	onSetPlatform: (platform: Platform | undefined) => void;
	onRemove: () => void;
	onOpenLocation: () => void;
}

/**
 * Renders a folder row with expand/collapse, platform override, and start button.
 */
function FolderRowComponent({
	node,
	depth,
	isExpanded,
	totalItems,
	pendingInFolder,
	isProcessing,
	folderOverride,
	inferredPlatform,
	onToggle,
	onStartFolder,
	onSetPlatform,
	onRemove,
	onOpenLocation,
}: FolderRowProps): React.ReactElement {
	const currentValue = folderOverride || inferredPlatform || "auto";

	return (
		<TableRow
			className="bg-muted/30 cursor-pointer hover:bg-muted/50 group"
			onClick={onToggle}
		>
			<TableCell
				className="py-2"
				style={{ paddingLeft: `${depth * 16 + 8}px` }}
			>
				{isExpanded ? (
					<ChevronDown className="h-4 w-4" />
				) : (
					<ChevronRight className="h-4 w-4" />
				)}
			</TableCell>
			<TableCell colSpan={4} className="py-2">
				<div className="flex items-center gap-2">
					<Folder className="h-4 w-4 text-blue-400" />
					<span className="font-medium">{node.name}</span>
					<span className="text-muted-foreground text-xs">
						({totalItems} items)
					</span>
				</div>
			</TableCell>
			<TableCell className="py-2">
				{pendingInFolder > 0 && (
					<Select
						value={currentValue}
						onValueChange={(val) => {
							onSetPlatform(
								val === "auto" ? undefined : (val as Platform),
							);
						}}
					>
						<SelectTrigger
							className="h-7 w-[100px] text-xs"
							onClick={(e) => e.stopPropagation()}
						>
							<SelectValue placeholder="Platform" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="auto">Mixed</SelectItem>
							<SelectItem value="ps1">PS1</SelectItem>
							<SelectItem value="ps2">PS2</SelectItem>
							<SelectItem value="psp">PSP</SelectItem>
							<SelectItem value="dreamcast">Dreamcast</SelectItem>
							<SelectItem value="saturn">Saturn</SelectItem>
							<SelectItem value="gamecube">GameCube</SelectItem>
							<SelectItem value="wii">Wii</SelectItem>
						</SelectContent>
					</Select>
				)}
			</TableCell>
			<TableCell className="text-right py-2">
				<div className="flex justify-end gap-1">
					{pendingInFolder > 0 && (
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7 text-green-500 opacity-0 group-hover:opacity-100 transition-opacity"
							title="Start all jobs in folder"
							onClick={(e) => {
								e.stopPropagation();
								onStartFolder();
							}}
						>
							<Play className="h-3.5 w-3.5" />
						</Button>
					)}
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-all"
						title="Open folder location"
						onClick={(e) => {
							e.stopPropagation();
							onOpenLocation();
						}}
					>
						<FolderOpen className="h-3.5 w-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7 text-muted-foreground hover:text-destructive transition-colors"
						title={isProcessing ? "Cancel folder processing" : "Remove folder"}
						onClick={(e) => {
							e.stopPropagation();
							onRemove();
						}}
					>
						{isProcessing ? (
							<XCircle className="h-3.5 w-3.5 text-blue-500 animate-pulse" />
						) : (
							<Trash2 className="h-3.5 w-3.5" />
						)}
					</Button>
				</div>
			</TableCell>
		</TableRow>
	);
}

export const FolderRow = React.memo(FolderRowComponent);
