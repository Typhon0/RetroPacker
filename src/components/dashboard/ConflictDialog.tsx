import { AlertTriangle, FileWarning, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
	ConflictReport,
	JobConflict,
} from "@/domain/services/QueueAnalyzerService";

interface ConflictDialogProps {
	isOpen: boolean;
	report: ConflictReport | null;
	onClose: () => void;
	onConfirm: () => void;
}

export function ConflictDialog({
	isOpen,
	report,
	onClose,
	onConfirm,
}: ConflictDialogProps) {
	if (!report) return null;

	const { conflicts, validJobs } = report;

	const getIconForType = (type: JobConflict["type"]) => {
		switch (type) {
			case "duplicate_input":
				return <ShieldAlert className="h-4 w-4 text-amber-500 mt-0.5" />;
			case "output_collision_queue":
				return <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />;
			case "output_collision_batch":
				return <FileWarning className="h-4 w-4 text-orange-500 mt-0.5" />;
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<AlertTriangle className="h-5 w-5 text-amber-500" />
						Queue Conflicts Detected
					</DialogTitle>
					<DialogDescription>
						{conflicts.length} conflict(s) found while trying to add files to
						the queue.
						{validJobs.length > 0
							? ` You can skip these and add the ${validJobs.length} clean file(s).`
							: " No valid files can be added."}
					</DialogDescription>
				</DialogHeader>

				<ScrollArea className="flex-1 -mx-6 px-6 py-4">
					<div className="space-y-4">
						{conflicts.map((conflict, i) => (
							<div
								key={`${conflict.newJobId}-${i}`}
								className="flex items-start gap-3 p-3 rounded-md bg-muted/50 border"
							>
								{getIconForType(conflict.type)}
								<div className="flex flex-col gap-1">
									<p className="text-sm font-medium">{conflict.message}</p>
									{conflict.conflictingPath && (
										<p className="text-xs text-muted-foreground break-all font-mono">
											{conflict.conflictingPath}
										</p>
									)}
								</div>
							</div>
						))}
					</div>
				</ScrollArea>

				<DialogFooter className="mt-4 gap-2 sm:gap-0">
					{validJobs.length > 0 ? (
						<>
							<Button variant="outline" onClick={onClose}>
								Cancel
							</Button>
							<Button onClick={onConfirm}>
								Skip Conflicts & Add {validJobs.length} Clean File(s)
							</Button>
						</>
					) : (
						<Button onClick={onClose} variant="secondary">
							Close
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
