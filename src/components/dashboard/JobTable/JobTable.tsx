/**
 * JobTable - Main Table Component for Job Queue Display
 *
 * @module components/dashboard/JobTable/JobTable
 */

import { type ReactNode, useState, useMemo, useCallback } from "react";
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
import type { WorkflowType } from "@/stores/useQueueStore";
import { ProcessRegistry } from "@/services/ProcessRegistry";
import type { JobState } from "@/domain/entities/JobState";
import type { Platform } from "@/domain/types/platform.types";
import { jobStore } from "@/stores/JobStore";
import { useSignalValue } from "@/hooks/useSignalValue";

import type { TreeJob, TreeNode } from "./JobTreeBuilder";
import { buildTree, getAllPaths, findNode } from "./JobTreeBuilder";
import { FolderRow } from "./FolderRow";
import { JobRow } from "./JobRow";

interface JobTableProps {
	workflow: WorkflowType;
	onSelectJob?: (job: JobState) => void;
	selectedJobId?: string;
}

interface JobRuntimeSnapshot {
	status: "pending" | "processing" | "completed" | "failed";
	system: string;
	platformOverride: Platform | undefined;
}

interface FolderStats {
	totalItems: number;
	pendingInFolder: number;
	isProcessing: boolean;
	inferredPlatform?: Platform;
}

export function JobTable({ workflow, onSelectJob, selectedJobId }: JobTableProps) {
	const queue = useSignalValue(jobStore.queues[workflow]);
	const jobRuntimeById = useSignalValue(jobStore.runtimeByWorkflow[workflow]) as Record<
		string,
		JobRuntimeSnapshot
	>;
	const removeJob = useQueueStore((state) => state.removeJob);
	const updateJob = useQueueStore((state) => state.updateJob);
	const requestStart = useQueueStore((state) => state.requestStart);

	const jobsById = useMemo(() => {
		const map = new Map<string, JobState>();
		for (const job of queue) {
			map.set(job.id, job);
		}
		return map;
	}, [queue]);

	const treeJobs = useMemo((): TreeJob[] => {
		return queue.map((job) => ({ id: job.id, path: job.path }));
	}, [queue]);

	const handleStartJobById = useCallback(
		(jobId: string) => {
			const job = jobStore.getJob(workflow, jobId);
			if (!job) return;

			const status = job.status.value;
			if (status !== "pending" && status !== "failed") {
				return;
			}

			if (status === "failed") {
				updateJob(workflow, job.id, {
					status: "pending",
					progress: 0,
					errorMessage: undefined,
					etaSeconds: undefined,
					startTime: undefined,
					outputLog: [],
				});
			}

			ProcessRegistry.clearWorkflowCancellation(workflow);
			requestStart(workflow, job.id);
		},
		[requestStart, updateJob, workflow],
	);

	const handleRemoveJobById = useCallback(
		async (jobId: string) => {
			const job = jobStore.getJob(workflow, jobId);
			if (!job) return;

			if (job.status.value === "processing") {
				try {
					await ProcessRegistry.cancel(workflow, job.id);
				} catch (e) {
					console.warn("Failed to cancel job process", e);
				}
			}
			removeJob(workflow, job.id);
		},
		[removeJob, workflow],
	);

	const handleSelectJobById = useCallback(
		(jobId: string) => {
			const job = jobStore.getJob(workflow, jobId);
			if (job) onSelectJob?.(job);
		},
		[onSelectJob, workflow],
	);

	const handleUpdatePlatformById = useCallback(
		(jobId: string, platform: Platform | undefined) => {
			updateJob(workflow, jobId, {
				platformOverride: platform,
				system: platform
					? platform.charAt(0).toUpperCase() + platform.slice(1)
					: undefined,
			});
		},
		[updateJob, workflow],
	);

	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [systemFilter, setSystemFilter] = useState<string>("all");
	const [folderFilter, setFolderFilter] = useState<string>("all");

	const filteredJobIds = useMemo(() => {
		const result = new Set<string>();
		for (const [jobId, runtime] of Object.entries(jobRuntimeById)) {
			if (statusFilter !== "all" && runtime.status !== statusFilter) {
				continue;
			}
			if (systemFilter !== "all" && runtime.system !== systemFilter) {
				continue;
			}
			result.add(jobId);
		}
		return result;
	}, [jobRuntimeById, statusFilter, systemFilter]);

	const handleStartFolder = useCallback(
		(node: TreeNode) => {
			const idsToStart: string[] = [];
			const collectPendingInNode = (targetNode: TreeNode) => {
				for (const treeJob of targetNode.jobs) {
					if (!filteredJobIds.has(treeJob.id)) {
						continue;
					}

					const runtime = jobRuntimeById[treeJob.id];
					if (!runtime) {
						continue;
					}

					if (runtime.status === "pending" || runtime.status === "failed") {
						if (runtime.status === "failed") {
							updateJob(workflow, treeJob.id, {
								status: "pending",
								progress: 0,
								errorMessage: undefined,
								etaSeconds: undefined,
								startTime: undefined,
								outputLog: [],
							});
						}
						idsToStart.push(treeJob.id);
					}
				}
				for (const child of Object.values(targetNode.children)) {
					collectPendingInNode(child);
				}
			};

			collectPendingInNode(node);
			if (idsToStart.length === 0) return;

			ProcessRegistry.clearWorkflowCancellation(workflow);
			for (const jobId of idsToStart) {
				requestStart(workflow, jobId);
			}
		},
		[filteredJobIds, jobRuntimeById, requestStart, updateJob, workflow],
	);

	const uniqueSystems = useMemo(() => {
		const systems = new Set(
			Object.values(jobRuntimeById).map((runtime) => runtime.system),
		);
		return Array.from(systems).sort();
	}, [jobRuntimeById]);

	const tree = useMemo(() => buildTree(treeJobs), [treeJobs]);

	const visibleNodeByPath = useMemo(() => {
		const visibility = new Map<string, boolean>();

		const visit = (node: TreeNode): boolean => {
			let hasVisibleJobs = node.jobs.some((job) => filteredJobIds.has(job.id));

			for (const child of Object.values(node.children)) {
				if (visit(child)) {
					hasVisibleJobs = true;
				}
			}

			visibility.set(node.path, hasVisibleJobs);
			return hasVisibleJobs;
		};

		visit(tree);
		return visibility;
	}, [filteredJobIds, tree]);

	const folderStatsByPath = useMemo(() => {
		const stats = new Map<string, FolderStats>();
		const normalizePlatform = (
			runtime: JobRuntimeSnapshot,
		): Platform | undefined => {
			if (runtime.platformOverride && runtime.platformOverride !== "auto") {
				return runtime.platformOverride;
			}
			const system = runtime.system.toLowerCase();
			if (
				[
					"ps1",
					"ps2",
					"psp",
					"saturn",
					"dreamcast",
					"gamecube",
					"wii",
				].includes(system)
			) {
				return system as Platform;
			}
			return undefined;
		};

		const visit = (
			node: TreeNode,
		): {
			totalItems: number;
			pendingInFolder: number;
			isProcessing: boolean;
			platforms: Set<Platform>;
		} => {
			let totalItems = 0;
			let pendingInFolder = 0;
			let isProcessing = false;
			const platforms = new Set<Platform>();

			for (const treeJob of node.jobs) {
				if (!filteredJobIds.has(treeJob.id)) {
					continue;
				}

				totalItems += 1;
				const runtime = jobRuntimeById[treeJob.id];
				if (!runtime) continue;
				if (runtime.status === "pending" || runtime.status === "failed") {
					pendingInFolder += 1;
				}
				if (runtime.status === "processing") {
					isProcessing = true;
				}
				const platform = normalizePlatform(runtime);
				if (platform) {
					platforms.add(platform);
				}
			}

			for (const child of Object.values(node.children)) {
				const childStats = visit(child);
				totalItems += childStats.totalItems;
				pendingInFolder += childStats.pendingInFolder;
				isProcessing = isProcessing || childStats.isProcessing;
				childStats.platforms.forEach((platform) => {
					platforms.add(platform);
				});
			}

			stats.set(node.path, {
				totalItems,
				pendingInFolder,
				isProcessing,
				inferredPlatform:
					platforms.size === 1 ? Array.from(platforms)[0] : undefined,
			});

			return {
				totalItems,
				pendingInFolder,
				isProcessing,
				platforms,
			};
		};

		visit(tree);
		return stats;
	}, [filteredJobIds, jobRuntimeById, tree]);

	const topLevelFolders = useMemo(() => {
		if (!tree.path) {
			return Object.values(tree.children);
		}
		return [tree];
	}, [tree]);

	const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
	const [folderOverrides, setFolderOverrides] = useState<
		Record<string, Platform | undefined>
	>({});

	const setFolderPlatform = useCallback(
		(path: string, platform: Platform | undefined) => {
			setFolderOverrides((prev) => ({ ...prev, [path]: platform }));

			const applyToNode = (node: TreeNode) => {
				node.jobs.forEach((job) => {
					if (!filteredJobIds.has(job.id)) {
						return;
					}

					const runtime = jobRuntimeById[job.id];
					if (runtime?.status === "pending") {
						updateJob(workflow, job.id, { platformOverride: platform });
					}
				});
				Object.values(node.children).forEach(applyToNode);
			};

			const targetNode = findNode(tree, path);
			if (targetNode) applyToNode(targetNode);
		},
		[filteredJobIds, jobRuntimeById, tree, updateJob, workflow],
	);

	const getFolderOverrideForJob = useCallback(
		(jobPath: string): Platform | undefined => {
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

	const handleRemoveFolder = useCallback(
		async (node: TreeNode) => {
			const jobsToRemove: TreeJob[] = [];

			const collectJobs = (n: TreeNode) => {
				jobsToRemove.push(...n.jobs);
				Object.values(n.children).forEach(collectJobs);
			};

			collectJobs(node);

			for (const treeJob of jobsToRemove) {
				if (!filteredJobIds.has(treeJob.id)) {
					continue;
				}

				const runtime = jobRuntimeById[treeJob.id];
				if (runtime?.status === "processing") {
					try {
						await ProcessRegistry.cancel(workflow, treeJob.id);
					} catch (e) {
						console.warn(`Failed to cancel job ${treeJob.id}`, e);
					}
				}

				removeJob(workflow, treeJob.id);
			}
		},
		[filteredJobIds, jobRuntimeById, workflow, removeJob],
	);

	const renderNode = useCallback(
		(node: TreeNode, depth: number = 0): ReactNode[] => {
			const result: ReactNode[] = [];
			const isExpanded = expandedPaths[node.path] ?? true;
			const hasContent = visibleNodeByPath.get(node.path) ?? false;
			if (!hasContent) {
				return result;
			}

			const stats = folderStatsByPath.get(node.path);
			const inferredPlatform = stats?.inferredPlatform;

			if (node.path && hasContent) {
				result.push(
					<FolderRow
						key={`folder-${node.path}`}
						node={node}
						depth={depth}
						isExpanded={isExpanded}
						totalItems={stats?.totalItems ?? 0}
						pendingInFolder={stats?.pendingInFolder ?? 0}
						isProcessing={stats?.isProcessing ?? false}
						folderOverride={folderOverrides[node.path]}
						inferredPlatform={inferredPlatform}
						onToggle={() => togglePath(node.path)}
						onStartFolder={() => handleStartFolder(node)}
						onSetPlatform={(platform) => setFolderPlatform(node.path, platform)}
						onRemove={() => handleRemoveFolder(node)}
					/>,
				);
			}

			if (isExpanded || !node.path) {
				const childKeys = Object.keys(node.children).sort();
				for (const key of childKeys) {
					const childNode = node.children[key];
					if (!(visibleNodeByPath.get(childNode.path) ?? false)) {
						continue;
					}
					result.push(...renderNode(childNode, node.path ? depth + 1 : depth));
				}

				for (const treeJob of node.jobs) {
					if (!filteredJobIds.has(treeJob.id)) {
						continue;
					}

					const job = jobsById.get(treeJob.id);
					if (!job) continue;

					const jobDepth = node.path ? depth + 1 : depth;
					result.push(
						<JobRow
							key={job.id}
							job={job}
							depth={jobDepth}
							isSelected={selectedJobId === job.id}
							folderOverride={getFolderOverrideForJob(job.path)}
							onSelect={handleSelectJobById}
							onStart={handleStartJobById}
							onRemove={handleRemoveJobById}
							onUpdatePlatform={handleUpdatePlatformById}
						/>,
					);
				}
			}

			return result;
		},
		[
			expandedPaths,
			filteredJobIds,
			folderOverrides,
			folderStatsByPath,
			handleStartFolder,
			getFolderOverrideForJob,
			jobsById,
			visibleNodeByPath,
			selectedJobId,
			setFolderPlatform,
			togglePath,
			handleSelectJobById,
			handleStartJobById,
			handleRemoveJobById,
			handleRemoveFolder,
			handleUpdatePlatformById,
		],
	);

	const filteredRoot = useMemo(() => {
		if (folderFilter === "all") return tree;
		return findNode(tree, folderFilter) ?? tree;
	}, [folderFilter, tree]);

	const hasVisibleJobsInView = useMemo(() => {
		return visibleNodeByPath.get(filteredRoot.path) ?? false;
	}, [filteredRoot.path, visibleNodeByPath]);

	return (
		<div className="space-y-2 flex flex-col h-full min-h-0">
			{/* Filter Bar */}
			<div className="flex items-center gap-2 flex-wrap flex-shrink-0">
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

					<Select value={folderFilter} onValueChange={setFolderFilter}>
						<SelectTrigger className="w-[160px] h-8">
							<SelectValue placeholder="Folder" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Folders</SelectItem>
							{topLevelFolders.map((node) => (
								<SelectItem key={node.path} value={node.path}>
									{node.name}
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

			{/* Table Container */}
			<div className="rounded-md border bg-card flex-1 overflow-y-auto min-h-0 relative">
				<Table>
					<TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
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
						{!hasVisibleJobsInView ? (
							<TableRow>
								<TableCell
									colSpan={7}
									className="h-24 text-center text-muted-foreground"
								>
									{treeJobs.length === 0
										? "No jobs in queue."
										: "No jobs match filter."}
								</TableCell>
							</TableRow>
						) : (
							renderNode(filteredRoot)
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
