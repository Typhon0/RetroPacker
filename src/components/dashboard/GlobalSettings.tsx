import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { jobStore } from "@/stores/JobStore";
import { usePackerStore } from "@/stores/usePackerStore";

function DatabaseManagerTab() {
	const [stats, setStats] = useState<{
		row_count: number;
		last_updated: string;
	} | null>(null);
	const [isSyncing, setIsSyncing] = useState(false);
	const [isImporting, setIsImporting] = useState(false);

	const fetchStats = useCallback(async () => {
		try {
			const dbStats = await invoke<{
				row_count: number;
				last_updated: string;
			}>("get_db_stats");
			setStats(dbStats);
		} catch (e) {
			console.error("Failed to fetch DB stats:", e);
		}
	}, []);

	useEffect(() => {
		fetchStats();
	}, [fetchStats]);

	const handleSync = async () => {
		try {
			setIsSyncing(true);
			await invoke("sync_online_databases");
			await fetchStats();
		} catch (e) {
			console.error("Failed to sync databases:", e);
		} finally {
			setIsSyncing(false);
		}
	};

	const handleImport = async () => {
		try {
			const selected = await open({
				multiple: false,
				filters: [{ name: "DAT Files", extensions: ["dat", "xml"] }],
			});
			if (selected && typeof selected === "string") {
				setIsImporting(true);
				await invoke("import_dat_file", { path: selected });
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
			<div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
				<div className="flex items-center gap-3">
					<div className="p-2 bg-primary/10 rounded-full text-primary">
						<Database className="h-5 w-5" />
					</div>
					<div>
						<h4 className="font-medium">Redump & No-Intro Database</h4>
						<p className="text-xs text-muted-foreground">
							{stats?.row_count
								? `${stats.row_count.toLocaleString()} signatures loaded`
								: "No signatures loaded"}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
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
		const selected = await open({
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
			const path = await save({
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
			await writeFile(path, bytes);
		} catch (error) {
			console.error("Failed to export logs:", error);
		}
	};

	const handleOpenConfigFolder = async () => {
		try {
			const configPath = await appDataDir();
			await openPath(configPath);
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
					className="h-9 w-9 text-muted-foreground hover:text-foreground"
					title="Settings"
				>
					<Settings className="h-5 w-5" />
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
						<TabsList className="w-full grid grid-cols-4">
							<TabsTrigger value="general">General</TabsTrigger>
							<TabsTrigger value="compression">Compression Engines</TabsTrigger>
							<TabsTrigger value="databases">Databases</TabsTrigger>
							<TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
						</TabsList>

						{/* General Tab */}
						<TabsContent
							value="general"
							className="p-4 border rounded-md mt-2 space-y-4 min-h-[300px]"
						>
							<h3 className="text-sm font-medium text-foreground mb-2">
								Workflow Options
							</h3>
							<div className="space-y-4">
								<label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-muted/50 rounded-md transition-colors">
									<input
										type="checkbox"
										className="h-4 w-4 rounded border-gray-300"
										checked={deleteSourceAfterSuccess}
										onChange={(e) =>
											setDeleteSourceAfterSuccess(e.target.checked)
										}
									/>
									<div className="flex flex-col">
										<span className="text-sm font-medium">
											Delete source files
										</span>
										<span className="text-xs text-muted-foreground">
											Move source files to Recycle Bin after successful
											processing
										</span>
									</div>
								</label>

								{/* Output Directory */}
								<div className="p-2 hover:bg-muted/50 rounded-md transition-colors">
									<div className="flex flex-col gap-1">
										<span className="text-sm font-medium">
											Output directory
										</span>
										<span className="text-xs text-muted-foreground">
											Where processed files are saved. Leave empty to use the
											source file&apos;s folder.
										</span>
										<div className="flex items-center gap-2 mt-1">
											<button
												type="button"
												onClick={handlePickOutputDir}
												className="flex items-center gap-2 h-8 px-3 rounded-md border border-input bg-transparent text-sm hover:bg-muted/50 transition-colors flex-1 min-w-0 text-left"
											>
												<FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
												<span className="truncate text-muted-foreground">
													{outputDirectory || "Same as source"}
												</span>
											</button>
											{outputDirectory && (
												<button
													type="button"
													onClick={() => setOutputDirectory("")}
													className="h-8 w-8 flex items-center justify-center rounded-md border border-input hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
													title="Reset to source directory"
												>
													<X className="h-3.5 w-3.5" />
												</button>
											)}
										</div>
									</div>
								</div>
							</div>
						</TabsContent>

						{/* Compression Engines Tab */}
						<TabsContent
							value="compression"
							className="p-4 border rounded-md mt-2 space-y-4 min-h-[300px]"
						>
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

								<TabsContent
									value="chd"
									className="space-y-4 animate-in fade-in-50"
								>
									{preset === "custom" && (
										<div className="grid gap-2 pb-4 border-b">
											<label
												htmlFor="custom-codecs-input"
												className="text-sm font-medium"
											>
												Custom Codecs
											</label>
											<input
												id="custom-codecs-input"
												className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
												value={customCompression}
												onChange={(e) => setCustomCompression(e.target.value)}
												placeholder="lzma,zlib,huff"
											/>
											<span className="text-[10px] text-muted-foreground">
												Comma-separated list of codecs
											</span>
										</div>
									)}

									<div className="grid gap-2">
										<label
											htmlFor="hunk-size-input"
											className="text-sm font-medium"
										>
											Hunk Size
										</label>
										<input
											id="hunk-size-input"
											type="number"
											className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
											value={chd.hunkSize || ""}
											onChange={(e) => {
												const val = e.target.value
													? parseInt(e.target.value, 10)
													: undefined;
												setChdSetting("hunkSize", val);
											}}
											placeholder="Auto (Default)"
										/>
										<span className="text-[10px] text-muted-foreground">
											Bytes (e.g. 2048 for DVD). Leave empty for auto.
										</span>
									</div>
									<div className="grid gap-2">
										<span className="text-sm font-medium">Media Type</span>
										<Select
											value={chd.mediaType}
											onValueChange={(val) =>
												setChdSetting(
													"mediaType",
													val as "auto" | "cd" | "dvd" | "hdd" | "ld" | "raw",
												)
											}
										>
											<SelectTrigger className="h-8 w-full">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="auto">Auto-Detect</SelectItem>
												<SelectItem value="cd">CD</SelectItem>
												<SelectItem value="dvd">DVD</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</TabsContent>

								<TabsContent
									value="nintendo"
									className="space-y-4 animate-in fade-in-50"
								>
									<div className="grid gap-2">
										<span className="text-sm font-medium">Output Format</span>
										<Select
											value={dolphin.format}
											onValueChange={(val) =>
												setDolphinSetting(
													"format",
													val as "rvz" | "iso" | "gcz" | "wia",
												)
											}
										>
											<SelectTrigger className="h-8 w-full">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="rvz">
													RVZ (Modern / Recommended)
												</SelectItem>
												<SelectItem value="iso">ISO (Uncompressed)</SelectItem>
												<SelectItem value="gcz">GCZ (Legacy)</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div className="grid gap-2">
										<span className="text-sm font-medium">Block Size</span>
										<Select
											value={dolphin.blockSize.toString()}
											onValueChange={(val) =>
												setDolphinSetting("blockSize", parseInt(val, 10))
											}
										>
											<SelectTrigger className="h-8 w-full">
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
										<span className="text-[10px] text-muted-foreground">
											Larger blocks compress better but seek slower.
										</span>
									</div>
									<div className="grid gap-2">
										<span className="text-sm font-medium">Verify Hash</span>
										<Select
											value={dolphin.verifyAlgorithm}
											onValueChange={(val) =>
												setDolphinSetting(
													"verifyAlgorithm",
													val as "md5" | "sha1" | "crc32",
												)
											}
										>
											<SelectTrigger className="h-8 w-full">
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
										<span className="text-[10px] text-muted-foreground">
											SHA-1 is required to verify against Redump/No-Intro.
										</span>
									</div>
								</TabsContent>
							</Tabs>
						</TabsContent>

						{/* Databases Tab */}
						<TabsContent
							value="databases"
							className="p-4 border rounded-md mt-2 space-y-4 min-h-[300px]"
						>
							<DatabaseManagerTab />
						</TabsContent>

						{/* Diagnostics Tab */}
						<TabsContent
							value="diagnostics"
							className="p-4 border rounded-md mt-2 space-y-4 min-h-[300px]"
						>
							<h3 className="text-sm font-medium text-foreground mb-2">
								Troubleshooting & Logs
							</h3>
							<div className="space-y-4">
								<label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-muted/50 rounded-md transition-colors">
									<input
										type="checkbox"
										className="h-4 w-4 rounded border-gray-300"
										checked={enableDetectionTracing}
										onChange={(e) =>
											setEnableDetectionTracing(e.target.checked)
										}
									/>
									<div className="flex flex-col">
										<span className="text-sm font-medium">
											Enable Detection Tracing
										</span>
										<span className="text-xs text-muted-foreground">
											Prints detailed platform detection steps to the developer
											console for troubleshooting Unknown matches.
										</span>
									</div>
								</label>

								<div className="flex flex-col gap-1 p-2 hover:bg-muted/50 rounded-md transition-colors">
									<span className="text-sm font-medium">
										Export Session Logs
									</span>
									<span className="text-xs text-muted-foreground pb-2">
										Save all current job logs and statuses to a file for
										troubleshooting.
									</span>
									<Button
										onClick={handleExportLogs}
										className="w-fit gap-2"
										variant="secondary"
									>
										<Download className="h-4 w-4" /> Export Logs
									</Button>
								</div>

								<div className="flex flex-col gap-1 p-2 hover:bg-muted/50 rounded-md transition-colors">
									<span className="text-sm font-medium">
										Configuration Folder
									</span>
									<span className="text-xs text-muted-foreground pb-2">
										Open the directory where application settings and cache are
										stored.
									</span>
									<Button
										onClick={handleOpenConfigFolder}
										className="w-fit gap-2"
										variant="secondary"
									>
										<Folder className="h-4 w-4" /> Open Config Folder
									</Button>
								</div>
							</div>
						</TabsContent>
					</Tabs>
				</div>
			</DialogContent>
		</Dialog>
	);
}
