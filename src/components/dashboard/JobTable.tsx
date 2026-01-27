import { useState, useMemo } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { XCircle, PlayCircle, CheckCircle, AlertCircle, ChevronRight, ChevronDown, Folder, ChevronsUpDown, Filter, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChdmanService } from '@/services/ChdmanService';
import { dirname } from '@tauri-apps/api/path';
import { cn, formatDuration } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { useQueueStore, Job } from "@/stores/useQueueStore";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface JobTableProps {
    onSelectJob: (job: Job) => void;
    selectedJobId?: string;
}

// Tree node structure
interface TreeNode {
    name: string;
    path: string;
    jobs: Job[];
    children: Record<string, TreeNode>;
}

function findCommonPrefix(jobs: Job[]): string[] {
    if (jobs.length === 0) return [];

    const paths = jobs.map(job => {
        const normalized = job.path.replace(/\\/g, '/');
        const parts = normalized.split('/');
        parts.pop(); // Remove filename
        return parts.filter(p => p);
    });

    if (paths.length === 0) return [];

    const firstPath = paths[0];
    const commonParts: string[] = [];

    for (let i = 0; i < firstPath.length; i++) {
        const part = firstPath[i];
        if (paths.every(p => p[i] === part)) {
            commonParts.push(part);
        } else {
            break;
        }
    }

    return commonParts;
}

function buildTree(jobs: Job[]): TreeNode {
    const root: TreeNode = { name: 'Root', path: '', jobs: [], children: {} };

    // Find common prefix to skip
    const commonPrefix = findCommonPrefix(jobs);
    const skipDepth = commonPrefix.length;

    for (const job of jobs) {
        // Normalize path separators
        const normalizedPath = job.path.replace(/\\/g, '/');
        const allParts = normalizedPath.split('/').filter(p => p);
        allParts.pop(); // Remove filename

        // Skip common prefix parts
        const parts = allParts.slice(skipDepth);

        let current = root;
        let currentPath = commonPrefix.join('/');

        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;

            if (!current.children[part]) {
                current.children[part] = {
                    name: part,
                    path: currentPath,
                    jobs: [],
                    children: {}
                };
            }
            current = current.children[part];
        }

        current.jobs.push(job);
    }

    // If root has only one child and no direct jobs, collapse it
    const rootChildren = Object.keys(root.children);
    if (rootChildren.length === 1 && root.jobs.length === 0) {
        return root.children[rootChildren[0]];
    }

    return root;
}

function getAllPaths(node: TreeNode, paths: string[] = []): string[] {
    if (node.path) paths.push(node.path);
    for (const child of Object.values(node.children)) {
        getAllPaths(child, paths);
    }
    return paths;
}

export function JobTable({ onSelectJob, selectedJobId }: JobTableProps) {
    const queue = useQueueStore((state) => state.queue);
    const removeJob = useQueueStore((state) => state.removeJob);

    const handleStartJob = async (job: Job) => {
        try {
            const outputDir = await dirname(job.path);
            ChdmanService.runJob(job, outputDir);
        } catch (e) {
            console.error("Failed to start job", e);
        }
    };

    const handleStartFolder = async (node: TreeNode) => {
        const startPendingInNode = async (targetNode: TreeNode) => {
            // Start jobs in this node
            for (const job of targetNode.jobs) {
                if (job.status === 'pending' || job.status === 'failed') {
                    await handleStartJob(job);
                }
            }
            // Recursively start children
            for (const child of Object.values(targetNode.children)) {
                await startPendingInNode(child);
            }
        };
        await startPendingInNode(node);
    };


    // Filters
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [systemFilter, setSystemFilter] = useState<string>('all');

    // Filter jobs
    const filteredQueue = useMemo(() => {
        return queue.filter(job => {
            if (statusFilter !== 'all' && job.status !== statusFilter) return false;
            if (systemFilter !== 'all' && job.system !== systemFilter) return false;
            return true;
        });
    }, [queue, statusFilter, systemFilter]);

    // Get unique systems for filter
    const uniqueSystems = useMemo(() => {
        const systems = new Set(queue.map(j => j.system));
        return Array.from(systems).sort();
    }, [queue]);

    // Build tree from filtered jobs
    const tree = useMemo(() => buildTree(filteredQueue), [filteredQueue]);

    // Expanded state
    const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});

    const togglePath = (path: string) => {
        setExpandedPaths(prev => ({
            ...prev,
            [path]: !(prev[path] ?? true) // Default expanded
        }));
    };

    const collapseAll = () => {
        const allPaths = getAllPaths(tree);
        const collapsed: Record<string, boolean> = {};
        allPaths.forEach(p => collapsed[p] = false);
        setExpandedPaths(collapsed);
    };

    const expandAll = () => {
        const allPaths = getAllPaths(tree);
        const expanded: Record<string, boolean> = {};
        allPaths.forEach(p => expanded[p] = true);
        setExpandedPaths(expanded);
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
            case 'processing': return <PlayCircle className="h-4 w-4 text-blue-500 animate-pulse" />;
            case 'failed': return <AlertCircle className="h-4 w-4 text-red-500" />;
            default: return <div className="h-4 w-4 rounded-full border-2 border-muted" />;
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes <= 0) return "Unknown";
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(2)} ${units[unitIndex]}`;
    };

    // Recursive render function
    const renderNode = (node: TreeNode, depth: number = 0): React.ReactNode[] => {
        const result: React.ReactNode[] = [];
        const isExpanded = expandedPaths[node.path] ?? true;
        const hasContent = node.jobs.length > 0 || Object.keys(node.children).length > 0;

        // Render folder row (skip root)
        if (node.path && hasContent) {
            const totalItems = countItems(node);
            const pendingInFolder = countPending(node);
            result.push(
                <TableRow
                    key={`folder-${node.path}`}
                    className="bg-muted/30 cursor-pointer hover:bg-muted/50 group"
                    onClick={() => togglePath(node.path)}
                >
                    <TableCell className="py-2" style={{ paddingLeft: `${depth * 16 + 8}px` }}>
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </TableCell>
                    <TableCell colSpan={5} className="py-2">
                        <div className="flex items-center gap-2">
                            <Folder className="h-4 w-4 text-blue-400" />
                            <span className="font-medium">{node.name}</span>
                            <span className="text-muted-foreground text-xs">({totalItems} items)</span>
                        </div>
                    </TableCell>
                    <TableCell className="text-right py-2">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {pendingInFolder > 0 && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-green-500"
                                            onClick={(e) => { e.stopPropagation(); handleStartFolder(node); }}
                                        >
                                            <Play className="h-3.5 w-3.5" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Start all jobs in folder</TooltipContent>
                                </Tooltip>
                            )}
                        </div>
                    </TableCell>
                </TableRow>
            );
        }

        // If expanded, render children and jobs
        if (isExpanded || !node.path) {
            // Child folders first (sorted)
            const childKeys = Object.keys(node.children).sort();
            for (const key of childKeys) {
                result.push(...renderNode(node.children[key], node.path ? depth + 1 : depth));
            }

            // Then jobs
            for (const job of node.jobs) {
                result.push(
                    <TableRow
                        key={job.id}
                        className={cn(
                            "cursor-pointer hover:bg-muted/10 group",
                            selectedJobId === job.id && "bg-muted/50"
                        )}
                        onClick={() => onSelectJob(job)}
                    >
                        <TableCell style={{ paddingLeft: `${(node.path ? depth + 1 : depth) * 16 + 8}px` }}>
                            {getStatusIcon(job.status)}
                        </TableCell>
                        <TableCell className="font-medium truncate max-w-[200px]">
                            {job.filename}
                        </TableCell>
                        <TableCell>
                            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-secondary text-secondary-foreground">
                                {job.system}
                            </span>
                        </TableCell>
                        <TableCell className="w-[25%]">
                            <div className="flex flex-col gap-1">
                                <Progress value={job.progress} className="h-2" />
                                {job.status === 'processing' && (
                                    <span className="text-xs text-muted-foreground">{job.progress.toFixed(1)}%</span>
                                )}
                            </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                            {job.etaSeconds !== undefined && job.status === 'processing'
                                ? formatDuration(job.etaSeconds)
                                : '-'
                            }
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono">
                            {formatSize(job.originalSize)}
                        </TableCell>
                        <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                                {(job.status === 'pending' || job.status === 'failed') && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-green-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleStartJob(job);
                                                }}
                                            >
                                                <Play className="h-4 w-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Start job</TooltipContent>
                                    </Tooltip>
                                )}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeJob(job.id);
                                            }}
                                        >
                                            <XCircle className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Remove job</TooltipContent>
                                </Tooltip>
                            </div>
                        </TableCell>
                    </TableRow>
                );
            }
        }

        return result;
    };

    const countItems = (node: TreeNode): number => {
        let count = node.jobs.length;
        for (const child of Object.values(node.children)) {
            count += countItems(child);
        }
        return count;
    };

    const countPending = (node: TreeNode): number => {
        let count = node.jobs.filter(j => j.status === 'pending' || j.status === 'failed').length;
        for (const child of Object.values(node.children)) {
            count += countPending(child);
        }
        return count;
    };

    return (
        <div className="space-y-2">
            {/* Filter Bar */}
            <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[130px] h-8">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="processing">Processing</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={systemFilter} onValueChange={setSystemFilter}>
                        <SelectTrigger className="w-[130px] h-8">
                            <SelectValue placeholder="System" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Systems</SelectItem>
                            {uniqueSystems.map(sys => (
                                <SelectItem key={sys} value={sys}>{sys}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center gap-1 ml-auto">
                    <Button variant="outline" size="sm" onClick={expandAll}>
                        <ChevronsUpDown className="h-4 w-4 mr-1" />
                        Expand All
                    </Button>
                    <Button variant="outline" size="sm" onClick={collapseAll}>
                        <ChevronsUpDown className="h-4 w-4 mr-1" />
                        Collapse All
                    </Button>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-md border bg-card overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[40px]"></TableHead>
                            <TableHead>Game / Folder</TableHead>
                            <TableHead>System</TableHead>
                            <TableHead>Progress</TableHead>
                            <TableHead>ETA</TableHead>
                            <TableHead className="text-right">Size</TableHead>
                            <TableHead className="w-[60px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredQueue.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                    {queue.length === 0 ? "No jobs in queue." : "No jobs match filter."}
                                </TableCell>
                            </TableRow>
                        ) : (
                            renderNode(tree)
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
