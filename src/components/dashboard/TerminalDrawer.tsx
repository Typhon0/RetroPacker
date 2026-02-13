import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Job } from "@/stores/useQueueStore";
import { cn } from "@/lib/utils";
import { X, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TerminalDrawerProps {
	job?: Job;
	isOpen: boolean;
	onClose: () => void;
}

const LINE_HEIGHT_PX = 18;
const OVERSCAN_LINES = 24;
const BOTTOM_STICKY_THRESHOLD_PX = 20;

export function TerminalDrawer({ job, isOpen, onClose }: TerminalDrawerProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const lastJobIdRef = useRef<string | undefined>(undefined);
	const isAtBottomRef = useRef(true);
	const [scrollTop, setScrollTop] = useState(0);
	const [viewportHeight, setViewportHeight] = useState(0);

	const outputLog = job?.outputLog ?? [];
	const totalLines = outputLog.length;

	const visibleWindow = useMemo(() => {
		const visibleCount = Math.max(
			1,
			Math.ceil(viewportHeight / LINE_HEIGHT_PX) + OVERSCAN_LINES * 2,
		);
		const start = Math.max(
			0,
			Math.floor(scrollTop / LINE_HEIGHT_PX) - OVERSCAN_LINES,
		);
		const end = Math.min(totalLines, start + visibleCount);
		return {
			start,
			end,
			offsetY: start * LINE_HEIGHT_PX,
			totalHeight: Math.max(totalLines * LINE_HEIGHT_PX, viewportHeight),
		};
	}, [scrollTop, totalLines, viewportHeight]);

	const visibleLines = useMemo(
		() => outputLog.slice(visibleWindow.start, visibleWindow.end),
		[outputLog, visibleWindow.end, visibleWindow.start],
	);

	const updateBottomStickiness = useCallback(() => {
		if (!scrollRef.current) return;
		const {
			scrollHeight,
			scrollTop: currentTop,
			clientHeight,
		} = scrollRef.current;
		isAtBottomRef.current =
			scrollHeight - currentTop - clientHeight <= BOTTOM_STICKY_THRESHOLD_PX;
	}, []);

	// Track viewport size for virtualized rendering.
	useEffect(() => {
		if (!scrollRef.current || !isOpen) return;

		const element = scrollRef.current;
		setViewportHeight(element.clientHeight);
		setScrollTop(element.scrollTop);
		updateBottomStickiness();

		const observer = new ResizeObserver(() => {
			setViewportHeight(element.clientHeight);
		});
		observer.observe(element);

		return () => observer.disconnect();
	}, [isOpen, updateBottomStickiness]);

	// Keep tail-follow behavior when currently pinned to bottom.
	useEffect(() => {
		if (!scrollRef.current || !isOpen) return;

		const jobChanged = lastJobIdRef.current !== job?.id;
		if (jobChanged) {
			lastJobIdRef.current = job?.id;
			isAtBottomRef.current = true;
		}

		if (!isAtBottomRef.current) return;

		const element = scrollRef.current;
		element.scrollTop = element.scrollHeight;
		setScrollTop(element.scrollTop);
		updateBottomStickiness();
	}, [isOpen, job?.id, outputLog, updateBottomStickiness]);

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
				onScroll={() => {
					if (!scrollRef.current) return;
					setScrollTop(scrollRef.current.scrollTop);
					updateBottomStickiness();
				}}
				className="flex-1 overflow-auto p-4 font-mono text-xs text-zinc-300"
			>
				{job ? (
					totalLines > 0 ? (
						<div
							className="relative"
							style={{ height: `${visibleWindow.totalHeight}px` }}
						>
							<div
								style={{
									transform: `translateY(${visibleWindow.offsetY}px)`,
								}}
							>
								{visibleLines.map((line, i) => (
									<div
										key={visibleWindow.start + i}
										className="h-[18px] leading-[18px] whitespace-pre"
									>
										{line}
									</div>
								))}
							</div>
						</div>
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
