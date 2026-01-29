import { mkdir, exists, readDir } from "@tauri-apps/plugin-fs";
import { BinaryManagerService } from "./BinaryManagerService";
import { appDataDir, join, dirname } from "@tauri-apps/api/path";
import { fetch } from "@tauri-apps/plugin-http";

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

	static async initCache(): Promise<string> {
		if (MetadataService.cacheDir) return MetadataService.cacheDir;
		const appData = await appDataDir();
		MetadataService.cacheDir = await join(appData, "cache", "covers");
		if (!(await exists(MetadataService.cacheDir))) {
			await mkdir(MetadataService.cacheDir, { recursive: true });
		}
		return MetadataService.cacheDir;
	}

	static async detectSystemAsync(filePath: string): Promise<string> {
		const ext = filePath.split(".").pop()?.toLowerCase() || "";
		const lowerPath = filePath.toLowerCase().replace(/\\/g, "/");

		switch (ext) {
			case "gdi":
				return "Dreamcast";
			case "gcm":
				return "GameCube";
			case "wbfs":
				return "Wii";
			case "rvz":
				return lowerPath.includes("wii") ? "Wii" : "GameCube";
			case "cue":
			case "bin":
				return "PS1";
			case "cso":
				return "PSP";
			case "nsp":
			case "nsz":
			case "xci":
				return "Switch";
		}

		if (ext === "iso" || ext === "chd" || ext === "cso") {
			let file: ReadableHandle | null = null;
			try {
				const { open } = await import("@tauri-apps/plugin-fs");
				file = (await open(filePath, { read: true })) as ReadableHandle;
				const buffer = new Uint8Array(32768 + 64);
				await file.read(buffer);

				if (
					buffer[0x8000] === 0x50 &&
					buffer[0x8001] === 0x53 &&
					buffer[0x8002] === 0x50
				) {
					return "PSP";
				}

				if (
					buffer[0] === 0x43 &&
					buffer[1] === 0x49 &&
					buffer[2] === 0x53 &&
					buffer[3] === 0x4f
				) {
					return "PSP";
				}

				if (
					buffer[24] === 0x5d &&
					buffer[25] === 0x1c &&
					buffer[26] === 0x9e
				)
					return "Wii";

				if (
					buffer[28] === 0xc2 &&
					buffer[29] === 0x33 &&
					buffer[30] === 0x9f
				)
					return "GameCube";

				const gameId = new TextDecoder("ascii").decode(buffer.slice(0, 6));
				if (/^[A-Z0-9]{6}$/.test(gameId)) {
					if (!gameId.startsWith("SL") && !gameId.startsWith("SC"))
						return "GameCube";
				}
			} catch {
				// Ignore read errors
			} finally {
				if (file) await file.close();
			}
		}

		if (lowerPath.includes("gamecube")) return "GameCube";
		if (lowerPath.includes("wii")) return "Wii";
		if (lowerPath.includes("psp")) return "PSP";
		if (lowerPath.includes("ps2")) return "PS2";
		if (lowerPath.includes("psx") || lowerPath.includes("ps1")) return "PS1";

		return ext === "iso" ? "PS2" : "Unknown";
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

	private static async parseChdInfo(
		filePath: string,
	): Promise<string | null> {
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
			const { open } = await import("@tauri-apps/plugin-fs");
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
			const { open } = await import("@tauri-apps/plugin-fs");
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
			const localCover = await MetadataService.findLocalCover(filePath);
			if (localCover) {
				console.log(`[Metadata] Found local cover: ${localCover}`);
				const { convertFileSrc } = await import("@tauri-apps/api/core");
				const localUrl = convertFileSrc(localCover);
				MetadataService.coverCache.set(cacheKey, localUrl);
				return localUrl;
			}

			if (gameId) {
				const cover = await MetadataService.tryFetchGameTDB(gameId, system);
				if (cover) {
					MetadataService.coverCache.set(cacheKey, cover);
					return cover;
				}
			}

			const libRetroCover = await MetadataService.tryFetchLibRetro(
				filename,
				system,
			);
			if (libRetroCover) {
				MetadataService.coverCache.set(cacheKey, libRetroCover);
				return libRetroCover;
			}

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

		for (const region of regions) {
			const urls = [
				`https://art.gametdb.com/${systemCode}/cover3D/${region}/${gameId}.png`,
				`https://art.gametdb.com/${systemCode}/cover3D/${region}/${gameId}.jpg`,
				`https://art.gametdb.com/${systemCode}/cover/${region}/${gameId}.png`,
				`https://art.gametdb.com/${systemCode}/cover/${region}/${gameId}.jpg`,
			];

			for (const url of urls) {
				if (await MetadataService.checkUrl(url)) return url;
			}
		}
		return null;
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

		const candidates = new Set([
			`${encodeURIComponent(exact)}.png`,
			`${encodeURIComponent(noRegion)}.png`,
			`${encodeURIComponent(safe)}.png`,
			`${encodeURIComponent(exact.replace(/_v[\d\.]+$/, ""))}.png`,
		]);

		for (const cand of candidates) {
			const url = `${base}/${cand}`;
			if (await MetadataService.checkUrl(url)) {
				console.log(`[Metadata] Found LibRetro match: ${cand}`);
				return url;
			}
		}
		return null;
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
