import {
	AlertTriangle,
	Archive,
	FolderOpen,
	Info,
	ShieldCheck,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
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

	const handleTabChange = (val: string) => {
		setActiveWorkflow(val as WorkflowType);
		setSelectedJobId(undefined);
	};

	return (
		<div className="flex flex-col h-full gap-4 relative">
			{/* Main Tabs */}
			<Tabs
				value={activeWorkflow}
				onValueChange={handleTabChange}
				className="flex-1 flex flex-col"
			>
				<TabsList className="w-full grid grid-cols-4 h-12">
					{(Object.keys(WORKFLOW_CONFIG) as WorkflowType[]).map((workflow) => (
						<TabsTrigger
							key={workflow}
							value={workflow}
							className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
						>
							{WORKFLOW_CONFIG[workflow].icon}
							<span className="hidden sm:inline">
								{WORKFLOW_CONFIG[workflow].label}
							</span>
						</TabsTrigger>
					))}
				</TabsList>

				{blockedUnknownCount > 0 && (
					<div className="mt-3 inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-600">
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
						className="flex-1 flex flex-col gap-4 mt-4"
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
										onSelectJob={(job) => setSelectedJobId(job.id)}
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
				onClose={() => setSelectedJobId(undefined)}
			/>
		</div>
	);
}
