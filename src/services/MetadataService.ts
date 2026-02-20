import { open, SeekMode } from "@tauri-apps/plugin-fs";
import { DetectSystemUseCase } from "@/domain/usecases/DetectSystemUseCase";
import type { DetectedSystem } from "@/domain/types/platform.types";
import { GameIdExtractor } from "./GameIdExtractor";
import { CoverArtService } from "./CoverArtService";

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
		},
	});

	static async detectSystemAsync(filePath: string): Promise<DetectedSystem> {
		const detected =
			await MetadataService.detectSystemUseCase.execute(filePath);

		// CHD is a container format; use path hints to recover likely platform labels.
		if (detected === "CHD") {
			const inferred = MetadataService.detectSystemUseCase.detectSync(filePath);
			if (inferred !== "Unknown") {
				return inferred;
			}
		}

		return detected;
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
