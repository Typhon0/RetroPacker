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
import { pluralize } from "@/lib/utils";

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
	const conflicts = report?.conflicts ?? [];
	const validJobs = report?.validJobs ?? [];

	const getIconForType = (type: JobConflict["type"]) => {
		switch (type) {
			case "duplicate_input":
				return (
					<ShieldAlert
						className="h-4 w-4 text-warning mt-0.5"
						aria-hidden="true"
					/>
				);
			case "output_collision_queue":
				return (
					<AlertTriangle
						className="h-4 w-4 text-destructive mt-0.5"
						aria-hidden="true"
					/>
				);
			case "output_collision_batch":
				return (
					<FileWarning
						className="h-4 w-4 text-warning mt-0.5"
						aria-hidden="true"
					/>
				);
		}
	};

	return (
		<Dialog
			open={isOpen && report !== null}
			onOpenChange={(open) => !open && onClose()}
		>
			<DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<AlertTriangle
							className="h-5 w-5 text-warning"
							aria-hidden="true"
						/>
						Queue Conflicts Detected
					</DialogTitle>
					<DialogDescription>
						{pluralize(conflicts.length, "conflict found")}
						while trying to add files to the queue.
						{validJobs.length > 0
							? ` You can skip these and add the ${pluralize(validJobs.length, "clean file")}.`
							: " No valid files can be added."}
					</DialogDescription>
				</DialogHeader>

				<ScrollArea className="flex-1 -mx-6 px-6 py-4">
					<div className="space-y-4" role="list" aria-label="Conflict details">
						{conflicts.map((conflict, i) => (
							<div
								key={`${conflict.newJobId}-${i}`}
								className="flex items-start gap-3 p-3 rounded-md bg-muted/50 border"
								role="listitem"
							>
								{getIconForType(conflict.type)}
								<div className="flex flex-col gap-1 min-w-0">
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
								Skip Conflicts & Add {validJobs.length} Clean File
								{validJobs.length === 1 ? "" : "s"}
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
