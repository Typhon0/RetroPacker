import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Settings, X } from "lucide-react";
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
import { usePackerStore } from "@/stores/usePackerStore";

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
						<TabsList className="w-full grid grid-cols-2">
							<TabsTrigger value="general">General</TabsTrigger>
							<TabsTrigger value="compression">Compression Engines</TabsTrigger>
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
									These settings apply when the <b>Compress</b> workflow is
									active.
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
								</TabsContent>
							</Tabs>
						</TabsContent>
					</Tabs>
				</div>
			</DialogContent>
		</Dialog>
	);
}
