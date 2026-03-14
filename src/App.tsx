import { Pause, Play, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { AboutDialog } from "@/components/dashboard/AboutDialog";
import { BatchProgressBar } from "@/components/dashboard/BatchProgressBar";
import { GlobalSettings } from "@/components/dashboard/GlobalSettings";
import { WorkflowTabs } from "@/components/dashboard/WorkflowTabs";
import { ModeToggle } from "@/components/mode-toggle";
import { ThemeProvider } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useQueueProcessor } from "@/hooks/useQueueProcessor";
import { useSignalValue } from "@/hooks/useSignalValue";
import { useSleepPrevention } from "@/hooks/useSleepPrevention";
import { useTaskbarProgress } from "@/hooks/useTaskbarProgress";
import { cn } from "@/lib/utils";
import { RepositoryProvider } from "@/presentation/context/RepositoryContext";
import { ProcessRegistry } from "@/services/ProcessRegistry";
import { jobStore } from "@/stores/JobStore";
import { usePackerStore } from "@/stores/usePackerStore";

const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 16;

/**
 * Inner App Content - requires RepositoryProvider to be available.
 * Separated to ensure hooks are called within the provider context.
 */
function AppContent() {
	const { activeWorkflow, concurrency, setConcurrency } = usePackerStore();

	// Activate processors for each workflow (these now use RepositoryContext)
	useQueueProcessor("compress");
	useQueueProcessor("extract");
	useQueueProcessor("verify");
	useQueueProcessor("info");
	useTaskbarProgress();
	useSleepPrevention();

	const queue = useSignalValue(jobStore.queues[activeWorkflow]);
	const queueStats = useSignalValue(jobStore.queueStats[activeWorkflow]);
	const isProcessing = useSignalValue(jobStore.isProcessing[activeWorkflow]);

	const failedCount = queueStats.failedCount;

	// Ref to track initialization status to prevent strict mode double-invocations
	const hasInitialized = useRef(false);

	// Initialization
	useEffect(() => {
		if (hasInitialized.current) return;

		// Only auto-detect if we're on the default small value
		if (
			concurrency === 2 &&
			typeof navigator !== "undefined" &&
			navigator.hardwareConcurrency
		) {
			const recommended = Math.max(
				2,
				Math.ceil(navigator.hardwareConcurrency / 2),
			);
			if (recommended > 2) {
				setConcurrency(recommended);
			}
		}

		hasInitialized.current = true;
	}, [concurrency, setConcurrency]);

	const handleConcurrencyChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const rawValue = parseInt(e.target.value, 10);
			if (Number.isNaN(rawValue)) return;
			const clamped = Math.min(
				MAX_CONCURRENCY,
				Math.max(MIN_CONCURRENCY, rawValue),
			);
			setConcurrency(clamped);
		},
		[setConcurrency],
	);

	const handleConcurrencyBlur = useCallback(() => {
		if (concurrency < MIN_CONCURRENCY || concurrency > MAX_CONCURRENCY) {
			setConcurrency(
				Math.min(MAX_CONCURRENCY, Math.max(MIN_CONCURRENCY, concurrency)),
			);
		}
	}, [concurrency, setConcurrency]);

	// Global keyboard shortcuts
	useKeyboardShortcuts(activeWorkflow, isProcessing);

	const handleToggleProcessing = useCallback(() => {
		if (!isProcessing) {
			// Only clear the cancellation flag when we explicitly start
			ProcessRegistry.clearWorkflowCancellation(activeWorkflow);
		}
		jobStore.setProcessing(activeWorkflow, !isProcessing);
	}, [activeWorkflow, isProcessing]);

	const handleClearQueue = useCallback(async () => {
		try {
			// Fire-and-forget: don't await to avoid blocking UI
			await ProcessRegistry.cancelAll(activeWorkflow);
			jobStore.clearQueue(activeWorkflow);
			// Do NOT clear cancellation flag here. It must remain set
			// until the user clicks Start again to prevent race conditions.
		} catch (error) {
			console.error("Failed to cancel processes during clear", error);
		}
	}, [activeWorkflow]);

	const handleRetryFailed = useCallback(() => {
		ProcessRegistry.clearWorkflowCancellation(activeWorkflow);
		jobStore.retryFailed(activeWorkflow);
	}, [activeWorkflow]);

	return (
		<TooltipProvider>
			<div className="min-h-screen text-foreground flex flex-col font-sans">
				<header className="bg-background border-b border-border p-3 sm:p-4 flex items-center justify-between sticky top-0 z-10 gap-2 animate-enter">
					<div className="flex items-center gap-2 sm:gap-3 min-w-0">
						<div className="h-8 w-8 sm:h-9 sm:w-9 bg-muted rounded-lg flex items-center justify-center text-primary font-bold text-xs sm:text-sm select-none shrink-0">
							RP
						</div>
						<h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground truncate">
							RetroPacker
						</h1>
					</div>

					<div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-end">
						<div className="flex items-center gap-2 text-sm text-foreground/80 font-medium bg-muted/30 px-2 sm:px-3 py-1.5 rounded-lg border border-border/40">
							<label
								htmlFor="concurrency-input"
								className="shrink-0 text-xs sm:text-sm"
							>
								<span className="hidden sm:inline">Concurrency:</span>
								<span className="sm:hidden">Conc:</span>
							</label>
							<input
								id="concurrency-input"
								type="number"
								min={MIN_CONCURRENCY}
								max={MAX_CONCURRENCY}
								aria-label="Concurrency level (1–16)"
								aria-describedby="concurrency-hint"
								className={cn(
									"flex h-7 w-10 sm:h-6 sm:w-12 rounded bg-background px-1 py-0 text-sm font-semibold transition-colors border border-border/50",
									"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50",
									"text-center",
								)}
								value={concurrency}
								onChange={handleConcurrencyChange}
								onBlur={handleConcurrencyBlur}
							/>
							<span id="concurrency-hint" className="sr-only">
								Number of parallel processing jobs, between 1 and 16
							</span>
						</div>
						<ModeToggle />
						<GlobalSettings />
						<AboutDialog />

						{queue.length > 0 && (
							<div className="flex gap-2">
								<Button
									variant={isProcessing ? "secondary" : "default"}
									size="sm"
									onClick={handleToggleProcessing}
									aria-label={
										isProcessing ? "Pause processing" : "Start processing"
									}
								>
									{isProcessing ? (
										<Pause className="h-4 w-4 mr-2" aria-hidden="true" />
									) : (
										<Play className="h-4 w-4 mr-2" aria-hidden="true" />
									)}
									{isProcessing ? "Pause" : "Start"}
								</Button>
								{failedCount > 0 && (
									<Button
										variant="outline"
										size="sm"
										onClick={handleRetryFailed}
										aria-label={`Retry ${failedCount} failed job${failedCount === 1 ? "" : "s"}`}
									>
										<RotateCcw className="h-4 w-4 mr-2" aria-hidden="true" />
										Retry {failedCount} Failed
									</Button>
								)}
								<Button
									variant="destructive"
									size="sm"
									onClick={handleClearQueue}
									aria-label="Clear queue"
								>
									<Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
									Clear
								</Button>
							</div>
						)}
					</div>
				</header>

				{/* Batch Progress Summary */}
				<BatchProgressBar workflow={activeWorkflow} />

				{/* Main Content with Workflow Tabs */}
				<main className="flex-1 container mx-auto p-6 flex flex-col gap-6 overflow-hidden animate-enter animate-enter-delay-2">
					<WorkflowTabs />
				</main>
			</div>
		</TooltipProvider>
	);
}

/**
 * App Root - Provides the RepositoryProvider context.
 * AppContent is rendered inside to ensure hooks have access to repositories.
 */
function App() {
	return (
		<ThemeProvider defaultTheme="dark" storageKey="retropacker-theme">
			<RepositoryProvider>
				<AppContent />
			</RepositoryProvider>
		</ThemeProvider>
	);
}

export default App;
