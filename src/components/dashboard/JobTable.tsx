/**
 * JobTable - Re-export from new module location
 *
 * This file maintains backward compatibility with existing imports.
 * The actual implementation has been moved to ./JobTable/JobTable.tsx
 * following component decomposition for Single Responsibility Principle.
 *
 * @deprecated Import from '@/components/dashboard/JobTable' instead
 */

export { JobTable } from "./JobTable/JobTable";
