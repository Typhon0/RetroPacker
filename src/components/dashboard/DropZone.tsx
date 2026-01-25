import React, { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQueueStore, Job } from '@/stores/useQueueStore';
import { usePackerStore } from '@/stores/usePackerStore';
import { ChdmanService } from '@/services/ChdmanService';
import { v4 as uuidv4 } from 'uuid';

export function DropZone() {
    const [isDragging, setIsDragging] = useState(false);
    const addJob = useQueueStore((state) => state.addJob);
    const { preset } = usePackerStore();

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

        files.forEach((file) => {
            // In Tauri, File object usually has a 'path' property if dropped from OS
            // or we might need to rely on the file system access API.
            // Assuming 'path' exists on the File object in Tauri webview.
            let filePath = (file as any).path;

            if (!filePath) {
                // MOCK MODE: Generate fake path for browser
                // @ts-ignore
                const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

                if (!isTauri) {
                    console.log("[MOCK] Browser detected, using filename as path");
                    filePath = `/mock/path/to/${file.name}`;
                } else {
                    console.warn("No file path detected. Are you running in Tauri?");
                    return;
                }
            }

            // Filter logic: Only .iso, .cue, .gdi, .toc
            const ext = filePath.split('.').pop()?.toLowerCase();
            if (!['iso', 'cue', 'gdi', 'toc'].includes(ext)) {
                return;
            }

            const strategy = ChdmanService.getStrategy(filePath);

            const job: Job = {
                id: uuidv4(),
                filename: file.name,
                path: filePath,
                system: detectSystem(file.name, ext), // Heuristic or generic
                status: 'pending',
                progress: 0,
                originalSize: file.size,
                outputLog: [],
                strategy
            };

            addJob(job);
        });
    }, [addJob, preset]);

    // Helper detection (could be moved to Service)
    const detectSystem = (filename: string, ext: string) => {
        if (ext === 'iso' && filename.toLowerCase().includes('ps2')) return 'PS2'; // Very weak heuristic
        if (ext === 'gdi') return 'Dreamcast';
        if (ext === 'iso') return 'PS2/PSP'; // Default for ISO
        return 'CD-Based';
    };

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
                "border-2 border-dashed rounded-xl p-10 transition-all duration-300 flex flex-col items-center justify-center text-center cursor-default",
                isDragging
                    ? "border-primary bg-primary/10 scale-[1.02]"
                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/5"
            )}
        >
            <Upload className={cn("h-12 w-12 mb-4 transition-colors", isDragging ? "text-primary" : "text-muted-foreground")} />
            <h3 className="text-lg font-semibold mb-2">Drag and Drop ROMs Here</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
                Supports .iso (PS2/PSP), .cue (PS1/Saturn), .gdi (Dreamcast).
                <br />
                Batch processing supported.
            </p>
        </div>
    );
}
