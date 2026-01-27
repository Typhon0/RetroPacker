import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Settings, Cpu } from "lucide-react";
import { usePackerStore, CompressionPreset, JobMode, MediaType } from "@/stores/usePackerStore";

export function SettingsToolbar() {
    const {
        preset, setPreset,
        customCompression, setCustomCompression,
        hunkSize, setHunkSize,
        jobMode, setJobMode,
        mediaType, setMediaType
    } = usePackerStore();

    return (
        <div className="flex items-center gap-2 bg-card border rounded-md p-1 shadow-sm h-10">
            {/* Job Mode Selector */}
            <Select value={jobMode} onValueChange={(val) => setJobMode(val as JobMode)}>
                <SelectTrigger className="h-8 border-none bg-transparent hover:bg-muted/50 focus:ring-0 w-[140px] font-medium">
                    <SelectValue placeholder="Mode" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="create">Create CHD</SelectItem>
                    <SelectItem value="extract">Extract CHD</SelectItem>
                    <SelectItem value="verify">Verify CHD</SelectItem>
                    <SelectItem value="info">Get Info</SelectItem>
                </SelectContent>
            </Select>

            <div className="w-[1px] h-4 bg-border mx-1" />

            {/* Media Type Selector */}
            <Select value={mediaType} onValueChange={(val) => setMediaType(val as MediaType)}>
                <SelectTrigger className="h-8 border-none bg-transparent hover:bg-muted/50 focus:ring-0 w-[130px] text-muted-foreground data-[state=open]:text-foreground">
                    <SelectValue placeholder="Media Type" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="auto">Auto-Detect</SelectItem>
                    <SelectItem value="cd">CD</SelectItem>
                    <SelectItem value="dvd">DVD</SelectItem>
                    <SelectItem value="hdd">HDD</SelectItem>
                    <SelectItem value="ld">LaserDisc</SelectItem>
                    <SelectItem value="raw">Raw</SelectItem>
                </SelectContent>
            </Select>

            <div className="w-[1px] h-4 bg-border mx-1" />

            {/* Preset Selector */}
            <Select value={preset} onValueChange={(val) => setPreset(val as CompressionPreset)}>
                <SelectTrigger className="h-8 border-none bg-transparent hover:bg-muted/50 focus:ring-0 w-[140px] text-muted-foreground data-[state=open]:text-foreground">
                    <div className="flex items-center gap-2">
                        <Cpu className="h-3 w-3" />
                        <span className="truncate">
                            {
                                preset === 'balanced' ? 'Balanced' :
                                    preset === 'max' ? 'Max Compression' :
                                        preset === 'fast' ? 'Fast Use' :
                                            preset === 'raw' ? 'Uncompressed' :
                                                'Custom'
                            }
                        </span>
                    </div>
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="balanced">
                        <div className="flex flex-col items-start">
                            <span>Balanced</span>
                            <span className="text-[10px] text-muted-foreground">Normal (lzma,zlib,huff)</span>
                        </div>
                    </SelectItem>
                    <SelectItem value="max">
                        <div className="flex flex-col items-start">
                            <span>Max Compression</span>
                            <span className="text-[10px] text-muted-foreground">Slowest, best ratio (lzma)</span>
                        </div>
                    </SelectItem>
                    <SelectItem value="fast">
                        <div className="flex flex-col items-start">
                            <span>Fast Use</span>
                            <span className="text-[10px] text-muted-foreground">Quickest (zstd)</span>
                        </div>
                    </SelectItem>
                    <SelectItem value="raw">
                        <div className="flex flex-col items-start">
                            <span>Uncompressed</span>
                            <span className="text-[10px] text-muted-foreground">Store only (none)</span>
                        </div>
                    </SelectItem>
                    <SelectItem value="custom">
                        <div className="flex flex-col items-start">
                            <span>Custom</span>
                            <span className="text-[10px] text-muted-foreground">User-defined codecs</span>
                        </div>
                    </SelectItem>
                </SelectContent>
            </Select>

            {/* Advanced Settings Popover */}
            <Popover>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 ml-1 text-muted-foreground hover:text-foreground">
                                <Settings className="h-4 w-4" />
                            </Button>
                        </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end">Advanced Settings</TooltipContent>
                </Tooltip>
                <PopoverContent className="w-80 p-4" align="end">
                    <div className="flex flex-col gap-4">
                        <div className="space-y-2">
                            <h4 className="font-medium leading-none">Advanced Configuration</h4>
                            <p className="text-sm text-muted-foreground">Fine-tune compression parameters.</p>
                        </div>

                        {preset === 'custom' && (
                            <div className="grid gap-2">
                                <label className="text-sm font-medium">Custom Codecs</label>
                                <input
                                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                    value={customCompression}
                                    onChange={(e) => setCustomCompression(e.target.value)}
                                    placeholder="e.g. lzma,zlib,huff"
                                />
                                <span className="text-[10px] text-muted-foreground">Comma-separated: lzma, zlib, huff, flac, zstd, none</span>
                            </div>
                        )}

                        <div className="grid gap-2">
                            <label className="text-sm font-medium">Hunk Size Override</label>
                            <input
                                type="number"
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                value={hunkSize || ''}
                                onChange={(e) => {
                                    const val = e.target.value ? parseInt(e.target.value) : undefined;
                                    setHunkSize(val);
                                }}
                                placeholder="Auto"
                            />
                            <span className="text-[10px] text-muted-foreground">Bytes (e.g. 2048 for DVD)</span>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}
