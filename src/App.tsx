import { useState, useEffect } from 'react';
import { DropZone } from '@/components/dashboard/DropZone';
import { JobTable } from '@/components/dashboard/JobTable';
import { SettingsToolbar } from '@/components/dashboard/SettingsToolbar';
import { TerminalDrawer } from '@/components/dashboard/TerminalDrawer';
import { useQueueProcessor } from '@/hooks/useQueueProcessor';
import { Job, useQueueStore } from '@/stores/useQueueStore';
import { Button } from '@/components/ui/button';
import { Trash2, Play, Pause } from 'lucide-react';
import { usePackerStore } from '@/stores/usePackerStore';
import { TooltipProvider } from '@/components/ui/tooltip';


function App() {
  // Activate the queue processor
  useQueueProcessor();

  const [selectedJobId, setSelectedJobId] = useState<string | undefined>();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const queue = useQueueStore((state) => state.queue);
  const clearQueue = useQueueStore((state) => state.clearQueue);
  const isProcessing = useQueueStore((state) => state.isProcessing);
  const setProcessing = useQueueStore((state) => state.setProcessing);
  const { concurrency, setConcurrency } = usePackerStore();

  // Auto-detect concurrency on first load if default
  useEffect(() => {
    // If concurrency is at default (2) and we have more cores, upgrade it.
    // 2 is the default in the store.
    if (concurrency === 2 && typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
      const recommended = Math.max(2, Math.ceil(navigator.hardwareConcurrency / 2));
      if (recommended > 2) {
        setConcurrency(recommended);
        console.log(`Auto-detected hardware: setting concurrency to ${recommended}`);
      }
    }
  }, []);

  const selectedJob = queue.find(j => j.id === selectedJobId);

  const handleSelectJob = (job: Job) => {
    if (selectedJobId === job.id && isDrawerOpen) {
      setIsDrawerOpen(false);
      setSelectedJobId(undefined);
    } else {
      setSelectedJobId(job.id);
      setIsDrawerOpen(true);
    }
  };

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

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mr-4">
              <span>Concurrency:</span>
              <input
                type="number"
                min={1}
                max={16}
                className="w-12 bg-input border rounded px-1 py-0.5 text-center text-foreground"
                value={concurrency}
                onChange={(e) => setConcurrency(parseInt(e.target.value) || 1)}
              />
            </div>
            <SettingsToolbar />
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 container mx-auto p-6 flex flex-col gap-6 overflow-hidden">
          {/* Top Section: Drop Zone */}
          <DropZone />

          {/* Queue Section */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">Queue ({queue.length})</h2>
              {queue.length > 0 && (
                <div className="flex gap-2">
                  <Button
                    variant={isProcessing ? "secondary" : "default"}
                    size="sm"
                    onClick={() => setProcessing(!isProcessing)}
                  >
                    {isProcessing ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                    {isProcessing ? "Pause Queue" : "Start Processing"}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={clearQueue}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear All
                  </Button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-visible">
              <JobTable
                onSelectJob={handleSelectJob}
                selectedJobId={selectedJobId}
              />
            </div>
          </div>
        </main>

        <TerminalDrawer
          job={selectedJob}
          isOpen={isDrawerOpen && !!selectedJob}
          onClose={() => setIsDrawerOpen(false)}
        />
      </div>
    </TooltipProvider>
  );
}

export default App;
