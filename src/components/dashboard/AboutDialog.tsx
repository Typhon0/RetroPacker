import { getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

export function AboutDialog() {
	const [version, setVersion] = useState("Unknown");
	const [tauriVersion, setTauriVersion] = useState("Unknown");

	useEffect(() => {
		getVersion()
			.then((v) => setVersion(v))
			// Version unavailable - acceptable fallback
			.catch(() => {});
		getTauriVersion()
			.then((v) => setTauriVersion(v))
			// Version unavailable - acceptable fallback
			.catch(() => {});
	}, []);

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="h-9 w-9 text-muted-foreground hover:text-foreground"
					aria-label="About RetroPacker"
				>
					<Info className="h-5 w-5" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>About RetroPacker</DialogTitle>
					<DialogDescription>
						A modern UI for rom packing and compression
					</DialogDescription>
				</DialogHeader>

				<div className="py-4 space-y-4">
					<div className="flex flex-col space-y-1">
						<span className="text-sm font-semibold">Version</span>
						<span className="text-sm text-muted-foreground">{version}</span>
					</div>
					<div className="flex flex-col space-y-1">
						<span className="text-sm font-semibold">Tauri Version</span>
						<span className="text-sm text-muted-foreground">
							{tauriVersion}
						</span>
					</div>
					<div className="flex flex-col space-y-1">
						<span className="text-sm font-semibold">Build Hash</span>
						<span className="text-sm text-muted-foreground">
							{import.meta.env.VITE_COMMIT_HASH || "dev-build"}
						</span>
					</div>
					<div className="flex flex-col space-y-1">
						<span className="text-sm font-semibold">Licenses</span>
						<p className="text-sm text-muted-foreground leading-relaxed">
							RetroPacker is open source software. <br />
							It utilizes <b>chdman</b> (from MAME project, GPL/BSD) and{" "}
							<b>DolphinTool</b> (from Dolphin Emulator project, GPLv2).
						</p>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
