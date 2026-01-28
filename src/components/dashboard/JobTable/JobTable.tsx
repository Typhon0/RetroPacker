/**
 * JobTable - Main Table Component for Job Queue Display
 *
 * Refactored to use extracted components following Single Responsibility Principle.
 * Uses Clean Architecture hooks for job operations.
 *
 * @module components/dashboard/JobTable/JobTable
 */

import { useState, useMemo, useCallback } from "react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ChevronsUpDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useQueueStore } from "@/stores/useQueueStore";
import type { Job, WorkflowType } from "@/stores/useQueueStore";
import { useRepositories } from "@/presentation/context/RepositoryContext";
import { ProcessJobUseCase } from "@/domain/usecases/ProcessJobUseCase";
import { usePackerStore } from "@/stores/usePackerStore";
import { useShallow } from "zustand/react/shallow";

import type { TreeNode } from "./JobTreeBuilder";
import { buildTree, getAllPaths, findNode } from "./JobTreeBuilder";
import { FolderRow } from "./FolderRow";
import { JobRow } from "./JobRow";

interface JobTableProps {
	workflow: WorkflowType;
	onSelectJob?: (job: Job) => void;
	selectedJobId?: string;
}

export function JobTable({
	workflow,
	onSelectJob,
	selectedJobId,
}: JobTableProps) {
	const queue = useQueueStore((state) => state.queues[workflow]);
	const removeJob = useQueueStore((state) => state.removeJob);
	const updateJob = useQueueStore((state) => state.updateJob);

	// Clean Architecture: Get repositories
	const repositories = useRepositories();
	// Use useShallow to avoid creating new object references on every render
	const settings = usePackerStore(
		useShallow((state) => ({
			preset: state.preset,
			customCompression: state.customCompression,
			chd: state.chd,
			dolphin: state.dolphin,
		})),
	);

	// Memoized use case
	const processJobUseCase = useMemo(
		() => new ProcessJobUseCase(repositories),
		[repositories],
	);

	const handleStartJob = useCallback(
		async (job: Job) => {
			try {
				const outputDir = await repositories.fileSystem.dirname(job.path);
				await processJobUseCase.execute(job, outputDir, workflow, settings);
			} catch (e) {
				console.error("Failed to start job", e);
			}
		},
		[processJobUseCase, repositories.fileSystem, workflow, settings],
	);

	const handleStartFolder = useCallback(
		async (node: TreeNode) => {
			const startPendingInNode = async (targetNode: TreeNode) => {
				for (const job of targetNode.jobs) {
					if (job.status === "pending" || job.status === "failed") {
						await handleStartJob(job);
					}
				}
				for (const child of Object.values(targetNode.children)) {
					await startPendingInNode(child);
				}
			};
			await startPendingInNode(node);
		},
		[handleStartJob],
	);

	// Filters
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [systemFilter, setSystemFilter] = useState<string>("all");

	// Filter jobs
	const filteredQueue = useMemo(() => {
		return queue.filter((job) => {
			if (statusFilter !== "all" && job.status !== statusFilter) return false;
			if (systemFilter !== "all" && job.system !== systemFilter) return false;
			return true;
		});
	}, [queue, statusFilter, systemFilter]);

	// Get unique systems for filter
	const uniqueSystems = useMemo(() => {
		const systems = new Set(queue.map((j) => j.system));
		return Array.from(systems).sort();
	}, [queue]);

	// Build tree from filtered jobs
	const tree = useMemo(() => buildTree(filteredQueue), [filteredQueue]);

	// Expanded state
	const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>(
		{},
	);

	// Folder-level platform overrides (path -> platform)
	const [folderOverrides, setFolderOverrides] = useState<
		Record<string, Job["platformOverride"]>
	>({});

	const setFolderPlatform = useCallback(
		(path: string, platform: Job["platformOverride"]) => {
			setFolderOverrides((prev) => ({ ...prev, [path]: platform }));

			// Apply to all jobs in this folder
			const applyToNode = (node: TreeNode) => {
				node.jobs.forEach((job) => {
					if (job.status === "pending") {
						updateJob(workflow, job.id, { platformOverride: platform });
					}
				});
				Object.values(node.children).forEach(applyToNode);
			};

			const targetNode = findNode(tree, path);
			if (targetNode) applyToNode(targetNode);
		},
		[tree, updateJob, workflow],
	);

	// Check if a job is under a folder with an override
	const getFolderOverrideForJob = useCallback(
		(jobPath: string): Job["platformOverride"] | undefined => {
			const normalizedJobPath = jobPath.replace(/\\/g, "/");
			for (const [folderPath, override] of Object.entries(folderOverrides)) {
				if (
					normalizedJobPath.startsWith(folderPath.replace(/\\/g, "/") + "/")
				) {
					return override;
				}
			}
			return undefined;
		},
		[folderOverrides],
	);

	const togglePath = useCallback((path: string) => {
		setExpandedPaths((prev) => ({
			...prev,
			[path]: !(prev[path] ?? true),
		}));
	}, []);

	const collapseAll = useCallback(() => {
		const allPaths = getAllPaths(tree);
		const collapsed: Record<string, boolean> = {};
		for (const p of allPaths) {
			collapsed[p] = false;
		}
		setExpandedPaths(collapsed);
	}, [tree]);

	const expandAll = useCallback(() => {
		const allPaths = getAllPaths(tree);
		const expanded: Record<string, boolean> = {};
		for (const p of allPaths) {
			expanded[p] = true;
		}
		setExpandedPaths(expanded);
	}, [tree]);

	// Recursive render function using extracted components
	const renderNode = useCallback(
		(node: TreeNode, depth: number = 0): React.ReactNode[] => {
			const result: React.ReactNode[] = [];
			const isExpanded = expandedPaths[node.path] ?? true;
			const hasContent =
				node.jobs.length > 0 || Object.keys(node.children).length > 0;

			// Render folder row (skip root)
			if (node.path && hasContent) {
				result.push(
					<FolderRow
						key={`folder-${node.path}`}
						node={node}
						depth={depth}
						isExpanded={isExpanded}
						folderOverride={folderOverrides[node.path]}
						onToggle={() => togglePath(node.path)}
						onStartFolder={() => handleStartFolder(node)}
						onSetPlatform={(platform) => setFolderPlatform(node.path, platform)}
					/>,
				);
			}

			// If expanded, render children and jobs
			if (isExpanded || !node.path) {
				const childKeys = Object.keys(node.children).sort();
				for (const key of childKeys) {
					result.push(
						...renderNode(node.children[key], node.path ? depth + 1 : depth),
					);
				}

				for (const job of node.jobs) {
					const jobDepth = node.path ? depth + 1 : depth;
					result.push(
						<JobRow
							key={job.id}
							job={job}
							workflow={workflow}
							depth={jobDepth}
							isSelected={selectedJobId === job.id}
							folderOverride={getFolderOverrideForJob(job.path)}
							onSelect={() => onSelectJob?.(job)}
							onStart={() => handleStartJob(job)}
							onRemove={() => removeJob(workflow, job.id)}
							onUpdatePlatform={(platform) => {
								updateJob(workflow, job.id, {
									platformOverride: platform,
									system: platform
										? platform.charAt(0).toUpperCase() + platform.slice(1)
										: job.system,
								});
							}}
						/>,
					);
				}
			}

			return result;
		},
		[
			expandedPaths,
			folderOverrides,
			handleStartFolder,
			handleStartJob,
			getFolderOverrideForJob,
			onSelectJob,
			removeJob,
			selectedJobId,
			setFolderPlatform,
			togglePath,
			updateJob,
			workflow,
		],
	);

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
							{uniqueSystems.map((sys) => (
								<SelectItem key={sys} value={sys}>
									{sys}
								</SelectItem>
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
								<TableCell
									colSpan={7}
									className="h-24 text-center text-muted-foreground"
								>
									{queue.length === 0
										? "No jobs in queue."
										: "No jobs match filter."}
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
