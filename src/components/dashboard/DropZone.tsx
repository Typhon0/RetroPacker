import { open } from "@tauri-apps/plugin-dialog";
import { stat } from "@tauri-apps/plugin-fs";
import { FolderPlus, Loader2, Upload } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { WorkflowType } from "@/domain/types/workflow.types";
import { cn } from "@/lib/utils";
import {
	type QueueAddProgress,
	useQueueManager,
} from "@/presentation/hooks/useQueueManager";

interface DropZoneProps {
	workflow: WorkflowType;
}

export function DropZone({ workflow }: DropZoneProps) {
	const [isDragging, setIsDragging] = useState(false);
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [dropError, setDropError] = useState<string | undefined>(undefined);
	const [analysisProgress, setAnalysisProgress] = useState<
		QueueAddProgress | undefined
	>(undefined);
	const [analysisStartAt, setAnalysisStartAt] = useState<number | undefined>(
		undefined,
	);
	const [analysisElapsedMs, setAnalysisElapsedMs] = useState(0);

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
			let unsupportedMessage: string | undefined;
			setAnalysisProgress({
				phase: "analyzing",
				discoveredFiles: files.length,
				analyzedFiles: 0,
				totalFiles: files.length,
			});

			for (const [index, file] of files.entries()) {
				// @ts-expect-error - Tauri provides path on File objects
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

				const result = await addFile(filePath, file.name, file.size);
				setAnalysisProgress({
					phase: "analyzing",
					discoveredFiles: files.length,
					analyzedFiles: index + 1,
					totalFiles: files.length,
					currentPath: filePath,
				});
				if (
					!result.added &&
					result.message !== undefined &&
					unsupportedMessage === undefined
				) {
					unsupportedMessage = result.message;
				}
			}

			setDropError(unsupportedMessage);
		},
		[addFile],
	);

	const processPaths = useCallback(
		async (paths: string[]) => {
			let unsupportedMessage: string | undefined;
			setAnalysisProgress({
				phase: "analyzing",
				discoveredFiles: paths.length,
				analyzedFiles: 0,
				totalFiles: paths.length,
			});

			for (const [index, filePath] of paths.entries()) {
				const name = filePath.split(/[\\/]/).pop() || "unknown";
				let size = 0;
				try {
					const fileStat = await stat(filePath);
					size = fileStat.size;
				} catch (e) {
					console.warn(`Failed to stat file ${filePath}, assuming size 0`, e);
				}
				const result = await addFile(filePath, name, size);
				setAnalysisProgress({
					phase: "analyzing",
					discoveredFiles: paths.length,
					analyzedFiles: index + 1,
					totalFiles: paths.length,
					currentPath: filePath,
				});
				if (
					!result.added &&
					result.message !== undefined &&
					unsupportedMessage === undefined
				) {
					unsupportedMessage = result.message;
				}
			}

			setDropError(unsupportedMessage);
		},
		[addFile],
	);

	const beginAnalysis = useCallback(() => {
		setIsAnalyzing(true);
		setAnalysisProgress(undefined);
		const now = Date.now();
		setAnalysisStartAt(now);
		setAnalysisElapsedMs(0);
	}, []);

	const endAnalysis = useCallback(() => {
		setIsAnalyzing(false);
	}, []);

	const handleDrop = useCallback(
		async (e: React.DragEvent) => {
			e.preventDefault();
			setIsDragging(false);
			beginAnalysis();
			setDropError(undefined);

			try {
				const files = Array.from(e.dataTransfer.files);
				await processFiles(files);
			} finally {
				endAnalysis();
			}
		},
		[beginAnalysis, endAnalysis, processFiles],
	);

	const handleClick = useCallback(async () => {
		try {
			setDropError(undefined);
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
				beginAnalysis();
				try {
					const paths = Array.isArray(selected) ? selected : [selected];
					await processPaths(paths);
				} finally {
					endAnalysis();
				}
			}
		} catch (err) {
			console.error("Failed to open file dialog", err);
			endAnalysis();
		}
	}, [beginAnalysis, endAnalysis, fileConfig, processPaths]);

	const handleAddFolder = useCallback(
		async (e: React.MouseEvent) => {
			e.stopPropagation();
			try {
				setDropError(undefined);
				const selected = await open({
					directory: true,
					multiple: true,
				});

				if (selected) {
					beginAnalysis();
					try {
						const paths = Array.isArray(selected) ? selected : [selected];
						// Use the Clean Architecture hook for folder processing
						const results = await addFolders(paths, (progress) => {
							setAnalysisProgress(progress);
						});
						const unsupported = results.find(
							(result) => !result.added && result.message !== undefined,
						);
						if (unsupported) {
							setDropError(unsupported.message);
						}
					} finally {
						endAnalysis();
					}
				}
			} catch (err) {
				console.error("Failed to open directory dialog", err);
			}
		},
		[addFolders, beginAnalysis, endAnalysis],
	);

	useEffect(() => {
		if (!isAnalyzing || analysisStartAt === undefined) {
			return;
		}

		const timer = setInterval(() => {
			setAnalysisElapsedMs(Date.now() - analysisStartAt);
		}, 300);

		return () => clearInterval(timer);
	}, [analysisStartAt, isAnalyzing]);

	const elapsedLabel = useMemo(() => {
		const seconds = Math.max(0, Math.floor(analysisElapsedMs / 1000));
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
			.toString()
			.padStart(2, "0")}`;
	}, [analysisElapsedMs]);

	const currentPathLabel = useMemo(() => {
		const currentPath = analysisProgress?.currentPath;
		if (!currentPath) return undefined;
		return currentPath.split(/[\\/]/).pop() || currentPath;
	}, [analysisProgress?.currentPath]);

	const isScanPhase = analysisProgress?.phase === "scanning";
	const totalFiles =
		analysisProgress?.totalFiles ?? analysisProgress?.discoveredFiles;
	const analyzedFiles = analysisProgress?.analyzedFiles ?? 0;
	const progressPercent =
		totalFiles && totalFiles > 0 ? (analyzedFiles / totalFiles) * 100 : 0;

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				void handleClick();
			}
		},
		[handleClick],
	);

	return (
		<div
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			onClick={!isAnalyzing ? handleClick : undefined}
			onKeyDown={!isAnalyzing ? handleKeyDown : undefined}
			role="button"
			tabIndex={isAnalyzing ? -1 : 0}
			className={cn(
				"border-2 border-dashed rounded-xl p-6 transition-all duration-300 flex flex-col items-center justify-center text-center cursor-pointer relative group min-h-[200px]",
				isDragging
					? "border-primary bg-primary/10 scale-[1.02]"
					: "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/5",
				isAnalyzing ? "cursor-wait opacity-80" : "",
			)}
		>
			{isAnalyzing ? (
				<div className="flex w-full max-w-xl flex-col items-center gap-2">
					<Loader2 className="h-10 w-10 mb-1 text-primary animate-spin" />
					<h3 className="text-lg font-semibold">
						{isScanPhase ? "Scanning folders..." : "Analyzing files..."}
					</h3>
					<p className="text-sm text-muted-foreground">
						{isScanPhase
							? `${analysisProgress?.scannedDirectories ?? 0} folders scanned, ${analysisProgress?.discoveredFiles ?? 0} files found`
							: `${analyzedFiles}${totalFiles ? ` / ${totalFiles}` : ""} files analyzed`}
					</p>
					<Progress
						className="h-2 w-full max-w-md"
						value={progressPercent}
						indeterminate={isScanPhase || !totalFiles}
					/>
					<p className="text-xs text-muted-foreground">
						Elapsed: {elapsedLabel}
						{currentPathLabel ? `  •  ${currentPathLabel}` : ""}
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
					{dropError && (
						<p className="mt-3 text-sm font-medium text-amber-600">
							{dropError}
						</p>
					)}
				</>
			)}
		</div>
	);
}
