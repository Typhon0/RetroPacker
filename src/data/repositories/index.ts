/**
 * Data Layer Repositories - Index
 * Re-exports all repository implementations.
 *
 * @module data/repositories
 */

// Tauri implementations
export { TauriCommandExecutor } from "./TauriCommandExecutor";
export { TauriFileSystemRepository } from "./TauriFileSystemRepository";
export { TauriNotificationService } from "./TauriNotificationService";

// Mock implementations
export { MockCommandExecutor } from "./MockCommandExecutor";
export { MockFileSystemRepository } from "./MockFileSystemRepository";
export { MockNotificationService } from "./MockNotificationService";

// Zustand adapters
export { ZustandJobRepository } from "./ZustandJobRepository";
export { ZustandSettingsRepository } from "./ZustandSettingsRepository";
