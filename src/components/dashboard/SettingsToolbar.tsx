import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Cpu } from "lucide-react";
import {
	usePackerStore,
	CompressionPreset,
	Platform,
} from "@/stores/usePackerStore";

// This component is now exclusively for the Compress workflow
export function SettingsToolbar() {
	const { preset, setPreset, platform, setPlatform } = usePackerStore();

	return (
		<div className="flex items-center gap-2 bg-card border rounded-md p-1 shadow-sm h-10 w-fit">
			{/* Platform Selector */}
			<Select
				value={platform}
				onValueChange={(val) => setPlatform(val as Platform)}
			>
				<SelectTrigger className="h-8 border-none bg-transparent hover:bg-muted/50 focus:ring-0 w-[120px] text-muted-foreground data-[state=open]:text-foreground">
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

			<div className="w-[1px] h-4 bg-border mx-1" />

			{/* Preset Selector */}
			<Select
				value={preset}
				onValueChange={(val) => setPreset(val as CompressionPreset)}
			>
				<SelectTrigger className="h-8 border-none bg-transparent hover:bg-muted/50 focus:ring-0 w-[140px] text-muted-foreground data-[state=open]:text-foreground">
					<div className="flex items-center gap-2">
						<Cpu className="h-3 w-3" />
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
