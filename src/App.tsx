import { useState } from 'react';
import { DropZone } from '@/components/dashboard/DropZone';
import { JobTable } from '@/components/dashboard/JobTable';
import { PresetSelector } from '@/components/dashboard/PresetSelector';
import { TerminalDrawer } from '@/components/dashboard/TerminalDrawer';
import { useQueueProcessor } from '@/hooks/useQueueProcessor';
import { Job, useQueueStore } from '@/stores/useQueueStore';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { usePackerStore } from '@/stores/usePackerStore';

function App() {
  // Activate the queue processor
  useQueueProcessor();

  const [selectedJobId, setSelectedJobId] = useState<string | undefined>();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const queue = useQueueStore((state) => state.queue);
  const clearQueue = useQueueStore((state) => state.clearQueue);
  const { concurrency, setConcurrency } = usePackerStore();

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
          <PresetSelector />
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
              <Button variant="destructive" size="sm" onClick={clearQueue}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All
              </Button>
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

      {/* Terminal Drawer */}
      <TerminalDrawer
        job={selectedJob}
        isOpen={isDrawerOpen && !!selectedJob}
        onClose={() => setIsDrawerOpen(false)}
      />
    </div>
  );
}

export default App;
