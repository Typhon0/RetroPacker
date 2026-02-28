import { dirname, join } from "@tauri-apps/api/path";
import { exists, open, readTextFile, SeekMode } from "@tauri-apps/plugin-fs";
import type { DetectedSystem } from "@/domain/types/platform.types";
import { DetectSystemUseCase } from "@/domain/usecases/DetectSystemUseCase";
import { CoverArtService } from "./CoverArtService";
import { GameIdExtractor } from "./GameIdExtractor";

type ReadableHandle = {
	read: (buffer: Uint8Array) => Promise<number | null>;
	close: () => Promise<void>;
	seek?: (offset: number, mode: SeekMode) => Promise<number>;
};

/**
 * Thin facade over system detection, game ID extraction, and cover art fetching.
 * Delegates to:
 *  - DetectSystemUseCase for platform detection
 *  - GameIdExtractor for game ID extraction
 *  - CoverArtService for cover art fetching
 */
export class MetadataService {
	private static readonly detectSystemUseCase = new DetectSystemUseCase({
		fileSystem: {
			readBytes: async (
				path: string,
				offset?: number,
				length?: number,
			): Promise<Uint8Array> => {
				const file = (await open(path, { read: true })) as ReadableHandle;
				try {
					if (offset !== undefined && offset > 0 && file.seek) {
						await file.seek(offset, SeekMode.Start);
					}
					const buffer = new Uint8Array(length ?? 2048);
					await file.read(buffer);
					return buffer;
				} finally {
					await file.close();
				}
			},
			readTextFile: async (path: string): Promise<string> => {
				return readTextFile(path);
			},
			readText: async (path: string, maxBytes?: number): Promise<string> => {
				const content = await readTextFile(path);
				if (maxBytes === undefined || maxBytes <= 0) {
					return content;
				}
				return content.slice(0, maxBytes);
			},
			exists: async (path: string): Promise<boolean> => {
				return exists(path);
			},
			dirname: async (path: string): Promise<string> => {
				return dirname(path);
			},
			joinPath: async (...segments: string[]): Promise<string> => {
				if (segments.length === 0) return "";
				if (segments.length === 1) return segments[0];
				let result = segments[0];
				for (let i = 1; i < segments.length; i++) {
					result = await join(result, segments[i]);
				}
				return result;
			},
		},
		// No commandExecutor — MetadataService runs without CLI tools
	});

	static async detectSystemAsync(filePath: string): Promise<DetectedSystem> {
		return MetadataService.detectSystemUseCase.execute(filePath);
	}

	/** @deprecated Use GameIdExtractor.extractGameId directly */
	static async extractGameId(
		filePath: string,
		system: string,
	): Promise<string | null> {
		return GameIdExtractor.extractGameId(filePath, system);
	}

	/** @deprecated Use GameIdExtractor.extractIdViaTools directly */
	static async extractIdViaTools(
		filePath: string,
		system: string,
	): Promise<string | null> {
		return GameIdExtractor.extractIdViaTools(filePath, system);
	}

	/** @deprecated Use CoverArtService.initCache directly */
	static async initCache(): Promise<string> {
		return CoverArtService.initCache();
	}

	/** @deprecated Use CoverArtService.fetchCover directly */
	static async fetchCover(
		gameId: string | null,
		system: string,
		filePath: string,
	): Promise<string | null> {
		return CoverArtService.fetchCover(gameId, system, filePath);
	}
}
