import { FolderPlus, Loader2, Upload } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { JobProps } from "@/domain/entities/Job";
import type { JobConflict } from "@/domain/services/QueueAnalyzerService";
import type { WorkflowType } from "@/domain/types/workflow.types";
import { cn } from "@/lib/utils";
import { useRepositories } from "@/presentation/context/RepositoryContext";
import {
	type PreparedAddition,
	type QueueAddProgress,
	useQueueManager,
} from "@/presentation/hooks/useQueueManager";
import { usePackerStore } from "@/stores/usePackerStore";
import { ConflictDialog } from "./ConflictDialog";

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
	const [preparedAddition, setPreparedAddition] =
		useState<PreparedAddition | null>(null);
	const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);

	// Settings & Hooks
	const settings = usePackerStore();
	const { prepareAddFiles, prepareAddFolders, commitAddition, fileConfig } =
		useQueueManager(workflow);
	const { dialogRepository, fileSystem } = useRepositories();

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
	}, []);

	const processPathList = useCallback(
		async (paths: string[]) => {
			if (paths.length === 0) return;

			const validFilePaths: string[] = [];
			const validFolderPaths: string[] = [];

			for (const filePath of paths) {
				try {
					const info = await fileSystem.getFileInfo(filePath);
					if (info.isDirectory) {
						validFolderPaths.push(filePath);
					} else {
						validFilePaths.push(filePath);
					}
				} catch {
					// Fallback to file processing if stat fails
					validFilePaths.push(filePath);
				}
			}

			try {
				const combinedValidJobs: JobProps[] = [];
				const combinedConflicts: JobConflict[] = [];
				let fallbackError: string | undefined;

				if (validFilePaths.length > 0) {
					const addition = await prepareAddFiles(
						validFilePaths,
						settings,
						setAnalysisProgress,
					);
					combinedValidJobs.push(...addition.report.validJobs);
					combinedConflicts.push(...addition.report.conflicts);

					const unsupported = addition.invalidResults.find(
						(result) => !result.added && result.message !== undefined,
					);
					if (unsupported && !fallbackError)
						fallbackError = unsupported.message;
				}

				if (validFolderPaths.length > 0) {
					const addition = await prepareAddFolders(
						validFolderPaths,
						settings,
						setAnalysisProgress,
					);
					combinedValidJobs.push(...addition.report.validJobs);
					combinedConflicts.push(...addition.report.conflicts);

					const unsupported = addition.invalidResults.find(
						(result) => !result.added && result.message !== undefined,
					);
					if (unsupported && !fallbackError)
						fallbackError = unsupported.message;
				}

				setDropError(fallbackError);

				if (combinedConflicts.length > 0) {
					setPreparedAddition({
						report: {
							hasConflicts: true,
							conflicts: combinedConflicts,
							validJobs: combinedValidJobs,
						},
						invalidResults: [],
					});
					setIsConflictDialogOpen(true);
				} else if (combinedValidJobs.length > 0) {
					commitAddition(combinedValidJobs);
				}
			} catch (error) {
				const pathCount = paths.length;
				setDropError(
					`Failed to process ${pathCount} item${pathCount === 1 ? "" : "s"}: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
			}
		},
		[prepareAddFiles, prepareAddFolders, commitAddition, settings, fileSystem],
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

			const isTauri =
				typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
			if (isTauri) {
				// Tauri's window-level onDragDropEvent handles this for reliable folder support
				return;
			}

			beginAnalysis();
			setDropError(undefined);

			try {
				const files = Array.from(e.dataTransfer.files);
				const validPaths: string[] = [];
				for (const file of files) {
					// @ts-expect-error - Tauri provides path on File objects
					let filePath = file.path;

					if (!filePath) {
						// Mock mode for browser development
						console.log("[MOCK] Browser detected");
						filePath = `/mock/${file.name}`;
					}
					validPaths.push(filePath);
				}
				await processPathList(validPaths);
			} catch (err) {
				console.error("Mock drag drop error:", err);
			} finally {
				endAnalysis();
			}
		},
		[beginAnalysis, endAnalysis, processPathList],
	);

	const handleClick = useCallback(async () => {
		try {
			setDropError(undefined);
			const selected = await dialogRepository.open({
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
					await processPathList(paths);
				} finally {
					endAnalysis();
				}
			}
		} catch {
			endAnalysis();
		}
	}, [
		beginAnalysis,
		dialogRepository,
		endAnalysis,
		fileConfig,
		processPathList,
	]);

	const handleAddFolder = useCallback(
		async (e: React.MouseEvent) => {
			e.stopPropagation();
			try {
				setDropError(undefined);
				const selected = await dialogRepository.open({
					directory: true,
					multiple: true,
				});

				if (selected) {
					beginAnalysis();
					try {
						const paths = Array.isArray(selected) ? selected : [selected];

						const addition = await prepareAddFolders(
							paths,
							settings,
							(progress) => {
								setAnalysisProgress(progress);
							},
						);

						const unsupported = addition.invalidResults.find(
							(result) => !result.added && result.message !== undefined,
						);
						if (unsupported) {
							setDropError(unsupported.message);
						}

						if (addition.report.hasConflicts) {
							setPreparedAddition(addition);
							setIsConflictDialogOpen(true);
						} else {
							commitAddition(addition.report.validJobs);
						}
					} finally {
						endAnalysis();
					}
				}
			} catch {
				// Error already surfaced to user via dropError state in handleAddFolder
			}
		},
		[
			prepareAddFolders,
			commitAddition,
			beginAnalysis,
			dialogRepository,
			endAnalysis,
			settings,
		],
	);

	useEffect(() => {
		const isTauri =
			typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
		if (!isTauri) return;

		let unlisten: (() => void) | null = null;
		let isMounted = true;

		import("@tauri-apps/api/webviewWindow")
			.then(({ getCurrentWebviewWindow }) => {
				return getCurrentWebviewWindow().onDragDropEvent((event) => {
					if (!isMounted || isAnalyzing) return;

					if (event.payload.type === "enter" || event.payload.type === "over") {
						setIsDragging(true);
					} else if (event.payload.type === "leave") {
						setIsDragging(false);
					} else if (event.payload.type === "drop") {
						setIsDragging(false);
						const paths = event.payload.paths;
						if (paths && paths.length > 0) {
							beginAnalysis();
							setDropError(undefined);
							processPathList(paths).finally(endAnalysis);
						}
					}
				});
			})
			.then((unlistenFn) => {
				if (isMounted) {
					unlisten = unlistenFn;
				} else if (unlistenFn) {
					unlistenFn();
				}
			})
			.catch((err) => {
				console.error("Failed to setup Tauri drag/drop listener:", err);
			});

		return () => {
			isMounted = false;
			if (unlisten) unlisten();
		};
	}, [beginAnalysis, endAnalysis, processPathList, isAnalyzing]);

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

	const handleAddFilesClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			handleClick();
		},
		[handleClick],
	);

	const handleConflictDialogClose = useCallback(() => {
		setIsConflictDialogOpen(false);
		setPreparedAddition(null);
	}, []);

	const handleConflictDialogConfirm = useCallback(() => {
		if (preparedAddition) {
			commitAddition(preparedAddition.report.validJobs);
		}
		setIsConflictDialogOpen(false);
		setPreparedAddition(null);
	}, [preparedAddition, commitAddition]);

	return (
		<div
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			onKeyDown={
				!isAnalyzing && !isConflictDialogOpen ? handleKeyDown : undefined
			}
			role="button"
			tabIndex={isAnalyzing || isConflictDialogOpen ? -1 : 0}
			className={cn(
				"surface-card p-8 transition-colors duration-200 flex flex-col items-center justify-center text-center cursor-pointer group min-h-[200px]",
				isDragging
					? "border-primary bg-primary-10 scale-[1.01] shadow-lg shadow-primary-05"
					: "border-muted-foreground/25 hover:border-muted-foreground/40 hover:bg-muted/5",
				isAnalyzing && "cursor-wait opacity-75",
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
							"h-10 w-10 mb-5 transition-colors duration-200",
							isDragging
								? "text-primary"
								: "text-muted-foreground group-hover:text-foreground",
						)}
					/>
					<h3 className="text-lg font-semibold tracking-tight mb-2 text-foreground">
						{fileConfig.dropLabel}
					</h3>
					<p className="text-sm text-muted-foreground font-medium max-w-md mb-6 leading-relaxed">
						Supports: {fileConfig.supportedText}
					</p>

					<div className="flex gap-3 relative z-10">
						<Button
							variant="secondary"
							size="sm"
							aria-label={`Add ${workflow} files`}
							onClick={handleAddFilesClick}
						>
							Add Files
						</Button>
						<Button
							variant="secondary"
							size="sm"
							aria-label={`Add ${workflow} folder`}
							onClick={handleAddFolder}
						>
							<FolderPlus className="h-4 w-4 me-2" aria-hidden="true" />
							Add Folder
						</Button>
					</div>
					{dropError && (
						<p className="mt-3 text-sm font-medium text-warning">{dropError}</p>
					)}
				</>
			)}

			<ConflictDialog
				isOpen={isConflictDialogOpen}
				report={preparedAddition?.report ?? null}
				onClose={handleConflictDialogClose}
				onConfirm={handleConflictDialogConfirm}
			/>
		</div>
	);
}
