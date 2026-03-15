import { signal } from "@preact/signals-core";
import { Terminal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { JobState } from "@/domain/entities/JobState";
import { useSignalValue } from "@/hooks/useSignalValue";
import { cn } from "@/lib/utils";

interface TerminalDrawerProps {
	job?: JobState;
	isOpen: boolean;
	onClose: () => void;
}

const LINE_HEIGHT_PX = 18;
const OVERSCAN_LINES = 24;
const BOTTOM_STICKY_THRESHOLD_PX = 20;
const EMPTY_LOG_SIGNAL = signal<readonly string[]>([]);

export function TerminalDrawer({ job, isOpen, onClose }: TerminalDrawerProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const lastJobIdRef = useRef<string | undefined>(undefined);
	const isAtBottomRef = useRef(true);
	const rafIdRef = useRef(0);
	const [scrollTop, setScrollTop] = useState(0);
	const [viewportHeight, setViewportHeight] = useState(0);
	const selectedJobId = job?.id;

	const outputLog = useSignalValue(job ? job.outputLog : EMPTY_LOG_SIGNAL);
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
		() =>
			outputLog
				.slice(visibleWindow.start, visibleWindow.end)
				.map((line, offset) => ({
					id: `${visibleWindow.start + offset}:${line}`,
					text: line,
				})),
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

	useEffect(() => {
		if (!scrollRef.current || !isOpen) return;

		const jobChanged = lastJobIdRef.current !== selectedJobId;
		if (jobChanged) {
			lastJobIdRef.current = selectedJobId;
			isAtBottomRef.current = true;
		}

		if (!isAtBottomRef.current) return;

		const element = scrollRef.current;
		element.scrollTop = element.scrollHeight;
		setScrollTop(element.scrollTop);
		updateBottomStickiness();
	}, [isOpen, selectedJobId, updateBottomStickiness]);

	// Cleanup RAF on unmount
	useEffect(() => {
		return () => cancelAnimationFrame(rafIdRef.current);
	}, []);

	return (
		<>
			{isOpen && (
				<div
					className="fixed inset-0 bg-black/10 z-40 transition-opacity duration-200"
					onClick={onClose}
					aria-hidden="true"
				/>
			)}
			<div
				style={{ height: "16rem" }}
				className={cn(
					"fixed bottom-0 left-0 right-0 bg-card text-card-foreground border-t border-border transition-transform duration-300 ease-in-out z-50 flex flex-col shadow-lg",
					isOpen ? "translate-y-0" : "translate-y-full pointer-events-none",
				)}
			>
				<div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border">
					<div className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
						<Terminal className="h-4 w-4" />
						<span>{job ? `Terminal: ${job.filename}` : "Terminal"}</span>
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						aria-label="Close terminal drawer"
						onClick={onClose}
					>
						<X className="h-4 w-4" />
					</Button>
				</div>

				<div
					ref={scrollRef}
					onScroll={() => {
						if (!scrollRef.current) return;
						cancelAnimationFrame(rafIdRef.current);
						rafIdRef.current = requestAnimationFrame(() => {
							if (scrollRef.current) {
								setScrollTop(scrollRef.current.scrollTop);
								updateBottomStickiness();
							}
						});
					}}
					className="flex-1 overflow-auto p-4 font-mono text-xs text-foreground"
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
									{visibleLines.map((line) => (
										<div
											key={line.id}
											className="h-[18px] leading-[18px] whitespace-pre"
										>
											{line.text}
										</div>
									))}
								</div>
							</div>
						) : (
							<div className="text-muted-foreground italic">
								Waiting for logs...
							</div>
						)
					) : (
						<div className="text-muted-foreground italic">No job selected</div>
					)}
				</div>
			</div>
		</>
	);
}
