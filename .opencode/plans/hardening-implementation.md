# RetroPacker Hardening Implementation Plan

## Context

This plan implements hardening improvements across the RetroPacker codebase to strengthen interfaces against edge cases, errors, and real-world usage. Phases 1-2 are partially complete. This plan covers the remaining phases 2.5 through 7.

## Already Completed

The following changes were already applied:

- `table.tsx`: TableRow has `tabIndex={0}` and Enter/Space keyboard handler; TableCell uses `min-w-0 overflow-hidden` instead of `whitespace-nowrap`
- `scroll-area.tsx`: Viewport has `tabIndex={0}` for keyboard scrolling
- `dialog.tsx`: `max-h-[85vh] overflow-y-auto` on DialogContent
- `tooltip.tsx`: `max-w-xs` replaces `w-fit`
- `tabs.tsx`: `truncate` on TabsTrigger; `overflow-x-auto` on TabsList
- `button.tsx`: `truncate` replaces `whitespace-nowrap`
- `status-badge.tsx`: `truncate max-w-full` replaces `whitespace-nowrap`

## Phase 2.5: Select & Popover Overflow

### `src/components/ui/select.tsx`

**Line 38**: Replace `whitespace-nowrap` with `truncate min-w-0` in SelectTrigger className:
```
Before: "flex w-fit items-center ... text-sm whitespace-nowrap shadow-xs ..."
After:  "flex w-fit items-center ... text-sm truncate min-w-0 shadow-xs ..."
```

**Line 110**: Replace physical padding with logical in SelectItem:
```
Before: "relative flex ... py-1.5 pr-8 pl-2 text-sm ..."
After:  "relative flex ... py-1.5 pe-8 ps-2 text-sm ..."
```

**Line 117**: Replace `right-2` with `end-2` in select item indicator:
```
Before: className="absolute right-2 flex size-3.5 ..."
After:  className="absolute end-2 flex size-3.5 ..."
```

### `src/components/ui/popover.tsx`

**Line 33**: Add max-width to prevent overflow on narrow screens:
```
Before: "z-50 w-72 origin-(--radix-popover-content-transform-origin) ..."
After:  "z-50 w-72 max-w-[min(18rem,calc(100vw-2rem))] origin-(--radix-popover-content-transform-origin) ..."
```

### `src/components/ui/scroll-area.tsx`

**Line 44**: Replace physical border with logical:
```
Before: "h-full w-2.5 border-l border-l-transparent"
After:  "h-full w-2.5 border-s border-s-transparent"
```

## Phase 5: RTL & Logical Properties

Replace all physical CSS properties with logical equivalents across the codebase.

### `src/App.tsx`
| Line | Before | After |
|------|--------|-------|
| 177 | `mr-2` | `me-2` |
| 179 | `mr-2` | `me-2` |
| 190 | `mr-2` | `me-2` |
| 200 | `mr-2` | `me-2` |

### `src/components/dashboard/DropZone.tsx`
| Line | Before | After |
|------|--------|-------|
| 453 | `mr-2` | `me-2` |

### `src/components/dashboard/InfoViewer.tsx`
| Line | Before | After |
|------|--------|-------|
| 441 | `ml-2` | `ms-2` |
| 724 | `mr-1` | `me-1` |
| 728 | `mr-1` | `me-1` |

### `src/components/dashboard/JobTable/JobTable.tsx`
| Line | Before | After |
|------|--------|-------|
| 758 | `ml-1` | `ms-1` |
| 810 | `ml-auto` | `ms-auto` |
| 817 | `mr-1` | `me-1` |
| 826 | `mr-1` | `me-1` |
| 848 | `text-right` | `text-end` |

### `src/components/dashboard/JobTable/JobRow.tsx`
| Line | Before | After |
|------|--------|-------|
| 175 | `text-right` | `text-end` |
| 260 | `border-l-2 border-l-warning` | `border-s-2 border-s-warning` |
| 264 | `paddingLeft: ...` (inline) | `paddingInlineStart: ...` |
| 324 | `text-right` | `text-end` |

### `src/components/dashboard/JobTable/FolderRow.tsx`
| Line | Before | After |
|------|--------|-------|
| 59 | `paddingLeft: ...` (inline) | `paddingInlineStart: ...` |
| 86 | `text-right` | `text-end` |

### `src/components/ui/table.tsx`
| Line | Before | After |
|------|--------|-------|
| 73 (head) | `text-left` | `text-start` |
| variant selector | `[&:has([role=checkbox])]:pr-0` | `[&:has([role=checkbox])]:pe-0` |

### `src/components/ui/dialog.tsx`
| Line | Before | After |
|------|--------|-------|
| 85 | `sm:text-left` | `sm:text-start` |

## Phase 6: Pluralization & Fixed Widths

### 6.1 Pluralization helper

**Add to `src/lib/utils.ts`** after `getBasename`:
```typescript
export function pluralize(count: number, singular: string, plural?: string): string {
  if (count === 1) return `${count} ${singular}`;
  return `${count} ${plural ?? `${singular}s`}`;
}
```

**Replace patterns:**

| File | Line | Before | After |
|------|------|--------|-------|
| `App.tsx` | ~188 | `` `failed job${failedCount === 1 ? "" : "s"}` `` | Use `pluralize(failedCount, "failed job", "failed jobs")` |
| `WorkflowTabs.tsx` | ~123 | `` `job${count === 1 ? "" : "s"} blocked` `` | Use `pluralize(count, "job blocked", "jobs blocked")` |
| `ConflictDialog.tsx` | ~74 | `` `conflict${conflicts.length === 1 ? "" : "s"} found` `` | Use `pluralize(conflicts.length, "conflict found", "conflicts found")` |
| `ConflictDialog.tsx` | ~77 | `` `clean file${validJobs.length === 1 ? "" : "s"}` `` | Use `pluralize(validJobs.length, "clean file")` |
| `FolderRow.tsx` | ~72 | `({totalItems} items)` | `(${pluralize(totalItems, "item")})` |

### 6.2 Fixed widths to flexible

| File | Line | Before | After |
|------|------|--------|-------|
| `SettingsToolbar.tsx` | 26 | `min-w-[80px] max-w-[120px]` | `min-w-[5rem] max-w-[10rem]` |
| `SettingsToolbar.tsx` | 47 | `min-w-[100px] max-w-[140px]` | `min-w-[6rem] max-w-[10rem]` |
| `PlatformSelector.tsx` | 41 | `w-[180px] sm:w-[250px]` | `min-w-[10rem] max-w-[16rem]` |
| `PlatformSelector.tsx` | 43 | `w-[100px] sm:w-[140px]` | `min-w-[6rem] max-w-[10rem]` |
| `PresetSelector.tsx` | 28 | `w-[240px]` | `min-w-[12rem] max-w-[16rem]` |

## Phase 4: Input Validation & Edge Cases

### 4.1 Add `getExtension` utility

**Add to `src/lib/utils.ts`** after `getBasename`:
```typescript
export function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot > 0 ? filename.slice(lastDot + 1).toLowerCase() : "";
}
```

### 4.2 Guard division by zero

**`src/components/dashboard/InfoViewer.tsx` around line 227:**
```typescript
// Before:
const ratio = (size / Number(totalBytes)) * 100;

// After:
const ratio = totalBytes > 0 ? (size / Number(totalBytes)) * 100 : 0;
```

### 4.3 Concurrency validation feedback

**`src/App.tsx`** - Add visual validation state to concurrency input:
1. Add `aria-invalid` when value is out of range
2. Add `border-destructive` when invalid
3. Show sr-only error description

### 4.4 Wake Lock API fallback

**`src/hooks/useSleepPrevention.ts`** - Add try/catch around initial setup:
```typescript
// Wrap the entire initial wake lock request in try/catch
// Set a flag `wakeLockUnavailable` if API is not present
// Skip re-acquisition attempts if unavailable
```

## Phase 3: Error Handling & User Feedback

### 3.1 Fix empty `.catch()` patterns

| File | Line | Before | After |
|------|------|--------|-------|
| `useQueueProcessor.ts` | 143 | `.catch()` | `.catch((err) => console.warn("Notification delivery failed:", err))` |
| `ProcessRegistry.ts` | 46 | `.catch(() => {})` | `.catch((err) => console.warn("Process termination failed:", err))` |
| `ProcessRegistry.ts` | 52 | `.catch(() => {})` | `.catch((err) => console.warn("Process termination failed:", err))` |
| `AboutDialog.tsx` | 21,24 | `.catch(() => {})` | Keep empty but add comment: `// Version unavailable - acceptable fallback` |
| `useSleepPrevention.ts` | 55 | `.catch(() => {})` | `.catch((err) => console.warn("Wake lock release failed:", err))` |

### 3.2 Force-clear queue on error

**`src/App.tsx` lines 103-113:**
```typescript
// Add after console.error in catch block:
jobStore.clearQueue(activeWorkflow);
```
This ensures the UI doesn't get stuck in an inconsistent state.

### 3.3 Improve DropZone error messages

**`src/components/dashboard/DropZone.tsx` line 127:**
```typescript
// Before: "An error occurred while processing paths"
// After: `Failed to process ${paths.length} item${paths.length === 1 ? "" : "s"}: ${error instanceof Error ? error.message : "Unknown error"}`
```

### 3.4 Create Error Boundary

**Create `src/components/ErrorBoundary.tsx`:**
- Class component with `getDerivedStateFromError`
- Catches render errors
- Shows fallback UI with reload button
- Logs to console

### 3.5 Add useQueueProcessor notification error handling

**`src/hooks/useQueueProcessor.ts` around line 188-189:**
```typescript
// Before: console.warn only
// After: console.warn with context about which job failed M3U generation
```

## Phase 7: Verification

Run these commands from project root:

```bash
# Fix formatting and lint
pnpm biome check --write

# Verify TypeScript compiles
pnpm build

# Run all tests
pnpm vitest run
```

## Execution Order

1. Phase 2.5 (select, popover, scroll-area) - 15min
2. Phase 5 (RTL logical properties, 12 files) - 30min
3. Phase 6.1 (pluralization helper + 5 files) - 30min
4. Phase 6.2 (fixed widths, 3 files) - 15min
5. Phase 4.1-4.2 (getExtension, division by zero) - 15min
6. Phase 4.3-4.4 (concurrency validation, wake lock) - 30min
7. Phase 3.1-3.5 (error handling across 7 files) - 1.5hrs
8. Phase 7 (verification) - 15min

Total: ~4 hours

## Files Modified (Summary)

### UI Primitives (8 files)
- `src/components/ui/select.tsx` - overflow + logical props
- `src/components/ui/popover.tsx` - max-width
- `src/components/ui/scroll-area.tsx` - logical border
- `src/components/ui/table.tsx` - logical text-align
- `src/components/ui/dialog.tsx` - logical text-align
- `src/components/ui/button.tsx` - (already done)
- `src/components/ui/status-badge.tsx` - (already done)
- `src/components/ui/tabs.tsx` - (already done)

### Dashboard Components (7 files)
- `src/components/dashboard/JobTable/JobTable.tsx` - logical props
- `src/components/dashboard/JobTable/JobRow.tsx` - logical props + borders
- `src/components/dashboard/JobTable/FolderRow.tsx` - logical props
- `src/components/dashboard/DropZone.tsx` - logical props + error message
- `src/components/dashboard/InfoViewer.tsx` - logical props + division guard
- `src/components/dashboard/WorkflowTabs.tsx` - pluralization
- `src/components/dashboard/ConflictDialog.tsx` - pluralization

### Core Files (5 files)
- `src/App.tsx` - logical props + error handling + validation
- `src/lib/utils.ts` - pluralize + getExtension helpers
- `src/hooks/useQueueProcessor.ts` - error handling
- `src/hooks/useSleepPrevention.ts` - error handling + fallback
- `src/services/ProcessRegistry.ts` - error handling
- `src/components/dashboard/AboutDialog.tsx` - error handling comments

### New Files (1 file)
- `src/components/ErrorBoundary.tsx` - React error boundary
