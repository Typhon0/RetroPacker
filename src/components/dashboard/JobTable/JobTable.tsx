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
import { useJobDataStore } from "@/stores/useJobDataStore";
import { ProcessRegistry } from "@/services/ProcessRegistry";

import type { TreeJob, TreeNode } from "./JobTreeBuilder";
import { buildTree, getAllPaths, findNode } from "./JobTreeBuilder";
import { FolderRow } from "./FolderRow";
import { JobRow } from "./JobRow";

interface JobTableProps {
	workflow: WorkflowType;
	onSelectJob?: (job: Job) => void;
	selectedJobId?: string;
}

type QueueStoreState = ReturnType<typeof useQueueStore.getState>;

interface JobRuntimeSnapshot {
	status: Job["status"];
	system: Job["system"];
	platformOverride: Job["platformOverride"];
}

interface FolderStats {
	totalItems: number;
	pendingInFolder: number;
	isProcessing: boolean;
	inferredPlatform?: Job["platformOverride"];
}

function createQueueTreeIdsSelector(workflow: WorkflowType) {
	let lastResult: string[] | undefined;

	return (state: QueueStoreState): string[] => {
		const queue = state.queues[workflow];

		if (lastResult && queue.length === lastResult.length) {
			let same = true;
			for (let i = 0; i < queue.length; i++) {
				const current = queue[i];
				const previous = lastResult[i];
				if (current.id !== previous) {
					same = false;
					break;
				}
			}
			if (same) {
				return lastResult;
			}
		}

		lastResult = queue.map((job) => job.id);
		return lastResult;
	};
}

function createQueueRuntimeSelector(workflow: WorkflowType) {
	let lastResult: Record<string, JobRuntimeSnapshot> | undefined;
	let lastOrder: string[] | undefined;

	return (state: QueueStoreState): Record<string, JobRuntimeSnapshot> => {
		const queue = state.queues[workflow];
		const nextOrder = queue.map((job) => job.id);

		if (
			lastResult &&
			lastOrder &&
			lastOrder.length === nextOrder.length &&
			lastOrder.every((id, index) => id === nextOrder[index])
		) {
			let same = true;
			for (const job of queue) {
				const previous = lastResult[job.id];
				if (
					!previous ||
					previous.status !== job.status ||
					previous.system !== job.system ||
					previous.platformOverride !== job.platformOverride
				) {
					same = false;
					break;
				}
			}

			if (same) {
				return lastResult;
			}
		}

		const nextResult: Record<string, JobRuntimeSnapshot> = {};
		for (const job of queue) {
			nextResult[job.id] = {
				status: job.status,
				system: job.system,
				platformOverride: job.platformOverride,
			};
		}

		lastResult = nextResult;
		lastOrder = nextOrder;
		return nextResult;
	};
}

export function JobTable({
	workflow,
	onSelectJob,
	selectedJobId,
}: JobTableProps) {
	const queueTreeIdsSelector = useMemo(
		() => createQueueTreeIdsSelector(workflow),
		[workflow],
	);
	const queueRuntimeSelector = useMemo(
		() => createQueueRuntimeSelector(workflow),
		[workflow],
	);
	const treeJobIds = useQueueStore(queueTreeIdsSelector);
	const jobRuntimeById = useQueueStore(queueRuntimeSelector);
	const jobPathsById = useJobDataStore((state) => state.jobDataById);
	const removeJob = useQueueStore((state) => state.removeJob);
	const updateJob = useQueueStore((state) => state.updateJob);
	const requestStart = useQueueStore((state) => state.requestStart);

	const treeJobs = useMemo((): TreeJob[] => {
		const result: TreeJob[] = [];
		for (const jobId of treeJobIds) {
			const path = jobPathsById[jobId]?.path;
			if (!path) continue;
			result.push({ id: jobId, path });
		}
		return result;
	}, [jobPathsById, treeJobIds]);

	const handleStartJobById = useCallback(
		(jobId: string) => {
			const job = useQueueStore.getState().getJob(workflow, jobId);
			if (!job) return;

			if (job.status !== "pending" && job.status !== "failed") {
				return;
			}

			if (job.status === "failed") {
				updateJob(workflow, job.id, {
					status: "pending",
					progress: 0,
					errorMessage: undefined,
					etaSeconds: undefined,
					startTime: undefined,
				});
			}

			// Manual starts should also release any cancellation latch.
			ProcessRegistry.clearWorkflowCancellation(workflow);
			requestStart(workflow, job.id);
		},
		[requestStart, updateJob, workflow],
	);

	const handleRemoveJobById = useCallback(
		async (jobId: string) => {
			const job = useQueueStore.getState().getJob(workflow, jobId);
			if (!job) return;

			if (job.status === "processing") {
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
			const job = useQueueStore.getState().getJob(workflow, jobId);
			if (job) onSelectJob?.(job);
		},
		[onSelectJob, workflow],
	);

	const handleUpdatePlatformById = useCallback(
		(jobId: string, platform: Job["platformOverride"]) => {
			updateJob(workflow, jobId, {
				platformOverride: platform,
				system: platform
					? platform.charAt(0).toUpperCase() + platform.slice(1)
					: undefined,
			});
		},
		[updateJob, workflow],
	);

	// Filters
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
				for (const job of targetNode.jobs) {
					if (!filteredJobIds.has(job.id)) {
						continue;
					}

					const runtime = jobRuntimeById[job.id];
					if (!runtime) {
						continue;
					}

					if (runtime.status === "pending" || runtime.status === "failed") {
						if (runtime.status === "failed") {
							updateJob(workflow, job.id, {
								status: "pending",
								progress: 0,
								errorMessage: undefined,
								etaSeconds: undefined,
								startTime: undefined,
							});
						}
						idsToStart.push(job.id);
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

	// Get unique systems for filter
	const uniqueSystems = useMemo(() => {
		const systems = new Set(
			Object.values(jobRuntimeById).map((runtime) => runtime.system),
		);
		return Array.from(systems).sort();
	}, [jobRuntimeById]);

	// Build tree from structural job data only (id/path).
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
		): Job["platformOverride"] | undefined => {
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
				return system as Job["platformOverride"];
			}
			return undefined;
		};

		const visit = (
			node: TreeNode,
		): {
			totalItems: number;
			pendingInFolder: number;
			isProcessing: boolean;
			platforms: Set<Job["platformOverride"]>;
		} => {
			let totalItems = 0;
			let pendingInFolder = 0;
			let isProcessing = false;
			const platforms = new Set<Job["platformOverride"]>();

			for (const job of node.jobs) {
				if (!filteredJobIds.has(job.id)) {
					continue;
				}

				totalItems += 1;
				const runtime = jobRuntimeById[job.id];
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

	// Top-level folders for tree filter
	const topLevelFolders = useMemo(() => {
		if (!tree.path) {
			return Object.values(tree.children);
		}
		return [tree];
	}, [tree]);

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

	// Remove all jobs in a folder
	const handleRemoveFolder = useCallback(
		async (node: TreeNode) => {
			const jobsToRemove: TreeJob[] = [];

			// Recursive function to collect all jobs
			const collectJobs = (n: TreeNode) => {
				jobsToRemove.push(...n.jobs);
				Object.values(n.children).forEach(collectJobs);
			};

			collectJobs(node);

			// Cancel any active jobs first
			for (const job of jobsToRemove) {
				if (!filteredJobIds.has(job.id)) {
					continue;
				}

				const runtime = jobRuntimeById[job.id];
				if (runtime?.status === "processing") {
					try {
						await ProcessRegistry.cancel(workflow, job.id);
					} catch (e) {
						console.warn(`Failed to cancel job ${job.id}`, e);
					}
				}

				// Remove from store
				removeJob(workflow, job.id);
			}
		},
		[filteredJobIds, jobRuntimeById, workflow, removeJob],
	);

	// Recursive render function using extracted components
	const renderNode = useCallback(
		(node: TreeNode, depth: number = 0): React.ReactNode[] => {
			const result: React.ReactNode[] = [];
			const isExpanded = expandedPaths[node.path] ?? true;
			const hasContent = visibleNodeByPath.get(node.path) ?? false;
			if (!hasContent) {
				return result;
			}

			const stats = folderStatsByPath.get(node.path);
			const inferredPlatform = stats?.inferredPlatform;

			// Render folder row (skip root)
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

			// If expanded, render children and jobs
			if (isExpanded || !node.path) {
				const childKeys = Object.keys(node.children).sort();
				for (const key of childKeys) {
					const childNode = node.children[key];
					if (!(visibleNodeByPath.get(childNode.path) ?? false)) {
						continue;
					}
					result.push(...renderNode(childNode, node.path ? depth + 1 : depth));
				}

				for (const job of node.jobs) {
					if (!filteredJobIds.has(job.id)) {
						continue;
					}
					const jobDepth = node.path ? depth + 1 : depth;
					result.push(
						<JobRow
							key={job.id}
							jobId={job.id}
							workflow={workflow}
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
			visibleNodeByPath,
			selectedJobId,
			setFolderPlatform,
			togglePath,
			workflow,
			// Stable ID-based callbacks
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
