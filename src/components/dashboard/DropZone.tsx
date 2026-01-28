import React, { useCallback, useState } from "react";
import { Upload, FolderPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkflowType } from "@/stores/useQueueStore";
import { Button } from "@/components/ui/button";
import { open } from "@tauri-apps/plugin-dialog";
import { stat } from "@tauri-apps/plugin-fs";
import { useQueueManager } from "@/presentation/hooks/useQueueManager";

interface DropZoneProps {
	workflow: WorkflowType;
}

export function DropZone({ workflow }: DropZoneProps) {
	const [isDragging, setIsDragging] = useState(false);

	// Use the new Clean Architecture hook
	const { addFile, addFolders, fileConfig } = useQueueManager(workflow);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setIsDragging(false);

			const files = Array.from(e.dataTransfer.files);
			processFiles(files);
		},
		[workflow],
	);

	const handleClick = useCallback(async () => {
		try {
			const selected = await open({
				multiple: true,
				filters: [
					{
						name: fileConfig.filterName,
						extensions: fileConfig.extensions,
					},
				],
			});

			if (selected) {
				const paths = Array.isArray(selected) ? selected : [selected];
				processPaths(paths);
			}
		} catch (err) {
			console.error("Failed to open file dialog", err);
		}
	}, [workflow, fileConfig]);

	const processFiles = async (files: File[]) => {
		for (const file of files) {
			// @ts-ignore - Tauri provides path on File objects
			let filePath = file.path;

			if (!filePath) {
				// Mock mode for browser development
				const isTauri =
					typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
				if (!isTauri) {
					console.log("[MOCK] Browser detected");
					filePath = `/mock/${file.name}`;
				} else {
					continue;
				}
			}

			await addFile(filePath, file.name, file.size);
		}
	};

	const processPaths = async (paths: string[]) => {
		for (const filePath of paths) {
			const name = filePath.split(/[\\/]/).pop() || "unknown";
			let size = 0;
			try {
				const fileStat = await stat(filePath);
				size = fileStat.size;
			} catch (e) {
				console.warn(`Failed to stat file ${filePath}, assuming size 0`, e);
			}
			await addFile(filePath, name, size);
		}
	};

	const handleAddFolder = useCallback(
		async (e: React.MouseEvent) => {
			e.stopPropagation();
			try {
				const selected = await open({
					directory: true,
					multiple: true,
				});

				if (selected) {
					const paths = Array.isArray(selected) ? selected : [selected];
					// Use the Clean Architecture hook for folder processing
					await addFolders(paths);
				}
			} catch (err) {
				console.error("Failed to open directory dialog", err);
			}
		},
		[addFolders],
	);

	return (
		<div
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			onClick={handleClick}
			className={cn(
				"border-2 border-dashed rounded-xl p-6 transition-all duration-300 flex flex-col items-center justify-center text-center cursor-pointer relative group",
				isDragging
					? "border-primary bg-primary/10 scale-[1.02]"
					: "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/5",
			)}
		>
			<Upload
				className={cn(
					"h-10 w-10 mb-3 transition-colors",
					isDragging ? "text-primary" : "text-muted-foreground",
				)}
			/>
			<h3 className="text-lg font-semibold mb-1">{fileConfig.dropLabel}</h3>
			<p className="text-sm text-muted-foreground max-w-sm mb-4">
				Supports: {fileConfig.supportedText}
			</p>

			<div className="flex gap-2">
				<Button
					variant="secondary"
					size="sm"
					onClick={(e) => {
						e.stopPropagation();
						handleClick();
					}}
				>
					Add Files
				</Button>
				<Button variant="secondary" size="sm" onClick={handleAddFolder}>
					<FolderPlus className="h-4 w-4 mr-2" />
					Add Folder
				</Button>
			</div>
		</div>
	);
}
