import {
	Database,
	Download,
	Folder,
	FolderOpen,
	RefreshCw,
	Settings,
	Upload,
	X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRepositories } from "@/presentation/context/RepositoryContext";
import { jobStore } from "@/stores/JobStore";
import { usePackerStore } from "@/stores/usePackerStore";

function DatabaseManagerTab() {
	const { databaseRepository, dialogRepository } = useRepositories();
	const [stats, setStats] = useState<{
		row_count: number;
		last_updated: string;
	} | null>(null);
	const [isSyncing, setIsSyncing] = useState(false);
	const [isImporting, setIsImporting] = useState(false);

	const fetchStats = useCallback(async () => {
		try {
			const dbStats = await databaseRepository.getStats();
			setStats(dbStats);
		} catch (e) {
			console.error("Failed to fetch DB stats:", e);
		}
	}, [databaseRepository]);

	useEffect(() => {
		fetchStats();
	}, [fetchStats]);

	const handleSync = async () => {
		try {
			setIsSyncing(true);
			await databaseRepository.syncOnlineDatabases();
			await fetchStats();
		} catch (e) {
			console.error("Failed to sync databases:", e);
		} finally {
			setIsSyncing(false);
		}
	};

	const handleImport = async () => {
		try {
			const selected = await dialogRepository.open({
				multiple: false,
				filters: [{ name: "DAT Files", extensions: ["dat", "xml"] }],
			});
			if (selected && typeof selected === "string") {
				setIsImporting(true);
				await databaseRepository.importDatFile(selected);
				await fetchStats();
			}
		} catch (e) {
			console.error("Failed to import DAT file:", e);
		} finally {
			setIsImporting(false);
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-muted/30 rounded-lg border">
				<div className="flex items-start sm:items-center gap-3">
					<div className="p-2 bg-primary/10 rounded-full text-primary shrink-0 mt-1 sm:mt-0">
						<Database className="h-5 w-5" />
					</div>
					<div className="min-w-0">
						<h4 className="font-medium truncate text-wrap leading-tight">
							Redump & No-Intro Database
						</h4>
						<p className="text-xs text-muted-foreground mt-1">
							{stats?.row_count
								? `${stats.row_count.toLocaleString()} signatures loaded`
								: "No signatures loaded"}
						</p>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-0">
					<Button
						variant="outline"
						size="sm"
						onClick={handleImport}
						disabled={isImporting || isSyncing}
						className="gap-2"
					>
						<Upload className="h-4 w-4" />
						{isImporting ? "Importing..." : "Import DAT"}
					</Button>
					<Button
						variant="default"
						size="sm"
						onClick={handleSync}
						disabled={isSyncing || isImporting}
						className="gap-2"
					>
						<RefreshCw
							className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
						/>
						{isSyncing ? "Syncing..." : "Auto Sync"}
					</Button>
				</div>
			</div>

			<div className="text-sm text-muted-foreground space-y-2">
				<p>
					The local signature database is used during the{" "}
					<strong>Verify</strong> workflow to guarantee data integrity (1:1
					perfect rip).
				</p>
				<p>
					You can sync automatically from GitHub (libretro-database), or
					download specific <code>.dat</code> files from Redump/No-Intro and
					import them manually.
				</p>
			</div>
		</div>
	);
}

export function GlobalSettings() {
	const { dialogRepository, fileSystem } = useRepositories();
	const {
		preset,
		customCompression,
		setCustomCompression,
		chd,
		setChdSetting,
		dolphin,
		setDolphinSetting,
		deleteSourceAfterSuccess,
		setDeleteSourceAfterSuccess,
		enableDetectionTracing,
		setEnableDetectionTracing,
		outputDirectory,
		setOutputDirectory,
	} = usePackerStore();

	const handlePickOutputDir = async () => {
		const selected = await dialogRepository.open({
			directory: true,
			multiple: false,
			title: "Select Output Directory",
		});
		if (selected && typeof selected === "string") {
			setOutputDirectory(selected);
		}
	};

	const handleExportLogs = async () => {
		try {
			const path = await dialogRepository.save({
				filters: [{ name: "Logs", extensions: ["txt"] }],
				defaultPath: "retropacker-logs.txt",
			});
			if (!path) return;

			const allWorkflows = ["compress", "extract", "verify", "info"] as const;
			let logContents =
				"RetroPacker Diagnostics Logs\n============================\n\n";

			let hasJobs = false;
			for (const wf of allWorkflows) {
				const jobs = jobStore.queues[wf].value;
				if (jobs.length > 0) {
					hasJobs = true;
					logContents += `\n--- WORKFLOW: ${wf.toUpperCase()} ---\n`;
					for (const job of jobs) {
						logContents += `\nJob: ${job.filename} (${job.id})\nStatus: ${job.status}\n`;
						if (job.errorMessage) logContents += `Error: ${job.errorMessage}\n`;
						logContents += `Logs:\n${job.outputLog.value.join("\n")}\n----------------\n`;
					}
				}
			}
			if (!hasJobs) logContents += "No jobs in current session.\n";

			const bytes = new TextEncoder().encode(logContents);
			await fileSystem.writeBytesFile(path, bytes);
		} catch (error) {
			console.error("Failed to export logs:", error);
		}
	};

	const handleOpenConfigFolder = async () => {
		try {
			const configPath = await fileSystem.getAppDataDir();
			await fileSystem.openPath(configPath);
		} catch (error) {
			console.error("Failed to open config folder:", error);
		}
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="h-9 w-9"
					aria-label="Open settings"
				>
					<Settings className="h-4 w-4 text-muted-foreground" />
				</Button>
			</DialogTrigger>
			{/* Widened dialog to accommodate sub-tabs comfortably */}
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Settings</DialogTitle>
					<DialogDescription>
						Configure global application behavior and advanced engine
						parameters.
					</DialogDescription>
				</DialogHeader>

				<div className="py-2">
					<Tabs defaultValue="general" className="w-full">
						<TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto sm:h-10">
							<TabsTrigger value="general">General</TabsTrigger>
							<TabsTrigger value="compression">Compression</TabsTrigger>
							<TabsTrigger value="databases">Databases</TabsTrigger>
							<TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
						</TabsList>

						{/* General Tab */}
						<TabsContent value="general" className="mt-4 min-h-[300px]">
							<div className="flex flex-col gap-4">
								<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
									Workflow Options
								</h3>
								<div className="flex flex-col gap-4">
									<div className="flex items-center justify-between rounded-lg border p-4 bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent/50">
										<div className="flex flex-col space-y-1">
											<Label className="text-sm font-medium">
												Delete source files
											</Label>
											<span className="text-sm text-muted-foreground">
												Move source files to Recycle Bin after successful
												processing
											</span>
										</div>
										<Switch
											checked={deleteSourceAfterSuccess}
											onCheckedChange={setDeleteSourceAfterSuccess}
										/>
									</div>

									{/* Output Directory */}
									<div className="flex flex-col gap-3 rounded-lg border p-4 bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent/50">
										<div className="flex flex-col space-y-1">
											<Label className="text-sm font-medium">
												Output directory
											</Label>
											<span className="text-sm text-muted-foreground">
												Where processed files are saved. Leave empty to use the
												source file&apos;s folder.
											</span>
										</div>
										<div className="flex items-center gap-2 mt-1">
											<button
												type="button"
												onClick={handlePickOutputDir}
												className="flex items-center gap-2 flex-1 h-10 px-3 rounded-md border border-input bg-background hover:bg-accent/50 hover:text-accent-foreground text-sm transition-colors shadow-sm min-w-0"
											>
												<FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
												<span className="truncate">
													{outputDirectory || "Same as source"}
												</span>
											</button>
											{outputDirectory && (
												<Button
													variant="outline"
													size="icon"
													type="button"
													onClick={() => setOutputDirectory("")}
													className="h-10 w-10 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
													title="Reset to source directory"
												>
													<X className="h-4 w-4" />
												</Button>
											)}
										</div>
									</div>
								</div>
							</div>
						</TabsContent>

						{/* Compression Engines Tab */}
						<TabsContent value="compression" className="mt-4 min-h-[300px]">
							<div className="flex flex-col gap-4">
								<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
									Compression Codecs
								</h3>
								<Tabs defaultValue="chd" className="w-full">
									<TabsList className="w-auto inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
										<TabsTrigger value="chd" className="text-xs px-3 h-7">
											CHD (MAME)
										</TabsTrigger>
										<TabsTrigger value="nintendo" className="text-xs px-3 h-7">
											Wii / GC (Dolphin)
										</TabsTrigger>
									</TabsList>

									<p className="text-xs text-muted-foreground mt-2 mb-4">
										Compression settings apply to <b>Compress</b>. Verification
										hash settings apply to <b>Verify</b>.
									</p>

									<TabsContent value="chd" className="animate-in fade-in-50">
										<div className="flex flex-col gap-4 rounded-lg border p-4 bg-card text-card-foreground shadow-sm">
											{preset === "custom" && (
												<div className="flex flex-col gap-2 pb-4 border-b">
													<Label
														htmlFor="custom-codecs-input"
														className="text-sm font-medium hover:cursor-pointer"
													>
														Custom Codecs
													</Label>
													<Input
														id="custom-codecs-input"
														value={customCompression}
														onChange={(e) =>
															setCustomCompression(e.target.value)
														}
														placeholder="lzma,zlib,huff"
													/>
													<span className="text-[10px] text-muted-foreground mt-0.5">
														Comma-separated list of codecs
													</span>
												</div>
											)}

											<div className="flex flex-col gap-1.5">
												<Label
													htmlFor="hunk-size-input"
													className="text-sm font-medium hover:cursor-pointer"
												>
													Hunk Size
												</Label>
												<Input
													id="hunk-size-input"
													type="number"
													value={chd.hunkSize || ""}
													onChange={(e) => {
														const val = e.target.value
															? parseInt(e.target.value, 10)
															: undefined;
														setChdSetting("hunkSize", val);
													}}
													placeholder="Auto (Default)"
												/>
												<span className="text-[10px] text-muted-foreground mt-0.5">
													Bytes (e.g. 2048 for DVD). Leave empty for auto.
												</span>
											</div>
											<div className="flex flex-col gap-1.5 pt-2">
												<Label className="text-sm font-medium">
													Media Type
												</Label>
												<Select
													value={chd.mediaType}
													onValueChange={(val) =>
														setChdSetting(
															"mediaType",
															val as
																| "auto"
																| "cd"
																| "dvd"
																| "hdd"
																| "ld"
																| "raw",
														)
													}
												>
													<SelectTrigger className="h-9 w-full bg-background mt-1">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="auto">Auto-Detect</SelectItem>
														<SelectItem value="cd">CD</SelectItem>
														<SelectItem value="dvd">DVD</SelectItem>
													</SelectContent>
												</Select>
											</div>
										</div>
									</TabsContent>

									<TabsContent
										value="nintendo"
										className="animate-in fade-in-50"
									>
										<div className="flex flex-col gap-4 rounded-lg border p-4 bg-card text-card-foreground shadow-sm">
											<div className="flex flex-col gap-1.5">
												<Label className="text-sm font-medium">
													Output Format
												</Label>
												<Select
													value={dolphin.format}
													onValueChange={(val) =>
														val &&
														setDolphinSetting(
															"format",
															val as "rvz" | "iso" | "gcz" | "wia",
														)
													}
												>
													<SelectTrigger className="h-9 w-full bg-background mt-1">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="rvz">
															RVZ (Modern / Recommended)
														</SelectItem>
														<SelectItem value="iso">
															ISO (Uncompressed)
														</SelectItem>
														<SelectItem value="gcz">GCZ (Legacy)</SelectItem>
													</SelectContent>
												</Select>
											</div>
											<div className="flex flex-col gap-1.5 pt-2">
												<Label className="text-sm font-medium">
													Block Size
												</Label>
												<Select
													value={dolphin.blockSize.toString()}
													onValueChange={(val) =>
														val &&
														setDolphinSetting("blockSize", parseInt(val, 10))
													}
												>
													<SelectTrigger className="h-9 w-full bg-background mt-1">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="32768">32 KiB</SelectItem>
														<SelectItem value="131072">
															128 KiB (Default)
														</SelectItem>
														<SelectItem value="262144">256 KiB</SelectItem>
														<SelectItem value="2097152">2 MiB</SelectItem>
													</SelectContent>
												</Select>
												<span className="text-[10px] text-muted-foreground mt-0.5">
													Larger blocks compress better but seek slower.
												</span>
											</div>
											<div className="flex flex-col gap-1.5 pt-2">
												<Label className="text-sm font-medium">
													Verify Hash
												</Label>
												<Select
													value={dolphin.verifyAlgorithm}
													onValueChange={(val) =>
														val &&
														setDolphinSetting(
															"verifyAlgorithm",
															val as "md5" | "sha1" | "crc32",
														)
													}
												>
													<SelectTrigger className="h-9 w-full bg-background mt-1">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="sha1">
															SHA-1 (Database Verification)
														</SelectItem>
														<SelectItem value="md5">MD5</SelectItem>
														<SelectItem value="crc32">CRC32</SelectItem>
													</SelectContent>
												</Select>
												<span className="text-[10px] text-muted-foreground mt-0.5">
													SHA-1 is required to verify against Redump/No-Intro.
												</span>
											</div>
										</div>
									</TabsContent>
								</Tabs>
							</div>
						</TabsContent>

						{/* Databases Tab */}
						<TabsContent value="databases" className="mt-4 min-h-[300px]">
							<div className="flex flex-col gap-4 bg-card rounded-lg border shadow-sm p-4 text-card-foreground">
								<DatabaseManagerTab />
							</div>
						</TabsContent>

						{/* Diagnostics Tab */}
						<TabsContent value="diagnostics" className="mt-4 min-h-[300px]">
							<div className="flex flex-col gap-4">
								<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
									Troubleshooting & Logs
								</h3>
								<div className="flex flex-col gap-4">
									<div className="flex items-center justify-between rounded-lg border p-4 bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent/50">
										<div className="flex flex-col space-y-1">
											<Label className="text-sm font-medium">
												Enable Detection Tracing
											</Label>
											<span className="text-sm text-muted-foreground">
												Prints detailed platform detection steps to the
												developer console for troubleshooting Unknown matches.
											</span>
										</div>
										<Switch
											checked={enableDetectionTracing}
											onCheckedChange={setEnableDetectionTracing}
										/>
									</div>

									<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-lg border p-4 bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent/50">
										<div className="flex flex-col space-y-1">
											<Label className="text-sm font-medium">
												Export Session Logs
											</Label>
											<span className="text-sm text-muted-foreground">
												Save all current job logs and statuses to a file for
												troubleshooting.
											</span>
										</div>
										<Button
											onClick={handleExportLogs}
											className="shrink-0 gap-2 h-10 px-4"
											variant="secondary"
										>
											<Download className="h-4 w-4" /> Export Logs
										</Button>
									</div>

									<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-lg border p-4 bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent/50">
										<div className="flex flex-col space-y-1">
											<Label className="text-sm font-medium">
												Configuration Folder
											</Label>
											<span className="text-sm text-muted-foreground">
												Open the directory where application settings and cache
												are stored.
											</span>
										</div>
										<Button
											onClick={handleOpenConfigFolder}
											className="shrink-0 gap-2 h-10 px-4"
											variant="secondary"
										>
											<Folder className="h-4 w-4" /> Config Folder
										</Button>
									</div>
								</div>
							</div>
						</TabsContent>
					</Tabs>
				</div>
			</DialogContent>
		</Dialog>
	);
}
