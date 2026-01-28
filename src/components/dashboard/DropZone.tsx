import React, { useCallback, useState } from "react";
import { Upload, FolderPlus, Loader2 } from "lucide-react";
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
	const [isAnalyzing, setIsAnalyzing] = useState(false);

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

	const processFiles = useCallback(
		async (files: File[]) => {
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
		},
		[addFile],
	);

	const processPaths = useCallback(
		async (paths: string[]) => {
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
		},
		[addFile],
	);

	const handleDrop = useCallback(
		async (e: React.DragEvent) => {
			e.preventDefault();
			setIsDragging(false);
			setIsAnalyzing(true);

			try {
				const files = Array.from(e.dataTransfer.files);
				await processFiles(files);
			} finally {
				setIsAnalyzing(false);
			}
		},
		[processFiles],
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
				setIsAnalyzing(true);
				try {
					const paths = Array.isArray(selected) ? selected : [selected];
					await processPaths(paths);
				} finally {
					setIsAnalyzing(false);
				}
			}
		} catch (err) {
			console.error("Failed to open file dialog", err);
			setIsAnalyzing(false);
		}
	}, [fileConfig, processPaths]);

	const handleAddFolder = useCallback(
		async (e: React.MouseEvent) => {
			e.stopPropagation();
			try {
				const selected = await open({
					directory: true,
					multiple: true,
				});

				if (selected) {
					setIsAnalyzing(true);
					try {
						const paths = Array.isArray(selected) ? selected : [selected];
						// Use the Clean Architecture hook for folder processing
						await addFolders(paths);
					} finally {
						setIsAnalyzing(false);
					}
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
			onClick={!isAnalyzing ? handleClick : undefined}
			className={cn(
				"border-2 border-dashed rounded-xl p-6 transition-all duration-300 flex flex-col items-center justify-center text-center cursor-pointer relative group min-h-[200px]",
				isDragging
					? "border-primary bg-primary/10 scale-[1.02]"
					: "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/5",
				isAnalyzing ? "cursor-wait opacity-80" : "",
			)}
		>
			{isAnalyzing ? (
				<div className="flex flex-col items-center animate-pulse">
					<Loader2 className="h-10 w-10 mb-3 text-primary animate-spin" />
					<h3 className="text-lg font-semibold">Analyzing Files...</h3>
					<p className="text-sm text-muted-foreground">
						Fetching metadata and covers
					</p>
				</div>
			) : (
				<>
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
				</>
			)}
		</div>
	);
}
