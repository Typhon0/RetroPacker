import { useEffect, useRef } from "react";
import { Job } from "@/stores/useQueueStore";
import { cn } from "@/lib/utils";
import { X, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TerminalDrawerProps {
	job?: Job;
	isOpen: boolean;
	onClose: () => void;
}

export function TerminalDrawer({ job, isOpen, onClose }: TerminalDrawerProps) {
	const scrollRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to bottom on new logs
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [job?.outputLog]);

	return (
		<div
			className={cn(
				"fixed bottom-0 left-0 right-0 bg-zinc-950 border-t transition-transform duration-300 ease-in-out z-50 flex flex-col shadow-2xl",
				isOpen ? "translate-y-0 h-64" : "translate-y-full h-0",
			)}
		>
			<div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
				<div className="flex items-center gap-2 text-sm font-mono text-zinc-400">
					<Terminal className="h-4 w-4" />
					<span>{job ? `Terminal: ${job.filename}` : "Terminal"}</span>
				</div>
				<Button
					variant="ghost"
					size="icon"
					className="h-6 w-6"
					onClick={onClose}
				>
					<X className="h-4 w-4" />
				</Button>
			</div>

			<div
				ref={scrollRef}
				className="flex-1 overflow-y-auto p-4 font-mono text-xs text-zinc-300 space-y-1"
			>
				{job ? (
					job.outputLog.length > 0 ? (
						job.outputLog.map((line, i) => (
							<div key={i} className="whitespace-pre-wrap">
								{line}
							</div>
						))
					) : (
						<div className="text-zinc-500 italic">Waiting for logs...</div>
					)
				) : (
					<div className="text-zinc-500 italic">No job selected</div>
				)}
			</div>
		</div>
	);
}
