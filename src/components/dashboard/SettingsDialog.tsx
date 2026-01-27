
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { usePackerStore, CompressionPreset } from "@/stores/usePackerStore";

export function SettingsDialog() {
    const {
        preset, setPreset,
        customCompression, setCustomCompression,
        hunkSize, setHunkSize,
        jobMode, setJobMode,
        mediaType, setMediaType
    } = usePackerStore();

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="icon">
                    <Settings className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Advanced Settings</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-4">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">Job Mode</label>
                        <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={jobMode}
                            // @ts-ignore
                            onChange={(e) => setJobMode(e.target.value)}
                        >
                            <option value="create">Create CHD (Compress)</option>
                            <option value="extract">Extract CHD (Decompress)</option>
                            <option value="verify">Verify CHD</option>
                            <option value="info">Get Info</option>
                        </select>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">Media Type Override</label>
                        <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={mediaType}
                            // @ts-ignore
                            onChange={(e) => setMediaType(e.target.value)}
                        >
                            <option value="auto">Auto-Detect</option>
                            <option value="cd">CD (createcd)</option>
                            <option value="dvd">DVD (createdvd)</option>
                            <option value="hdd">HDD (createhd)</option>
                            <option value="ld">LaserDisc (createld)</option>
                            <option value="raw">Raw (createraw)</option>
                        </select>
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">Compression Preset</label>
                        <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={preset}
                            onChange={(e) => setPreset(e.target.value as CompressionPreset)}
                        >
                            <option value="balanced">Balanced (lzma,zlib,huff)</option>
                            <option value="max">Max Compression (lzma)</option>
                            <option value="fast">Fast Decode (zstd)</option>
                            <option value="raw">Raw (none)</option>
                            <option value="custom">Custom</option>
                        </select>
                    </div>

                    {preset === 'custom' && (
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium">Custom Compression</label>
                            <input
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={customCompression}
                                onChange={(e) => setCustomCompression(e.target.value)}
                                placeholder="e.g. lzma,zlib,huff"
                            />
                            <span className="text-xs text-muted-foreground">Comma separated codecs (lzma, zlib, huff, flac, zstd, none)</span>
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">Hunk Size Override (bytes)</label>
                        <input
                            type="number"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={hunkSize || ''}
                            onChange={(e) => {
                                const val = e.target.value ? parseInt(e.target.value) : undefined;
                                setHunkSize(val);
                            }}
                            placeholder="Default (Auto)"
                        />
                        <span className="text-xs text-muted-foreground">Leave empty to use automatic defaults (DVD: 2048, CD: 18816/varies)</span>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
