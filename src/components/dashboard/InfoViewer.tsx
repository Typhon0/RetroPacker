import { useState, useCallback } from "react";
import {
	FileIcon,
	InfoIcon,
	Loader2,
	Image as ImageIcon,
	HardDrive,
	Percent,
	FileArchive,
	Fingerprint,
	ChevronDown,
	ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetadataService } from "@/services/MetadataService";

interface GameInfo {
	filename: string;
	path: string;
	format: string;
	size: number;
	gameId?: string | null;
	gameTitle?: string;
	region?: string;
	system?: string;
	coverPath?: string;
	rawOutput?: string;
	chdStats?: ChdStats;
	dolphinStats?: DolphinStats;
}

interface ChdStats {
	logicalSize?: string;
	chdSize?: string;
	ratio?: string;
	compression?: string;
	sha1?: string;
}

interface DolphinStats {
	blockSize?: string;
	compressionMethod?: string;
	compressionLevel?: string;
	internalName?: string;
	revision?: string;
	gameId?: string;
	titleId?: string;
	region?: string;
	country?: string;
}

const parseChdOutput = (text: string): ChdStats => {
	const stats: ChdStats = {};
	const lines = text.split("\n");
	lines.forEach((line) => {
		const cleanLine = line.trim();
		if (cleanLine.startsWith("Logical size:"))
			stats.logicalSize = cleanLine.split(":")[1].trim();
		if (cleanLine.startsWith("CHD size:"))
			stats.chdSize = cleanLine.split(":")[1].trim();
		if (cleanLine.startsWith("Ratio:"))
			stats.ratio = cleanLine.split(":")[1].trim();
		if (cleanLine.startsWith("Compression:"))
			stats.compression = cleanLine.split(":")[1].trim();
		if (cleanLine.startsWith("SHA1:"))
			stats.sha1 = cleanLine.split(":")[1].trim();
	});
	return stats;
};

const parseDolphinOutput = (text: string): DolphinStats => {
	const stats: DolphinStats = {};
	const lines = text.split("\n");
	lines.forEach((line) => {
		const cleanLine = line.trim();
		if (cleanLine.startsWith("Block Size:"))
			stats.blockSize = cleanLine.split(":")[1].trim();
		if (cleanLine.startsWith("Compression Method:"))
			stats.compressionMethod = cleanLine.split(":")[1].trim();
		if (cleanLine.startsWith("Compression Level:"))
			stats.compressionLevel = cleanLine.split(":")[1].trim();
		if (cleanLine.startsWith("Internal Name:"))
			stats.internalName = cleanLine.split(":")[1].trim();
		if (cleanLine.startsWith("Revision:"))
			stats.revision = cleanLine.split(":")[1].trim();
		if (cleanLine.startsWith("Game ID:"))
			stats.gameId = cleanLine.split(":")[1].trim();
		if (cleanLine.startsWith("Title ID:"))
			stats.titleId = cleanLine.split(":")[1].trim();
		if (cleanLine.startsWith("Region:"))
			stats.region = cleanLine.split(":")[1].trim();
		if (cleanLine.startsWith("Country:"))
			stats.country = cleanLine.split(":")[1].trim();
	});
	return stats;
};

// Attempt to find Game ID in filename if extraction failed
const extractGameIdFromFilename = (filename: string): string | null => {
	// Match patterns like SLUS-20813, SLES_555.22, SCES 12345
	const patterns = [
		/[A-Z]{4}-\d{5}/, // SLUS-20813
		/[A-Z]{4}_\d{3}\.\d{2}/, // SLES_555.22
		/[A-Z]{4}\s\d{5}/, // SCES 12345
		/[A-Z]{4}\d{5}/, // SLUS20813
	];

	for (const pattern of patterns) {
		const match = filename.toUpperCase().match(pattern);
		if (match) {
			return match[0].replace("_", "-").replace(".", "").replace(" ", "-");
		}
	}
	return null;
};

const formatFileSize = (bytes: number): string => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export function InfoViewer() {
	const [gameInfo, setGameInfo] = useState<GameInfo | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | undefined>(undefined);
	const [isDragging, setIsDragging] = useState(false);
	const [showRaw, setShowRaw] = useState(false);

	const processFilePath = useCallback(async (
		filePath: string,
		fileName?: string,
		fileSize?: number,
	) => {
		setIsLoading(true);
		setError(undefined);
		setShowRaw(false); // Reset raw view toggle

		try {
			// Get file name and size if not provided
			const name = fileName || filePath.split(/[\\\/]/).pop() || "unknown";
			let size = fileSize || 0;

			if (!fileSize) {
				try {
					const { stat } = await import("@tauri-apps/plugin-fs");
					const fileStat = await stat(filePath);
					size = fileStat.size;
				} catch (e) {
					console.warn(`Failed to stat file ${filePath}`, e);
				}
			}

			// Determine format and system
			const extension = filePath.toLowerCase().split(".").pop();
			const format = extension?.toUpperCase() || "Unknown";
			const system = await MetadataService.detectSystemAsync(filePath);

			// Initialize info object
			let gameId: string | null = null;
			let coverPath: string | undefined;
			let rawOutput: string | undefined;
			let chdStats: ChdStats | undefined;
			let dolphinStats: DolphinStats | undefined;

			// Extract game ID using the unified API
			try {
				gameId = await MetadataService.extractGameId(filePath, system);
			} catch (e) {
				console.error("Failed to extract game ID:", e);
			}

			// detailed info via tools (chdman or dolphin)
			if (extension === "chd") {
				try {
					const { BinaryManagerService } = await import(
						"@/services/BinaryManagerService"
					);
					const command = BinaryManagerService.createCommand("chdman", [
						"info",
						"-i",
						filePath,
					]);
					const output = await command.execute();
					if (output.code === 0) {
						rawOutput = output.stdout;
						chdStats = parseChdOutput(rawOutput);
					} else {
						console.warn("chdman info failed:", output.stderr);
					}
				} catch (e) {
					console.error("Failed to get CHD info:", e);
				}
			} else if (
				["rvz", "wbfs", "gcz", "gcm"].includes(extension || "") ||
				(extension === "iso" && (system === "GameCube" || system === "Wii"))
			) {
				try {
					const { BinaryManagerService } = await import(
						"@/services/BinaryManagerService"
					);
					const command = BinaryManagerService.createCommand("dolphintool", [
						"header",
						"-i",
						filePath,
					]);
					const output = await command.execute();
					if (output.code === 0) {
						rawOutput = output.stdout;
						dolphinStats = parseDolphinOutput(rawOutput);
						// Update gameId if found in stats and not already set
						if (dolphinStats.gameId && !gameId) {
							gameId = dolphinStats.gameId;
						}
					} else {
						console.warn("DolphinTool header failed:", output.stderr);
					}
				} catch (e) {
					console.error("Failed to get Dolphin info:", e);
				}
			}

			// 3. Fallback: Filename Regex (Essential for CHDs and files where extraction failed)
			if (!gameId) {
				gameId = extractGameIdFromFilename(name);
				if (gameId) {
					console.log(`Extracted Game ID from filename: ${gameId}`);
				}
			}

			// Fetch Cover using the "Unfailable" pipeline
			console.log(`Fetching cover for ${name} (${system})`);
			const coverUrl = await MetadataService.fetchCover(
				gameId,
				system,
				filePath,
			);
			if (coverUrl) {
				coverPath = coverUrl;
			}

			setGameInfo({
				filename: name,
				path: filePath,
				format,
				size,
				system,
				gameId,
				coverPath,
				rawOutput,
				chdStats,
				dolphinStats,
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to read file info");
		} finally {
			setIsLoading(false);
		}
	}, []);

	const processFile = useCallback(async (file: File) => {
		// @ts-ignore - file.path exists in Tauri
		let filePath = file.path;

		if (!filePath) {
			// @ts-ignore
			const isTauri =
				typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
			if (!isTauri) {
				console.log("[MOCK] Browser detected");
				filePath = `/mock/${file.name}`;
			} else {
				setError("Could not get file path");
				return;
			}
		}

		await processFilePath(filePath, file.name, file.size);
	}, [processFilePath]);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
	}, []);

	const handleDrop = useCallback(async (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);

		const files = Array.from(e.dataTransfer.files);
		if (files.length > 0) {
			await processFile(files[0]);
		}
	}, [processFile]);

	const handleClick = useCallback(async () => {
		try {
			const { open } = await import("@tauri-apps/plugin-dialog");
			const selected = await open({
				multiple: false,
				filters: [
					{
						name: "Game Files",
						extensions: [
							"iso",
							"bin",
							"cue",
							"chd",
							"rvz",
							"gcz",
							"gcm",
							"wbfs",
							"gdi",
						],
					},
				],
			});

			if (selected && typeof selected === "string") {
				await processFilePath(selected);
			}
		} catch (err) {
			console.error("Failed to open file dialog", err);
		}
	}, [processFilePath]);

	return (
		<div className="flex flex-col gap-4 h-full">
			{/* Drop Zone */}
			<div
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
				onClick={handleClick}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						handleClick();
					}
				}}
				role="button"
				tabIndex={0}
				className={`
                    border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                    transition-colors duration-200
                    ${
											isDragging
												? "border-primary bg-primary/10"
												: "border-muted-foreground/25 hover:border-muted-foreground/50 bg-muted/5"
										}
                `}
			>
				<div className="flex flex-col items-center gap-2 text-muted-foreground">
					<InfoIcon className="h-12 w-12" />
					<p className="text-sm font-medium">
						{isDragging
							? "Drop file here..."
							: "Drop a game file or click to browse"}
					</p>
					<p className="text-xs">Supports ISO, CHD, RVZ, GCZ, BIN/CUE, GDI</p>
				</div>
			</div>

			{/* Loading State */}
			{isLoading && (
				<Card>
					<CardContent className="flex items-center justify-center p-8">
						<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
						<span className="ml-2 text-sm text-muted-foreground">
							Analyzing file and fetching metadata...
						</span>
					</CardContent>
				</Card>
			)}

			{/* Error State */}
			{error && (
				<Card className="border-destructive">
					<CardContent className="p-4">
						<p className="text-sm text-destructive">{error}</p>
					</CardContent>
				</Card>
			)}

			{/* Game Info Display */}
			{gameInfo && !isLoading && (
				<div className="flex-1 overflow-auto space-y-4">
					<Card>
						<CardHeader className="pb-4">
							<CardTitle className="flex items-start justify-between gap-4">
								<div className="flex items-center gap-2">
									<FileIcon className="h-5 w-5 text-primary" />
									<span className="break-all">{gameInfo.filename}</span>
								</div>
								{gameInfo.system && (
									<span className="px-3 py-1 bg-secondary text-secondary-foreground text-xs rounded-full font-medium whitespace-nowrap">
										{gameInfo.system}
									</span>
								)}
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="flex flex-col md:flex-row gap-6">
								{/* Cover Art Column */}
								<div className="flex-shrink-0 mx-auto md:mx-0">
									{gameInfo.coverPath ? (
										<div className="w-48 h-64 rounded-lg overflow-hidden border-2 border-border shadow-lg">
											<img
												src={gameInfo.coverPath}
												alt="Game Cover"
												className="w-full h-full object-cover"
												onError={(e) => {
													(e.target as HTMLImageElement).style.display = "none";
												}}
											/>
										</div>
									) : (
										<div className="w-48 h-64 rounded-lg border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center bg-muted/5 text-muted-foreground">
											<ImageIcon className="h-12 w-12 mb-2 opacity-50" />
											<p className="text-xs font-medium">No Cover Art</p>
											{!gameInfo.gameId && (
												<p className="text-[10px] text-center px-2 mt-1 opacity-70">
													ID not found
												</p>
											)}
										</div>
									)}
								</div>

								{/* Info Column */}
								<div className="flex-1 space-y-6">
									{/* Basic Props Grid */}
									<div className="grid grid-cols-2 gap-4">
										<div className="space-y-1">
											<span className="text-xs font-medium text-muted-foreground">
												Format
											</span>
											<div className="flex items-center gap-2">
												<div className="h-2 w-2 rounded-full bg-green-500" />
												<p className="text-sm font-mono font-medium">
													{gameInfo.format}
												</p>
											</div>
										</div>
										<div className="space-y-1">
											<span className="text-xs font-medium text-muted-foreground">
												File Size
											</span>
											<p className="text-sm font-mono font-medium">
												{formatFileSize(gameInfo.size)}
											</p>
										</div>
										{gameInfo.gameId && (
											<div className="space-y-1">
												<span className="text-xs font-medium text-muted-foreground">
													Game ID
												</span>
												<p className="text-sm font-mono font-medium bg-muted/50 px-2 py-1 rounded inline-block">
													{gameInfo.gameId}
												</p>
											</div>
										)}
									</div>

									{/* Dolphin/RVZ Stats Grid (if available) */}
									{gameInfo.dolphinStats && (
										<div className="bg-muted/10 border rounded-lg p-4 space-y-3">
											<div className="flex items-center gap-2 mb-2">
												<HardDrive className="h-4 w-4 text-primary" />
												<h4 className="text-sm font-semibold">
													Game Information
												</h4>
											</div>
											<div className="grid grid-cols-2 gap-y-4 gap-x-8">
												{gameInfo.dolphinStats.internalName && (
													<div className="col-span-2">
														<span className="text-xs text-muted-foreground block mb-1">
															Internal Name
														</span>
														<span className="text-sm font-medium">
															{gameInfo.dolphinStats.internalName}
														</span>
													</div>
												)}
												{gameInfo.dolphinStats.compressionMethod && (
													<div>
														<span className="text-xs text-muted-foreground block mb-1">
															Compression
														</span>
														<div className="flex items-center gap-2">
															<FileArchive className="h-3 w-3 text-muted-foreground" />
															<span className="text-xs font-mono">
																{gameInfo.dolphinStats.compressionMethod} (L
																{gameInfo.dolphinStats.compressionLevel})
															</span>
														</div>
													</div>
												)}
												{gameInfo.dolphinStats.blockSize && (
													<div>
														<span className="text-xs text-muted-foreground block mb-1">
															Block Size
														</span>
														<span className="text-xs font-mono text-muted-foreground">
															{gameInfo.dolphinStats.blockSize}
														</span>
													</div>
												)}
												{(gameInfo.dolphinStats.region ||
													gameInfo.dolphinStats.country) && (
													<div>
														<span className="text-xs text-muted-foreground block mb-1">
															Region
														</span>
														<span className="text-xs font-medium">
															{gameInfo.dolphinStats.region} (
															{gameInfo.dolphinStats.country})
														</span>
													</div>
												)}
												{gameInfo.dolphinStats.revision && (
													<div>
														<span className="text-xs text-muted-foreground block mb-1">
															Revision
														</span>
														<span className="text-xs font-mono text-muted-foreground">
															{gameInfo.dolphinStats.revision}
														</span>
													</div>
												)}
											</div>
										</div>
									)}

									{/* CHD Stats Grid (if available) */}
									{gameInfo.chdStats && (
										<div className="bg-muted/10 border rounded-lg p-4 space-y-3">
											<div className="flex items-center gap-2 mb-2">
												<HardDrive className="h-4 w-4 text-primary" />
												<h4 className="text-sm font-semibold">
													Compression Stats
												</h4>
											</div>
											<div className="grid grid-cols-2 gap-y-4 gap-x-8">
												<div>
													<span className="text-xs text-muted-foreground block mb-1">
														Ratio
													</span>
													<div className="flex items-center gap-2">
														<Percent className="h-3 w-3 text-muted-foreground" />
														<span className="text-sm font-bold text-green-500">
															{gameInfo.chdStats.ratio}
														</span>
													</div>
												</div>
												<div>
													<span className="text-xs text-muted-foreground block mb-1">
														Codecs
													</span>
													<div className="flex items-center gap-2">
														<FileArchive className="h-3 w-3 text-muted-foreground" />
														<span
															className="text-xs font-mono"
															title={gameInfo.chdStats.compression}
														>
															{gameInfo.chdStats.compression
																?.split(",")
																.map((c) => c.split(" ")[0])
																.join(", ")}
														</span>
													</div>
												</div>
												<div>
													<span className="text-xs text-muted-foreground block mb-1">
														Uncompressed
													</span>
													<span className="text-xs font-mono text-muted-foreground">
														{gameInfo.chdStats.logicalSize?.includes("bytes")
															? formatFileSize(
																	parseInt(
																		gameInfo.chdStats.logicalSize
																			.replace(/,/g, "")
																			.split(" ")[0],
																	),
																)
															: gameInfo.chdStats.logicalSize}
													</span>
												</div>
												<div>
													<span className="text-xs text-muted-foreground block mb-1">
														Condensed
													</span>
													<span className="text-xs font-mono text-muted-foreground">
														{gameInfo.chdStats.chdSize?.includes("bytes")
															? formatFileSize(
																	parseInt(
																		gameInfo.chdStats.chdSize
																			.replace(/,/g, "")
																			.split(" ")[0],
																	),
																)
															: gameInfo.chdStats.chdSize}
													</span>
												</div>
											</div>
										</div>
									)}

									{/* Hashes (if available) */}
									{gameInfo.chdStats?.sha1 && (
										<div className="space-y-1">
											<div className="flex items-center gap-2">
												<Fingerprint className="h-3 w-3 text-muted-foreground" />
												<span className="text-xs font-medium text-muted-foreground">
													SHA1 Checksum
												</span>
											</div>
											<p className="text-[10px] font-mono bg-muted p-2 rounded break-all select-all">
												{gameInfo.chdStats.sha1}
											</p>
										</div>
									)}
								</div>
							</div>

							{/* Raw Output Accordion/Details */}
							{gameInfo.rawOutput && (
								<div className="border-t pt-2">
									<div className="flex items-center justify-between">
										<Button
											variant="ghost"
											size="sm"
											onClick={() => setShowRaw(!showRaw)}
											className="text-xs text-muted-foreground hover:text-foreground h-8 px-2"
										>
											{showRaw ? (
												<>
													<ChevronUp className="h-3 w-3 mr-1" /> Hide Raw Output
												</>
											) : (
												<>
													<ChevronDown className="h-3 w-3 mr-1" /> Show Raw
													Output
												</>
											)}
										</Button>
									</div>

									{showRaw && (
										<div className="mt-2">
											<pre className="text-xs bg-black/5 dark:bg-black/20 p-3 rounded-md overflow-auto max-h-64 font-mono text-muted-foreground whitespace-pre-wrap">
												{gameInfo.rawOutput}
											</pre>
										</div>
									)}
								</div>
							)}

							{/* File Path Footer */}
							<div className="border-t pt-4">
								<span className="text-xs font-medium text-muted-foreground">
									Full Path
								</span>
								<p className="text-xs font-mono text-muted-foreground break-all mt-1 opacity-70 hover:opacity-100 transition-opacity">
									{gameInfo.path}
								</p>
							</div>
						</CardContent>
					</Card>
				</div>
			)}
		</div>
	);
}
