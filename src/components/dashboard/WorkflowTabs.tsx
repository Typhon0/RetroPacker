import {
	AlertTriangle,
	Archive,
	FolderOpen,
	Info,
	ShieldCheck,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WorkflowType } from "@/domain/types/workflow.types";
import { useSignalValue } from "@/hooks/useSignalValue";
import { jobStore } from "@/stores/JobStore";
import { usePackerStore } from "@/stores/usePackerStore";
import { DropZone } from "./DropZone";
import { InfoViewer } from "./InfoViewer";
import { JobTable } from "./JobTable";
import { SettingsToolbar } from "./SettingsToolbar";
import { TerminalDrawer } from "./TerminalDrawer";

const WORKFLOW_CONFIG: Record<
	WorkflowType,
	{ label: string; icon: React.ReactNode; description: string }
> = {
	compress: {
		label: "Compress",
		icon: <Archive className="h-4 w-4" />,
		description: "Create CHD/RVZ from raw disc images",
	},
	extract: {
		label: "Extract",
		icon: <FolderOpen className="h-4 w-4" />,
		description: "Restore raw disc images from archives",
	},
	verify: {
		label: "Verify",
		icon: <ShieldCheck className="h-4 w-4" />,
		description: "Check integrity of compressed files",
	},
	info: {
		label: "Info",
		icon: <Info className="h-4 w-4" />,
		description: "Read game metadata and technical info",
	},
};

export function WorkflowTabs() {
	const { activeWorkflow, setActiveWorkflow } = usePackerStore();
	const [selectedJobId, setSelectedJobId] = useState<string | undefined>(
		undefined,
	);
	const activeQueue = useSignalValue(jobStore.queues[activeWorkflow]);
	const activeRuntime = useSignalValue(
		jobStore.runtimeByWorkflow[activeWorkflow],
	);
	const blockedUnknownCount = useMemo(
		() =>
			Object.values(activeRuntime).filter(
				(runtime) =>
					runtime.system === "Unknown" &&
					runtime.platformOverride === undefined,
			).length,
		[activeRuntime],
	);

	const selectedJob = useMemo(() => {
		if (!selectedJobId) return undefined;
		return activeQueue.find((job) => job.id === selectedJobId);
	}, [activeQueue, selectedJobId]);

	useEffect(() => {
		if (selectedJobId && !selectedJob) {
			setSelectedJobId(undefined);
		}
	}, [selectedJob, selectedJobId]);

	const handleTabChange = useCallback(
		(val: string) => {
			setActiveWorkflow(val as WorkflowType);
			setSelectedJobId(undefined);
		},
		[setActiveWorkflow],
	);

	const handleCloseTerminal = useCallback(() => {
		setSelectedJobId(undefined);
	}, []);

	const handleSelectJob = useCallback((job: { id: string }) => {
		setSelectedJobId(job.id);
	}, []);

	return (
		<div className="flex flex-col h-full gap-4 relative">
			{/* Main Tabs */}
			<Tabs
				value={activeWorkflow}
				onValueChange={handleTabChange}
				className="flex-1 flex flex-col"
			>
				<div className="flex justify-center mb-4 sm:mb-6 mt-2 px-2">
					<TabsList className="bg-card border border-border grid grid-cols-4 h-10 sm:h-12 p-1 rounded-xl w-full max-w-lg">
						{(Object.keys(WORKFLOW_CONFIG) as WorkflowType[]).map(
							(workflow) => (
								<TabsTrigger
									key={workflow}
									value={workflow}
									className="flex items-center justify-center gap-2 rounded-lg transition-colors duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground hover:bg-muted/50"
								>
									{WORKFLOW_CONFIG[workflow].icon}
									<span className="hidden sm:inline font-medium">
										{WORKFLOW_CONFIG[workflow].label}
									</span>
								</TabsTrigger>
							),
						)}
					</TabsList>
				</div>

				{blockedUnknownCount > 0 && (
					<div className="mt-3 inline-flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
						<AlertTriangle className="h-4 w-4" />
						{blockedUnknownCount} job
						{blockedUnknownCount === 1 ? "" : "s"} blocked: platform unknown.
						Select a platform in the row to process.
					</div>
				)}

				{(Object.keys(WORKFLOW_CONFIG) as WorkflowType[]).map((workflow) => (
					<TabsContent
						key={workflow}
						value={workflow}
						className="flex-1 flex flex-col gap-4 mt-4 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-200 data-[state=inactive]:animate-out data-[state=inactive]:fade-out-0 data-[state=inactive]:duration-100"
					>
						{/* Settings Toolbar - Only for Compress */}
						{workflow === "compress" && (
							<div className="flex justify-end">
								<SettingsToolbar />
							</div>
						)}

						{/* Info tab uses special viewer, others use DropZone + JobTable */}
						{workflow === "info" ? (
							<InfoViewer />
						) : (
							<>
								{/* Drop Zone */}
								<DropZone workflow={workflow} />

								{/* Job Table */}
								<div className="flex-1 min-h-0">
									<JobTable
										workflow={workflow}
										onSelectJob={handleSelectJob}
										selectedJobId={selectedJobId}
									/>
								</div>
							</>
						)}
					</TabsContent>
				))}
			</Tabs>

			{/* Terminal Drawer */}
			<TerminalDrawer
				job={selectedJob}
				isOpen={!!selectedJob}
				onClose={handleCloseTerminal}
			/>
		</div>
	);
}
