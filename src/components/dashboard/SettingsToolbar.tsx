import { Cpu } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	type CompressionPreset,
	type Platform,
	usePackerStore,
} from "@/stores/usePackerStore";

// This component is now exclusively for the Compress workflow
export function SettingsToolbar() {
	const { preset, setPreset, platform, setPlatform } = usePackerStore();

	return (
		<div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1 h-10 max-w-full overflow-hidden">
			{/* Platform Selector */}
			<Select
				value={platform}
				onValueChange={(val) => setPlatform(val as Platform)}
			>
				<SelectTrigger className="h-8 flex-1 min-w-[80px] max-w-[120px] text-xs bg-transparent dark:bg-transparent dark:hover:bg-transparent">
					<SelectValue placeholder="Platform" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="auto">Auto</SelectItem>
					<SelectItem value="ps1">PlayStation</SelectItem>
					<SelectItem value="ps2">PS2</SelectItem>
					<SelectItem value="saturn">Saturn</SelectItem>
					<SelectItem value="dreamcast">Dreamcast</SelectItem>
					<SelectItem value="gamecube">GameCube</SelectItem>
					<SelectItem value="wii">Wii</SelectItem>
				</SelectContent>
			</Select>

			<div className="w-[1px] h-4 bg-border mx-1 shrink-0" />

			{/* Preset Selector */}
			<Select
				value={preset}
				onValueChange={(val) => setPreset(val as CompressionPreset)}
			>
				<SelectTrigger className="h-8 flex-1 min-w-[100px] max-w-[140px] text-xs bg-transparent dark:bg-transparent dark:hover:bg-transparent">
					<div className="flex items-center gap-2">
						<Cpu className="h-3 w-3 shrink-0" />
						<span className="truncate">
							{preset === "balanced"
								? "Balanced"
								: preset === "max"
									? "Max Compression"
									: preset === "fast"
										? "Fast Use"
										: preset === "raw"
											? "Uncompressed"
											: "Custom"}
						</span>
					</div>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="balanced">
						<div className="flex flex-col items-start">
							<span>Balanced</span>
							<span className="text-[10px] text-muted-foreground">
								Normal (lzma/zstd-5)
							</span>
						</div>
					</SelectItem>
					<SelectItem value="max">
						<div className="flex flex-col items-start">
							<span>Max Compression</span>
							<span className="text-[10px] text-muted-foreground">
								High (lzma/zstd-19)
							</span>
						</div>
					</SelectItem>
					<SelectItem value="fast">
						<div className="flex flex-col items-start">
							<span>Fast Use</span>
							<span className="text-[10px] text-muted-foreground">
								Quickest (zstd)
							</span>
						</div>
					</SelectItem>
					<SelectItem value="raw">
						<div className="flex flex-col items-start">
							<span>Uncompressed</span>
							<span className="text-[10px] text-muted-foreground">
								Store only
							</span>
						</div>
					</SelectItem>
					<SelectItem value="custom">
						<div className="flex flex-col items-start">
							<span>Custom</span>
							<span className="text-[10px] text-muted-foreground">
								Detailed config
							</span>
						</div>
					</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
