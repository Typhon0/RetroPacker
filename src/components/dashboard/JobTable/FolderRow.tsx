/**
 * FolderRow - Renders a folder row in the job table
 *
 * Single Responsibility: Only handles folder row rendering and interactions.
 *
 * @module components/dashboard/JobTable/FolderRow
 */

import type React from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ChevronRight, ChevronDown, Folder, Play } from "lucide-react";
import type { Job } from "@/stores/useQueueStore";
import type { TreeNode } from "./JobTreeBuilder";
import { countItems, countPending } from "./JobTreeBuilder";

interface FolderRowProps {
	node: TreeNode;
	depth: number;
	isExpanded: boolean;
	folderOverride?: Job["platformOverride"];
	inferredPlatform?: Job["platformOverride"];
	onToggle: () => void;
	onStartFolder: () => void;
	onSetPlatform: (platform: Job["platformOverride"]) => void;
}

/**
 * Renders a folder row with expand/collapse, platform override, and start button.
 */
export function FolderRow({
	node,
	depth,
	isExpanded,
	folderOverride,
	inferredPlatform,
	onToggle,
	onStartFolder,
	onSetPlatform,
}: FolderRowProps): React.ReactElement {
	const totalItems = countItems(node);
	const pendingInFolder = countPending(node);
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
								val === "auto" ? undefined : (val as Job["platformOverride"]),
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
				<div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
					{pendingInFolder > 0 && (
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7 text-green-500"
							title="Start all jobs in folder"
							onClick={(e) => {
								e.stopPropagation();
								onStartFolder();
							}}
						>
							<Play className="h-3.5 w-3.5" />
						</Button>
					)}
				</div>
			</TableCell>
		</TableRow>
	);
}
