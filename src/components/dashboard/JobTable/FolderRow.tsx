/**
 * Renders a folder row with expand/collapse and platform override controls.
 */

import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import React from "react";
import {
	createFolderRowActions,
	RowActions,
} from "@/components/ui/row-actions";
import { TableCell, TableRow } from "@/components/ui/table";
import type { Platform } from "@/domain/types/platform.types";
import { pluralize } from "@/lib/utils";
import { PlatformSelector } from "../PlatformSelector";
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
	return (
		<TableRow
			className="bg-muted/30 cursor-pointer hover:bg-muted/50 group"
			onClick={onToggle}
			aria-expanded={isExpanded}
			aria-label={`Folder: ${node.name}, ${totalItems} items`}
		>
			<TableCell
				className="py-2"
				style={{ paddingInlineStart: `${depth * 16 + 8}px` }}
			>
				{isExpanded ? (
					<ChevronDown className="h-4 w-4" />
				) : (
					<ChevronRight className="h-4 w-4" />
				)}
			</TableCell>
			<TableCell colSpan={4} className="py-2">
				<div className="flex items-center gap-2">
					<Folder className="h-4 w-4 text-info" />
					<span className="font-medium">{node.name}</span>
					<span className="text-muted-foreground text-xs">
						({pluralize(totalItems, "item")})
					</span>
				</div>
			</TableCell>
			<TableCell className="py-2">
				{pendingInFolder > 0 && (
					<PlatformSelector
						value={folderOverride}
						onChange={(val) => onSetPlatform(val)}
						detectedSystem={inferredPlatform}
						showMixed
					/>
				)}
			</TableCell>
			<TableCell className="text-end py-2">
				<RowActions
					actions={createFolderRowActions({
						name: node.name,
						pendingCount: pendingInFolder,
						isProcessing,
						onStartFolder,
						onOpenLocation,
						onRemove,
					})}
				/>
			</TableCell>
		</TableRow>
	);
}

export const FolderRow = React.memo(FolderRowComponent);
