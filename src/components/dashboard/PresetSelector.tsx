import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { usePackerStore, CompressionPreset } from "@/stores/usePackerStore"

export function PresetSelector() {
    const { preset, setPreset } = usePackerStore();

    return (
        <div className="flex items-center gap-4">
            <div className="grid gap-1.5">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Compression Preset
                </label>
                <Select
                    value={preset}
                    onValueChange={(val) => setPreset(val as CompressionPreset)}
                >
                    <SelectTrigger className="w-[240px]">
                        <SelectValue placeholder="Select a preset" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            <SelectLabel>Presets</SelectLabel>
                            <SelectItem value="balanced">
                                <div className="flex flex-col items-start">
                                    <span className="font-medium">Balanced (Recommended)</span>
                                    <span className="text-xs text-muted-foreground">Optimum size & speed</span>
                                </div>
                            </SelectItem>
                            <SelectItem value="max">
                                <div className="flex flex-col items-start">
                                    <span className="font-medium">Maximum Compression</span>
                                    <span className="text-xs text-muted-foreground">Smallest size, slower</span>
                                </div>
                            </SelectItem>
                            <SelectItem value="fast">
                                <div className="flex flex-col items-start">
                                    <span className="font-medium">Fast Decode (Modern)</span>
                                    <span className="text-xs text-muted-foreground">Best for weak devices</span>
                                </div>
                            </SelectItem>
                            <SelectItem value="raw">
                                <div className="flex flex-col items-start">
                                    <span className="font-medium">Raw / Lossless</span>
                                    <span className="text-xs text-muted-foreground">Verify integrity only</span>
                                </div>
                            </SelectItem>
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </div>
        </div>
    )
}
