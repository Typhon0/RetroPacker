/**
 * Repository Context
 * React Context for Dependency Injection of repository implementations.
 *
 * This enables Clean Architecture's Dependency Inversion Principle by
 * allowing components to depend on interfaces rather than implementations.
 *
 * @module presentation/context/RepositoryContext
 */

import React, { createContext, useContext, useMemo, ReactNode } from "react";
import { ICommandExecutor } from "../../domain/repositories/ICommandExecutor";
import { IFileSystemRepository } from "../../domain/repositories/IFileSystemRepository";
import { INotificationService } from "../../domain/repositories/INotificationService";
import { IJobRepository } from "../../domain/repositories/IJobRepository";
import { ISettingsRepository } from "../../domain/repositories/ISettingsRepository";

// Tauri implementations
import { TauriCommandExecutor } from "../../data/repositories/TauriCommandExecutor";
import { TauriFileSystemRepository } from "../../data/repositories/TauriFileSystemRepository";
import { TauriNotificationService } from "../../data/repositories/TauriNotificationService";

// Mock implementations
import { MockCommandExecutor } from "../../data/repositories/MockCommandExecutor";
import { MockFileSystemRepository } from "../../data/repositories/MockFileSystemRepository";
import { MockNotificationService } from "../../data/repositories/MockNotificationService";

// Zustand adapters
import { ZustandJobRepository } from "../../data/repositories/ZustandJobRepository";
import { ZustandSettingsRepository } from "../../data/repositories/ZustandSettingsRepository";

/**
 * All available repositories for dependency injection.
 */
export interface Repositories {
	readonly commandExecutor: ICommandExecutor;
	readonly fileSystem: IFileSystemRepository;
	readonly notificationService: INotificationService;
	readonly jobRepository: IJobRepository;
	readonly settingsRepository: ISettingsRepository;
}

/**
 * Context for repositories.
 */
const RepositoryContext = createContext<Repositories | null>(null);

/**
 * Check if running in Tauri environment.
 */
function isTauriEnvironment(): boolean {
	return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Create repository instances based on environment.
 */
function createRepositories(): Repositories {
	const isTauri = isTauriEnvironment();

	// Always use Zustand adapters for state management
	const jobRepository = new ZustandJobRepository();
	const settingsRepository = new ZustandSettingsRepository();

	if (isTauri) {
		return {
			commandExecutor: new TauriCommandExecutor(),
			fileSystem: new TauriFileSystemRepository(),
			notificationService: new TauriNotificationService(),
			jobRepository,
			settingsRepository,
		};
	}

	// Use mock implementations for development/testing
	console.log("[RepositoryContext] Running in mock mode (Tauri not detected)");
	return {
		commandExecutor: new MockCommandExecutor(),
		fileSystem: new MockFileSystemRepository(),
		notificationService: new MockNotificationService(),
		jobRepository,
		settingsRepository,
	};
}

/**
 * Provider props.
 */
interface RepositoryProviderProps {
	children: ReactNode;
	/**
	 * Optional custom repositories for testing.
	 */
	overrides?: Partial<Repositories>;
}

/**
 * Repository Provider
 *
 * Provides repository implementations to the component tree.
 * Uses Tauri implementations in production, mocks in development.
 *
 * @example
 * ```tsx
 * <RepositoryProvider>
 *   <App />
 * </RepositoryProvider>
 * ```
 */
export function RepositoryProvider({
	children,
	overrides,
}: RepositoryProviderProps): React.ReactElement {
	const repositories = useMemo(() => {
		const repos = createRepositories();

		// Apply any testing overrides
		if (overrides) {
			return { ...repos, ...overrides };
		}

		return repos;
	}, [overrides]);

	return (
		<RepositoryContext.Provider value={repositories}>
			{children}
		</RepositoryContext.Provider>
	);
}

/**
 * Hook to access all repositories.
 *
 * @throws Error if used outside RepositoryProvider
 *
 * @example
 * ```tsx
 * const { commandExecutor, fileSystem } = useRepositories();
 * ```
 */
export function useRepositories(): Repositories {
	const context = useContext(RepositoryContext);

	if (!context) {
		throw new Error("useRepositories must be used within a RepositoryProvider");
	}

	return context;
}

/**
 * Hook to access command executor.
 */
export function useCommandExecutor(): ICommandExecutor {
	return useRepositories().commandExecutor;
}

/**
 * Hook to access file system repository.
 */
export function useFileSystem(): IFileSystemRepository {
	return useRepositories().fileSystem;
}

/**
 * Hook to access notification service.
 */
export function useNotificationService(): INotificationService {
	return useRepositories().notificationService;
}

/**
 * Hook to access job repository.
 */
export function useJobRepository(): IJobRepository {
	return useRepositories().jobRepository;
}

/**
 * Hook to access settings repository.
 */
export function useSettingsRepository(): ISettingsRepository {
	return useRepositories().settingsRepository;
}
