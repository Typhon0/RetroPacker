import type React from "react";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { MockCommandExecutor } from "../../data/repositories/MockCommandExecutor";
import { MockFileSystemRepository } from "../../data/repositories/MockFileSystemRepository";
import { MockNotificationService } from "../../data/repositories/MockNotificationService";
import { TauriCommandExecutor } from "../../data/repositories/TauriCommandExecutor";
import { TauriFileSystemRepository } from "../../data/repositories/TauriFileSystemRepository";
import { TauriNotificationService } from "../../data/repositories/TauriNotificationService";
import { ZustandJobRepository } from "../../data/repositories/ZustandJobRepository";
import { ZustandSettingsRepository } from "../../data/repositories/ZustandSettingsRepository";
import type { ICommandExecutor } from "../../domain/repositories/ICommandExecutor";
import type { IFileSystemRepository } from "../../domain/repositories/IFileSystemRepository";
import type { IJobRepository } from "../../domain/repositories/IJobRepository";
import type { INotificationService } from "../../domain/repositories/INotificationService";
import type { ISettingsRepository } from "../../domain/repositories/ISettingsRepository";

import { ProcessRegistry } from "../../services/ProcessRegistry";

export interface Repositories {
	readonly commandExecutor: ICommandExecutor;
	readonly fileSystem: IFileSystemRepository;
	readonly notificationService: INotificationService;
	readonly jobRepository: IJobRepository;
	readonly settingsRepository: ISettingsRepository;
}

const RepositoryContext = createContext<Repositories | null>(null);

function isTauriEnvironment(): boolean {
	return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function createRepositories(): Repositories {
	const isTauri = isTauriEnvironment();

	// Always use Zustand adapters for state management
	const jobRepository = new ZustandJobRepository();
	const settingsRepository = new ZustandSettingsRepository();

	if (isTauri) {
		const commandExecutor = new TauriCommandExecutor();
		ProcessRegistry.init(commandExecutor);
		return {
			commandExecutor,
			fileSystem: new TauriFileSystemRepository(),
			notificationService: new TauriNotificationService(),
			jobRepository,
			settingsRepository,
		};
	}

	// Use mock implementations for development/testing
	console.log("[RepositoryContext] Running in mock mode (Tauri not detected)");
	const commandExecutor = new MockCommandExecutor();
	ProcessRegistry.init(commandExecutor);
	return {
		commandExecutor,
		fileSystem: new MockFileSystemRepository(),
		notificationService: new MockNotificationService(),
		jobRepository,
		settingsRepository,
	};
}

interface RepositoryProviderProps {
	children: ReactNode;
	overrides?: Partial<Repositories>;
}
export function RepositoryProvider({
	children,
	overrides,
}: RepositoryProviderProps): React.ReactElement {
	const repositories = useMemo(() => {
		const repos = createRepositories();

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

export function useRepositories(): Repositories {
	const context = useContext(RepositoryContext);

	if (!context) {
		throw new Error("useRepositories must be used within a RepositoryProvider");
	}

	return context;
}
