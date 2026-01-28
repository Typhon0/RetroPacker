import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePackerStore } from "@/stores/usePackerStore";
import { WorkflowType, Job } from "@/stores/useQueueStore";
import { DropZone } from "./DropZone";
import { JobTable } from "./JobTable";
import { SettingsToolbar } from "./SettingsToolbar";
import { InfoViewer } from "./InfoViewer";
import { TerminalDrawer } from "./TerminalDrawer";
import { Archive, FolderOpen, ShieldCheck, Info } from "lucide-react";

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
	const [selectedJob, setSelectedJob] = useState<Job | undefined>(undefined);

	const handleTabChange = (val: string) => {
		setActiveWorkflow(val as WorkflowType);
		setSelectedJob(undefined); // Clear selection on tab switch
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
										onSelectJob={setSelectedJob}
										selectedJobId={selectedJob?.id}
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
				onClose={() => setSelectedJob(undefined)}
			/>
		</div>
	);
}
