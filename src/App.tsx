import { useEffect, useCallback, useRef } from "react";
import { WorkflowTabs } from "@/components/dashboard/WorkflowTabs";
import { GlobalSettings } from "@/components/dashboard/GlobalSettings";
import { useQueueProcessor } from "@/hooks/useQueueProcessor";
import { useTaskbarProgress } from "@/hooks/useTaskbarProgress";
import { useSleepPrevention } from "@/hooks/useSleepPrevention";
import { useQueueStore } from "@/stores/useQueueStore";
import { Button } from "@/components/ui/button";
import { Trash2, Play, Pause } from "lucide-react";
import { usePackerStore } from "@/stores/usePackerStore";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RepositoryProvider } from "@/presentation/context/RepositoryContext";
import { ProcessRegistry } from "@/services/ProcessRegistry";
import { cn } from "@/lib/utils";

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

	const queue = useQueueStore((state) => state.queues[activeWorkflow]);
	const clearQueue = useQueueStore((state) => state.clearQueue);
	const isProcessing = useQueueStore(
		(state) => state.isProcessing[activeWorkflow],
	);
	const setProcessing = useQueueStore((state) => state.setProcessing);

	// Ref to track initialization status to prevent strict mode double-invocations
	const hasInitialized = useRef(false);

	// Auto-detect concurrency on first load
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
			const rawValue = parseInt(e.target.value);
			// Validate and clamp input
			if (Number.isNaN(rawValue)) return; // Don't update on empty/invalid
			const clamped = Math.min(
				MAX_CONCURRENCY,
				Math.max(MIN_CONCURRENCY, rawValue),
			);
			setConcurrency(clamped);
		},
		[setConcurrency],
	);

	const handleToggleProcessing = useCallback(() => {
		if (!isProcessing) {
			// Only clear the cancellation flag when we explicitly start
			ProcessRegistry.clearWorkflowCancellation(activeWorkflow);
		}
		setProcessing(activeWorkflow, !isProcessing);
	}, [activeWorkflow, isProcessing, setProcessing]);

	const handleClearQueue = useCallback(async () => {
		try {
			// Fire-and-forget: don't await to avoid blocking UI
			await ProcessRegistry.cancelAll(activeWorkflow);
			clearQueue(activeWorkflow);
			// Do NOT clear cancellation flag here. It must remain set
			// until the user clicks Start again to prevent race conditions.
		} catch (error) {
			console.error("Failed to cancel processes during clear", error);
		}
	}, [activeWorkflow, clearQueue]);

	return (
		<TooltipProvider>
			<div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
				{/* Header */}
				<header className="border-b bg-card p-4 flex items-center justify-between sticky top-0 z-10">
					<div className="flex items-center gap-2">
						<div className="h-8 w-8 bg-primary rounded-md flex items-center justify-center text-primary-foreground font-bold text-lg">
							RP
						</div>
						<h1 className="text-xl font-bold tracking-tight">RetroPacker</h1>
					</div>

					<div className="flex items-center gap-4">
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<span>Concurrency:</span>
							<input
								type="number"
								min={MIN_CONCURRENCY}
								max={MAX_CONCURRENCY}
								className={cn(
									"flex h-8 w-14 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm transition-colors",
									"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
									"text-center",
								)}
								value={concurrency}
								onChange={handleConcurrencyChange}
							/>
						</div>
						<GlobalSettings />

						{queue.length > 0 && (
							<div className="flex gap-2">
								<Button
									variant={isProcessing ? "secondary" : "default"}
									size="sm"
									onClick={handleToggleProcessing}
								>
									{isProcessing ? (
										<Pause className="h-4 w-4 mr-2" />
									) : (
										<Play className="h-4 w-4 mr-2" />
									)}
									{isProcessing ? "Pause" : "Start"}
								</Button>
								<Button
									variant="destructive"
									size="sm"
									onClick={handleClearQueue}
								>
									<Trash2 className="h-4 w-4 mr-2" />
									Clear
								</Button>
							</div>
						)}
					</div>
				</header>

				{/* Main Content with Workflow Tabs */}
				<main className="flex-1 container mx-auto p-6 flex flex-col gap-6 overflow-hidden">
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
		<RepositoryProvider>
			<AppContent />
		</RepositoryProvider>
	);
}

export default App;
