# RetroPacker Architecture

## Overview
RetroPacker uses a hybrid model:
- `JobStore` + `JobState` (signals) for high-frequency job telemetry.
- `useQueueStore` (Zustand) for workflow control state.
- Use cases (`ManageQueueUseCase`, `ProcessJobUseCase`) for queue and processing orchestration.

This separation keeps progress/log updates off the broad React render path.

## Runtime State Model

### `JobState` (entity)
Location: `src/domain/entities/JobState.ts`

Each job is an object with:
- Immutable identity/structure (`id`, `filename`, `path`, `strategy`, `workflow`).
- Signal-backed mutable fields (`status`, `progress`, `etaSeconds`, `outputLog`, etc.).
- Buffered log ingestion (`appendLog`, `flushBufferedLogs`) to avoid per-line UI churn.

### `JobStore` (signal store)
Location: `src/stores/JobStore.ts`

Owns:
- Master job list.
- Computed workflow queues.
- Computed runtime snapshots and summaries (`queueStats`, `queueSummaries`, `globalSummary`), including estimated compression savings from final ratios.

Responsibilities:
- Add/remove/clear/update jobs.
- Retry failed jobs.
- Dispose removed jobs (clears timers/resources).

### `useQueueStore` (workflow control store)
Location: `src/stores/useJobStateStore.ts`

Owns:
- `isProcessing` per workflow.
- `startRequests` queue for manual starts.

Delegates job mutations to `JobStore`.

## Processing Flow

### Queue intake
`DropZone` -> `useQueueManager` -> `ManageQueueUseCase` -> `IJobRepository.addJob` -> `JobStore`.

### Dispatch loop
`useQueueProcessor` watches queue stats + control signals and dispatches jobs with `ProcessJobUseCase`.

Core dispatch decision logic is isolated in:
- `planQueueDispatch` (`src/hooks/useQueueProcessor.ts`)

### Job execution
`ProcessJobUseCase`:
- Marks job as processing.
- Spawns command through `ICommandExecutor`.
- Parses stdout/stderr and updates `JobState`.
- Applies progress throttling/quantization.
- Handles success/failure/cancellation.

## Cancellation Model
Location: `src/services/ProcessRegistry.ts`

`ProcessRegistry` provides:
- Per-job cancellation latches.
- Per-workflow cancellation latches.
- Spawned process registry and termination helpers.

`ProcessJobUseCase` checks latches before spawn and in terminal callbacks to avoid race conditions.

## UI Rendering Strategy

### Table
Location: `src/components/dashboard/JobTable/JobTable.tsx`

- Uses row virtualization for large queues.
- React tree updates mostly on structural changes.
- Row internals read `JobState` signals directly.

### Row/terminal telemetry
- `JobRow` reads status/progress/eta from signals.
- `TerminalDrawer` reads buffered log signal and virtualizes line rendering.

## Dependency Boundaries

`RepositoryProvider` supplies runtime adapters:
- Command execution (`ICommandExecutor`)
- File system (`IFileSystemRepository`)
- Notifications (`INotificationService`)
- Job persistence facade (`IJobRepository`)
- Settings (`ISettingsRepository`)

Use cases depend on interfaces, not concrete adapters.

## Current Test Coverage

Focused tests exist for:
- Queue dispatch planning (`planQueueDispatch`).
- Job lifecycle + cancellation behavior in `ProcessJobUseCase`.

See:
- `src/hooks/useQueueProcessor.test.ts`
- `src/domain/usecases/ProcessJobUseCase.test.ts`
