import { mkdir, exists, readDir, open, SeekMode } from "@tauri-apps/plugin-fs";
import { BinaryManagerService } from "./BinaryManagerService";
import { appDataDir, join, dirname } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";
import { DetectSystemUseCase } from "@/domain/usecases/DetectSystemUseCase";
import type { DetectedSystem } from "@/domain/types/platform.types";

class AsyncLimiter {
	private active = 0;
	private queue: Array<() => void> = [];

	constructor(private readonly limit: number) {}

	private async acquire(): Promise<void> {
		if (this.active < this.limit) {
			this.active += 1;
			return;
		}
		await new Promise<void>((resolve) => this.queue.push(resolve));
		this.active += 1;
	}

	private release(): void {
		this.active = Math.max(0, this.active - 1);
		const next = this.queue.shift();
		if (next) next();
	}

	async run<T>(fn: () => Promise<T>): Promise<T> {
		await this.acquire();
		try {
			return await fn();
		} finally {
			this.release();
		}
	}
}

type ReadableHandle = {
	read: (buffer: Uint8Array) => Promise<number | null>;
	close: () => Promise<void>;
	seek?: (offset: number, mode: SeekMode) => Promise<number>;
};

// biome-ignore lint/complexity/noStaticOnlyClass: static utility class is intentional
export class MetadataService {
	private static cacheDir: string | null = null;
	private static readonly TIMEOUT_MS = 3500;
	private static readonly COVER_CONCURRENCY = 4;
	private static readonly coverLimiter = new AsyncLimiter(
		MetadataService.COVER_CONCURRENCY,
	);
	private static readonly coverCache = new Map<string, string | null>();
	private static readonly coverInFlight = new Map<
		string,
		Promise<string | null>
	>();
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

	static async initCache(): Promise<string> {
		if (MetadataService.cacheDir) return MetadataService.cacheDir;
		const appData = await appDataDir();
		MetadataService.cacheDir = await join(appData, "cache", "covers");
		if (!(await exists(MetadataService.cacheDir))) {
			await mkdir(MetadataService.cacheDir, { recursive: true });
		}
		return MetadataService.cacheDir;
	}

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

	static async extractIdViaTools(
		filePath: string,
		system: string,
	): Promise<string | null> {
		const ext = filePath.split(".").pop()?.toLowerCase();

		if (ext === "chd") {
			return MetadataService.parseChdInfo(filePath);
		}

		if (system === "GameCube" || system === "Wii") {
			if (["rvz", "gcz", "wbfs", "iso", "ciso"].includes(ext || "")) {
				return MetadataService.parseDolphinHeader(filePath);
			}
		}

		return null;
	}

	private static async parseChdInfo(filePath: string): Promise<string | null> {
		try {
			const stdout = await BinaryManagerService.execute("chdman", [
				"info",
				"-i",
				filePath,
			]);

			const match = stdout.match(/[A-Z]{4}[-_]?\d{5}/);
			if (match) {
				const id = match[0].replace("_", "-");
				if (!id.includes("-")) {
					return `${id.substring(0, 4)}-${id.substring(4)}`;
				}
				return id;
			}

			return null;
		} catch (e: unknown) {
			console.warn("chdman info failed:", e);
			return null;
		}
	}

	private static async parseDolphinHeader(
		filePath: string,
	): Promise<string | null> {
		try {
			const stdout = await BinaryManagerService.execute("dolphintool", [
				"header",
				"-i",
				filePath,
			]);

			const match = stdout.match(/Game ID:\s*([A-Z0-9]{6})/i);
			if (match) return match[1];

			return null;
		} catch (e: unknown) {
			console.warn("dolphintool header failed:", e);
			return null;
		}
	}

	static async extractGameId(
		filePath: string,
		system: string,
	): Promise<string | null> {
		const toolId = await MetadataService.extractIdViaTools(filePath, system);
		if (toolId) {
			console.log(`[Metadata] Tool extraction success: ${toolId}`);
			return toolId;
		}

		if (system === "GameCube" || system === "Wii") {
			return MetadataService.extractNintendoGameId(filePath);
		}
		if (system === "PSP") {
			return MetadataService.extractPSPGameId(filePath);
		}
		return MetadataService.extractPSGameId(filePath);
	}

	private static async extractPSGameId(
		filePath: string,
	): Promise<string | null> {
		let file: ReadableHandle | null = null;
		try {
			file = (await open(filePath, { read: true })) as ReadableHandle;

			const buffer = new Uint8Array(65536);
			await file.read(buffer);
			const text = new TextDecoder("ascii").decode(buffer);

			const match =
				text.match(/[A-Z]{4}[-_]\d{3}\.?\d{2}/) ||
				text.match(/[A-Z]{4}\s+\d{5}/) ||
				text.match(/[A-Z]{4}[-_]?\d{5}/);

			if (match) {
				return match[0].replace("_", "-").replace(".", "");
			}
			return null;
		} catch {
			return null;
		} finally {
			if (file) await file.close();
		}
	}

	private static async extractPSPGameId(
		filePath: string,
	): Promise<string | null> {
		return MetadataService.extractPSGameId(filePath);
	}

	private static async extractNintendoGameId(
		filePath: string,
	): Promise<string | null> {
		let file: ReadableHandle | null = null;
		try {
			file = (await open(filePath, { read: true })) as ReadableHandle;
			const buffer = new Uint8Array(6);
			await file.read(buffer);
			const id = new TextDecoder("ascii").decode(buffer);
			return /^[A-Z0-9]{6}$/.test(id) ? id : null;
		} catch {
			return null;
		} finally {
			if (file) await file.close();
		}
	}

	static async fetchCover(
		gameId: string | null,
		system: string,
		filePath: string,
	): Promise<string | null> {
		const filename = filePath.split(/[\\/]/).pop() || "";
		const cacheKey = MetadataService.getCoverCacheKey(filePath, gameId, system);

		if (MetadataService.coverCache.has(cacheKey)) {
			return MetadataService.coverCache.get(cacheKey) ?? null;
		}

		const inFlight = MetadataService.coverInFlight.get(cacheKey);
		if (inFlight) return inFlight;

		const task = MetadataService.coverLimiter.run(async () => {
			// 1. Local cover (fast disk check — stays first)
			const localCover = await MetadataService.findLocalCover(filePath);
			if (localCover) {
				console.log(`[Metadata] Found local cover: ${localCover}`);
				const localUrl = convertFileSrc(localCover);
				MetadataService.coverCache.set(cacheKey, localUrl);
				return localUrl;
			}

			// 2. GameTDB + LibRetro in parallel (both are HEAD-check strategies)
			const networkStrategies: Promise<string | null>[] = [];
			if (gameId) {
				networkStrategies.push(MetadataService.tryFetchGameTDB(gameId, system));
			}
			networkStrategies.push(
				MetadataService.tryFetchLibRetro(filename, system),
			);

			const results = await Promise.all(networkStrategies);
			const networkCover = results.find((r) => r !== null) ?? null;
			if (networkCover) {
				MetadataService.coverCache.set(cacheKey, networkCover);
				return networkCover;
			}

			// 3. Scrape fallback (heavy — stays last)
			if (
				gameId &&
				(system === "Wii" ||
					system === "GameCube" ||
					system === "PS2" ||
					system === "PSP")
			) {
				const scraped = await MetadataService.scrapeGameTDB(gameId, system);
				if (scraped) {
					MetadataService.coverCache.set(cacheKey, scraped);
					return scraped;
				}
			}

			console.warn(`[Metadata] All strategies failed for ${filename}`);
			MetadataService.coverCache.set(cacheKey, null);
			return null;
		});

		MetadataService.coverInFlight.set(cacheKey, task);
		try {
			return await task;
		} finally {
			MetadataService.coverInFlight.delete(cacheKey);
		}
	}

	private static async findLocalCover(
		gamePath: string,
	): Promise<string | null> {
		try {
			const dir = await dirname(gamePath);
			const name = gamePath.split(/[\\/]/).pop()?.split(".").shift();

			const files = await readDir(dir);
			const candidates = ["cover", "folder", "front", "box", name];
			const extensions = ["jpg", "png", "jpeg", "bmp"];

			for (const file of files) {
				if (!file.name) continue;
				const lowerName = file.name.toLowerCase();

				for (const cand of candidates) {
					if (!cand) continue;
					for (const ext of extensions) {
						if (lowerName === `${cand.toLowerCase()}.${ext}`) {
							return await join(dir, file.name);
						}
					}
				}
			}
		} catch {
			// Ignore errors
		}
		return null;
	}

	private static async tryFetchGameTDB(
		gameId: string,
		system: string,
	): Promise<string | null> {
		const regions = MetadataService.getGameTdbRegions(gameId);
		const systemCode = MetadataService.mapSystemToGameTDB(system);

		// Build all candidate URLs across regions
		const urls: string[] = [];
		for (const region of regions) {
			urls.push(
				`https://art.gametdb.com/${systemCode}/cover3D/${region}/${gameId}.png`,
				`https://art.gametdb.com/${systemCode}/cover3D/${region}/${gameId}.jpg`,
				`https://art.gametdb.com/${systemCode}/cover/${region}/${gameId}.png`,
				`https://art.gametdb.com/${systemCode}/cover/${region}/${gameId}.jpg`,
			);
		}

		return MetadataService.checkFirstUrl(urls);
	}

	private static async tryFetchLibRetro(
		filename: string,
		system: string,
	): Promise<string | null> {
		const repo = MetadataService.mapSystemToLibRetro(system);
		if (!repo) return null;

		const base = `https://raw.githubusercontent.com/libretro-thumbnails/${repo}/master/Named_Boxarts`;

		const cleanName = filename.replace(
			/(?:\.(iso|bin|cue|chd|rvz|gcz|wbfs|gcm|gdi|toc|nkit))+$/i,
			"",
		);

		const exact = cleanName.replace(/[&*/:`<>?|\"]/g, "_");
		const noRegion = exact.replace(/\s*\(.*?\)\s*/g, "").trim();
		const safe = noRegion.replace(/\s+/g, "_");

		const candidateNames = new Set([
			`${encodeURIComponent(exact)}.png`,
			`${encodeURIComponent(noRegion)}.png`,
			`${encodeURIComponent(safe)}.png`,
			`${encodeURIComponent(exact.replace(/_v[\d\.]+$/, ""))}.png`,
		]);

		const urls = [...candidateNames].map((cand) => `${base}/${cand}`);
		const result = await MetadataService.checkFirstUrl(urls);
		if (result) {
			console.log(`[Metadata] Found LibRetro match: ${result}`);
		}
		return result;
	}

	private static async scrapeGameTDB(
		gameId: string,
		system: string,
	): Promise<string | null> {
		try {
			const platform = system === "GameCube" ? "Wii" : system;
			const url = `https://www.gametdb.com/${platform}/${gameId}`;

			const response = await fetch(url, {
				method: "GET",
				headers: { "User-Agent": "RetroPacker/1.0" },
			});

			if (!response.ok) return null;
			const text = await response.text();

			const match = text.match(
				/src="(\/gfx\/cover\/[a-zA-Z0-9]+\/[A-Za-z0-9]+\.jpg)"/,
			);
			if (match) {
				return `https://www.gametdb.com${match[1]}`;
			}
		} catch {
			/* ignore */
		}
		return null;
	}

	private static async checkUrl(url: string): Promise<boolean> {
		try {
			const controller = new AbortController();
			const id = setTimeout(
				() => controller.abort(),
				MetadataService.TIMEOUT_MS,
			);

			const response = await fetch(url, {
				method: "HEAD",
				signal: controller.signal,
			});

			clearTimeout(id);
			return response.ok && response.status === 200;
		} catch {
			return false;
		}
	}

	/**
	 * Fire HEAD requests for all URLs concurrently.
	 * Returns the first URL that responds 200, or null if all fail.
	 */
	private static async checkFirstUrl(urls: string[]): Promise<string | null> {
		if (urls.length === 0) return null;

		try {
			return await Promise.any(
				urls.map(async (url) => {
					const ok = await MetadataService.checkUrl(url);
					if (ok) return url;
					throw new Error("not found");
				}),
			);
		} catch {
			// AggregateError — all URLs failed
			return null;
		}
	}

	private static getGameTdbRegions(gameId: string): string[] {
		const char = gameId[3]?.toUpperCase();
		switch (char) {
			case "E":
				return ["US", "EN"];
			case "J":
				return ["JA"];
			case "P":
				return ["EN", "FR", "DE", "ES", "IT", "AU"];
			default:
				return ["US", "EN", "JA"];
		}
	}

	private static mapSystemToGameTDB(system: string): string {
		const map: Record<string, string> = {
			PS1: "psx",
			PS2: "ps2",
			PSP: "psp",
			GameCube: "wii",
			Wii: "wii",
			Dreamcast: "dc",
			Saturn: "ss",
		};
		return map[system] || system.toLowerCase();
	}

	private static mapSystemToLibRetro(system: string): string {
		const map: Record<string, string> = {
			PS1: "Sony_-_PlayStation",
			PS2: "Sony_-_PlayStation_2",
			PSP: "Sony_-_PlayStation_Portable",
			GameCube: "Nintendo_-_GameCube",
			Wii: "Nintendo_-_Wii",
			Dreamcast: "Sega_-_Dreamcast",
			Saturn: "Sega_-_Saturn",
		};
		return map[system] || "";
	}

	private static getCoverCacheKey(
		filePath: string,
		gameId: string | null,
		system: string,
	): string {
		return `${system}::${gameId ?? ""}::${filePath}`;
	}
}
