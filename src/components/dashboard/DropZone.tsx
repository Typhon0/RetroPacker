import React, { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQueueStore, Job } from '@/stores/useQueueStore';
import { usePackerStore } from '@/stores/usePackerStore';
import { ChdmanService } from '@/services/ChdmanService';
import { v4 as uuidv4 } from 'uuid';
import { open } from '@tauri-apps/plugin-dialog';
import { stat, readDir } from '@tauri-apps/plugin-fs';
import { FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { join } from '@tauri-apps/api/path';



export function DropZone() {
    const [isDragging, setIsDragging] = useState(false);
    const addJob = useQueueStore((state) => state.addJob);
    const { preset, jobMode } = usePackerStore();

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files);
        processFiles(files);
    }, [addJob, preset, jobMode]);

    const handleClick = useCallback(async () => {
        try {
            // Determine filter based on mode
            const extensions = (jobMode === 'create')
                ? ['iso', 'cue', 'gdi', 'toc']
                : ['chd'];

            const filterName = (jobMode === 'create')
                ? 'Disk Images'
                : 'CHD Files';

            const selected = await open({
                multiple: true,
                filters: [{
                    name: filterName,
                    extensions: extensions
                }]
            });

            if (selected) {
                const paths = Array.isArray(selected) ? selected : [selected];
                processPaths(paths);
            }
        } catch (err) {
            console.error('Failed to open file dialog', err);
        }
    }, [jobMode]);

    const processFiles = async (files: File[]) => {
        for (const file of files) {
            // @ts-ignore
            let filePath = file.path;

            if (!filePath) {
                // @ts-ignore
                const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
                if (!isTauri) {
                    console.log("[MOCK] Browser detected");
                    filePath = `/mock/${file.name}`;
                } else {
                    continue;
                }
            }

            await addJobFromPath(filePath, file.name, file.size);
        }
    };

    const processPaths = async (paths: string[]) => {
        for (const filePath of paths) {
            const name = filePath.split(/[\\/]/).pop() || 'unknown';
            let size = 0;
            try {
                const fileStat = await stat(filePath);
                size = fileStat.size;
            } catch (e) {
                console.warn(`Failed to stat file ${filePath}, assuming size 0`, e);
            }
            await addJobFromPath(filePath, name, size);
        }
    };

    const addJobFromPath = async (filePath: string, filename: string, size: number) => {
        const ext = filePath.split('.').pop()?.toLowerCase();

        // Validation per mode
        if (jobMode === 'create') {
            if (!ext || !['iso', 'cue', 'gdi', 'toc'].includes(ext)) return;
        } else {
            // Extract/Verify/Info expect .chd
            if (!ext || ext !== 'chd') return;
        }

        const strategy = ChdmanService.getStrategy(filePath);

        const job: Job = {
            id: uuidv4(),
            filename: filename,
            path: filePath,
            system: detectSystem(filename, ext),
            status: 'pending',
            progress: 0,
            originalSize: size,
            outputLog: [],
            strategy
        };

        addJob(job);
    };

    // Helper detection (could be moved to Service)
    const detectSystem = (filename: string, ext?: string) => {
        if (!ext) return 'Unknown';
        if (ext === 'chd') return 'CHD Image';
        if (ext === 'iso' && filename.toLowerCase().includes('ps2')) return 'PS2';
        if (ext === 'gdi') return 'Dreamcast';
        if (ext === 'iso') return 'PS2/PSP';
        return 'CD-Based';
    };

    const handleAddFolder = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const selected = await open({
                directory: true,
                multiple: true,
            });

            if (selected) {
                const paths = Array.isArray(selected) ? selected : [selected];
                await processFolders(paths);
            }
        } catch (err) {
            console.error('Failed to open directory dialog', err);
        }
    }, [jobMode]);

    const processFolders = async (folderPaths: string[]) => {
        const foundFiles: string[] = [];
        console.log("Processing folders:", folderPaths);

        // Simple recursive scan
        async function scanDir(path: string) {
            try {
                console.log("Scanning directory:", path);
                const entries = await readDir(path);
                for (const entry of entries) {
                    const entryPath = await join(path, entry.name);
                    if (entry.isDirectory) {
                        await scanDir(entryPath);
                    } else if (entry.isFile) {
                        console.log("Found file:", entryPath);
                        foundFiles.push(entryPath);
                    }
                }
            } catch (e) {
                console.warn(`Failed to read dir ${path}`, e);
            }
        }

        for (const dir of folderPaths) {
            await scanDir(dir);
        }

        console.log("Total found files:", foundFiles.length);
        await processPaths(foundFiles);
    };

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
            className={cn(
                "border-2 border-dashed rounded-xl p-6 transition-all duration-300 flex flex-col items-center justify-center text-center cursor-pointer relative group",
                isDragging
                    ? "border-primary bg-primary/10 scale-[1.02]"
                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/5"
            )}
        >
            <Upload className={cn("h-10 w-10 mb-3 transition-colors", isDragging ? "text-primary" : "text-muted-foreground")} />
            <h3 className="text-lg font-semibold mb-1">
                {jobMode === 'create' ? "Drag and Drop ROMs Here" : "Drag and Drop CHDs Here"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
                {jobMode === 'create'
                    ? "Supports .iso, .cue, .gdi"
                    : "Supports .chd only"}
                <br />
                <span className='font-bold uppercase text-xs'>{jobMode} MODE</span>
            </p>

            <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); handleClick(); }}>
                    Add Files
                </Button>
                <Button variant="secondary" size="sm" onClick={handleAddFolder}>
                    <FolderPlus className="h-4 w-4 mr-2" />
                    Add Folder
                </Button>
            </div>
        </div>
    );
}
