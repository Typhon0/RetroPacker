import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { useQueueStore, Job } from "@/stores/useQueueStore";
import { cn } from "@/lib/utils";
import { XCircle, PlayCircle, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface JobTableProps {
    onSelectJob: (job: Job) => void;
    selectedJobId?: string;
}

export function JobTable({ onSelectJob, selectedJobId }: JobTableProps) {
    const queue = useQueueStore((state) => state.queue);
    const removeJob = useQueueStore((state) => state.removeJob);

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
            case 'processing': return <PlayCircle className="h-4 w-4 text-blue-500 animate-pulse" />;
            case 'failed': return <AlertCircle className="h-4 w-4 text-red-500" />;
            default: return <div className="h-4 w-4 rounded-full border-2 border-muted" />;
        }
    };

    const formatSize = (bytes: number) => {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(2)} ${units[unitIndex]}`;
    };

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[30px]"></TableHead>
                        <TableHead>Game</TableHead>
                        <TableHead>System</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead className="text-right">Size</TableHead>
                        <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {queue.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                No jobs in queue.
                            </TableCell>
                        </TableRow>
                    ) : (
                        queue.map((job) => (
                            <TableRow
                                key={job.id}
                                className={cn(
                                    "cursor-pointer",
                                    selectedJobId === job.id && "bg-muted/50"
                                )}
                                onClick={() => onSelectJob(job)}
                            >
                                <TableCell>{getStatusIcon(job.status)}</TableCell>
                                <TableCell className="font-medium truncate max-w-[200px]">
                                    {job.filename}
                                </TableCell>
                                <TableCell>
                                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors border-transparent bg-secondary text-secondary-foreground">
                                        {job.system}
                                    </span>
                                </TableCell>
                                <TableCell className="w-[30%]">
                                    <div className="flex flex-col gap-1">
                                        <Progress value={job.progress} className="h-2" />
                                        {job.status === 'processing' && (
                                            <span className="text-xs text-muted-foreground">{job.progress.toFixed(1)}%</span>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right text-xs font-mono">
                                    {formatSize(job.originalSize)}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeJob(job.id);
                                        }}
                                    >
                                        <XCircle className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
