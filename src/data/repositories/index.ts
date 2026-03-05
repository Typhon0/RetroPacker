/**
 * Data Layer Repositories - Index
 * Re-exports all repository implementations.
 *
 * @module data/repositories
 */

// Mock implementations
export { MockCommandExecutor } from "./MockCommandExecutor";
export { MockDatabaseRepository } from "./MockDatabaseRepository";
export { MockDialogRepository } from "./MockDialogRepository";
export { MockFileSystemRepository } from "./MockFileSystemRepository";
export { MockHttpRepository } from "./MockHttpRepository";
export { MockNotificationService } from "./MockNotificationService";
// Tauri implementations
export { TauriCommandExecutor } from "./TauriCommandExecutor";
export { TauriDatabaseRepository } from "./TauriDatabaseRepository";
export { TauriDialogRepository } from "./TauriDialogRepository";
export { TauriFileSystemRepository } from "./TauriFileSystemRepository";
export { TauriHttpRepository } from "./TauriHttpRepository";
export { TauriNotificationService } from "./TauriNotificationService";

// Zustand adapters
export { ZustandJobRepository } from "./ZustandJobRepository";
export { ZustandSettingsRepository } from "./ZustandSettingsRepository";
