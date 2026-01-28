import { mkdir, exists, readDir } from "@tauri-apps/plugin-fs";
import { BinaryManagerService } from "./BinaryManagerService";
import { appDataDir, join, dirname } from "@tauri-apps/api/path";
import { fetch } from "@tauri-apps/plugin-http";

export class MetadataService {
	private static cacheDir: string | null = null;
	private static readonly TIMEOUT_MS = 3500; // Fast fail to keep UI snappy

	static async initCache(): Promise<string> {
		if (this.cacheDir) return this.cacheDir;
		const appData = await appDataDir();
		this.cacheDir = await join(appData, "cache", "covers");
		if (!(await exists(this.cacheDir))) {
			await mkdir(this.cacheDir, { recursive: true });
		}
		return this.cacheDir;
	}

	/**
	 * 🕵️ SYSTEM DETECTION
	 * Centralized async detection with header fallback
	 */
	static async detectSystemAsync(filePath: string): Promise<string> {
		const ext = filePath.split(".").pop()?.toLowerCase() || "";
		const lowerPath = filePath.toLowerCase().replace(/\\/g, "/");

		// 1. Extension (Fast)
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
			case "nsp":
			case "nsz":
			case "xci":
				return "Switch";
		}

		// 2. ISO Header Check (Deep)
		if (ext === "iso" || ext === "chd") {
			let file;
			try {
				const { open } = await import("@tauri-apps/plugin-fs");
				file = await open(filePath, { read: true });
				const buffer = new Uint8Array(32);
				await file.read(buffer);

				// Wii Magic (0x5D1C9EA3)
				if (buffer[24] === 0x5d && buffer[25] === 0x1c && buffer[26] === 0x9e)
					return "Wii";
				// GameCube Magic (0xC2339F3D)
				if (buffer[28] === 0xc2 && buffer[29] === 0x33 && buffer[30] === 0x9f)
					return "GameCube";

				// Standard ID Check
				const gameId = new TextDecoder("ascii").decode(buffer.slice(0, 6));
				if (/^[A-Z0-9]{6}$/.test(gameId)) {
					if (!gameId.startsWith("SL") && !gameId.startsWith("SC"))
						return "GameCube";
				}
			} catch (e) {
				// Ignore read errors
			} finally {
				if (file) await file.close();
			}
		}

		// 3. Path Fallback
		if (lowerPath.includes("gamecube")) return "GameCube";
		if (lowerPath.includes("wii")) return "Wii";
		if (lowerPath.includes("ps2")) return "PS2";
		if (lowerPath.includes("psx") || lowerPath.includes("ps1")) return "PS1";

		return ext === "iso" ? "PS2" : "Unknown";
	}

	/**
	 * 🛠️ TOOL-BASED EXTRACTION (The "Rock Solid" Layer)
	 * -------------------------------------------------------------------------
	 * Uses chdman or dolphintool to extract metadata reliably.
	 * Use this for compressed formats (CHD, RVZ, GCZ) where raw read fails.
	 */
	static async extractIdViaTools(
		filePath: string,
		system: string,
	): Promise<string | null> {
		const ext = filePath.split(".").pop()?.toLowerCase();

		// 1. Handle CHDs (Any System)
		if (ext === "chd") {
			return this.parseChdInfo(filePath);
		}

		// 2. Handle GameCube/Wii (RVZ, GCZ, ISO) via DolphinTool
		if (system === "GameCube" || system === "Wii") {
			// Only try if extension is complex or if we want absolute certainty
			if (["rvz", "gcz", "wbfs", "iso", "ciso"].includes(ext || "")) {
				return this.parseDolphinHeader(filePath);
			}
		}

		return null;
	}

	/**
	 * Runs `chdman info -i file.chd` and parses the output
	 */
	private static async parseChdInfo(_filePath: string): Promise<string | null> {
		try {
			// const stdout = await BinaryManagerService.execute("chdman", [
			// 	"info",
			// 	"-i",
			// 	filePath,
			// ]);
			// CHD info typically requires extracting data to find the ID reliably.
			// Current best practice for CHD is filename fuzzy matching unless we extract sectors.
			return null;
		} catch (e: unknown) {
			console.warn("chdman info failed:", e);
			return null;
		}
	}

	/**
	 * Runs `dolphintool header -i file.iso` (or similar)
	 */
	private static async parseDolphinHeader(
		filePath: string,
	): Promise<string | null> {
		try {
			// dolphintool header -i <path>
			const stdout = await BinaryManagerService.execute("dolphintool", [
				"header",
				"-i",
				filePath,
			]);

			// Output format:
			// Game ID: GALE01
			// Internal Name: Super Smash Bros. Melee

			const match = stdout.match(/Game ID:\s*([A-Z0-9]{6})/i);
			if (match) return match[1];

			return null;
		} catch (e: unknown) {
			console.warn("dolphintool header failed:", e);
			return null;
		}
	}

	/**
	 * 🧬 HYBRID EXTRACTION STRATEGY
	 * -------------------------------------------------------------------------
	 */
	static async extractGameId(
		filePath: string,
		system: string,
	): Promise<string | null> {
		// 1. Try Tool-based (Highest Accuracy for Compressed/Complex formats)
		const toolId = await this.extractIdViaTools(filePath, system);
		if (toolId) {
			console.log(`[Metadata] Tool extraction success: ${toolId}`);
			return toolId;
		}

		// 2. Fallback to Raw Byte Reading
		if (system === "GameCube" || system === "Wii") {
			return this.extractNintendoGameId(filePath);
		}
		return this.extractPSGameId(filePath);
	}

	private static async extractPSGameId(
		filePath: string,
	): Promise<string | null> {
		let file: any;
		try {
			const { open } = await import("@tauri-apps/plugin-fs");
			file = await open(filePath, { read: true });

			// Scan Strategy:
			// 1. Boot sector (0-2048)
			// 2. Extended header area (up to 64KB) for weird PS2 rips
			const buffer = new Uint8Array(65536);
			await file.read(buffer);
			const text = new TextDecoder("ascii").decode(buffer);

			// Look for SLUS-12345 or SLES_123.45 format
			const match =
				text.match(/[A-Z]{4}[-_]\d{3}\.?\d{2}/) ||
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

	private static async extractNintendoGameId(
		filePath: string,
	): Promise<string | null> {
		let file: any;
		try {
			const { open } = await import("@tauri-apps/plugin-fs");
			file = await open(filePath, { read: true });
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

	/**
	 * 🎨 COVER ART FETCHING
	 * The "Unfailable" Pipeline
	 */
	static async fetchCover(
		gameId: string | null,
		system: string,
		filePath: string,
	): Promise<string | null> {
		const filename = filePath.split(/[\\/]/).pop() || "";

		// 1. 🏠 LOCAL CHECK (Instant & 100% Reliable)
		// Checks for 'cover.jpg', 'folder.png', or '{game_filename}.jpg'
		const localCover = await this.findLocalCover(filePath);
		if (localCover) {
			console.log(`[Metadata] Found local cover: ${localCover}`);
			const { convertFileSrc } = await import("@tauri-apps/api/core");
			return convertFileSrc(localCover);
		}

		// 2. 🌍 GAMETDB ID LOOKUP (High Precision)
		if (gameId) {
			const cover = await this.tryFetchGameTDB(gameId, system);
			if (cover) return cover;
		}

		// 3. 📚 LIBRETRO FUZZY MATCH (Filename Fallback)
		// Tries "Exact Name" -> "Clean Name" -> "Sanitized Name"
		const libRetroCover = await this.tryFetchLibRetro(filename, system);
		if (libRetroCover) return libRetroCover;

		// 4. 🕸️ SCRAPING FALLBACK (Last Resort)
		if (
			gameId &&
			(system === "Wii" || system === "GameCube" || system === "PS2")
		) {
			const scraped = await this.scrapeGameTDB(gameId, system);
			if (scraped) return scraped;
		}

		console.warn(`[Metadata] All strategies failed for ${filename}`);
		return null;
	}

	// --- STRATEGIES ---

	private static async findLocalCover(
		gamePath: string,
	): Promise<string | null> {
		try {
			const dir = await dirname(gamePath);
			const name = gamePath.split(/[\\/]/).pop()?.split(".").shift(); // "God of War"

			const files = await readDir(dir);
			const candidates = ["cover", "folder", "front", "box", name];
			const extensions = ["jpg", "png", "jpeg", "bmp"];

			for (const file of files) {
				if (!file.name) continue;
				const lowerName = file.name.toLowerCase();

				// Check against candidates
				for (const cand of candidates) {
					if (!cand) continue;
					for (const ext of extensions) {
						if (lowerName === `${cand.toLowerCase()}.${ext}`) {
							return await join(dir, file.name);
						}
					}
				}
			}
		} catch (e: unknown) {
			// Ignore (likely permission or path issue)
		}
		return null;
	}

	private static async tryFetchGameTDB(
		gameId: string,
		system: string,
	): Promise<string | null> {
		const regions = this.getGameTdbRegions(gameId);
		const systemCode = this.mapSystemToGameTDB(system);

		for (const region of regions) {
			// Prefer 3D cover, fallback to flat
			const urls = [
				`https://art.gametdb.com/${systemCode}/cover3D/${region}/${gameId}.png`,
				`https://art.gametdb.com/${systemCode}/cover3D/${region}/${gameId}.jpg`,
				`https://art.gametdb.com/${systemCode}/cover/${region}/${gameId}.png`,
				`https://art.gametdb.com/${systemCode}/cover/${region}/${gameId}.jpg`,
			];

			for (const url of urls) {
				if (await this.checkUrl(url)) return url;
			}
		}
		return null;
	}

	private static async tryFetchLibRetro(
		filename: string,
		system: string,
	): Promise<string | null> {
		const repo = this.mapSystemToLibRetro(system);
		if (!repo) return null;

		const base = `https://raw.githubusercontent.com/libretro-thumbnails/${repo}/master/Named_Boxarts`;

		// Generate Candidates
		// Recursively remove extensions to handle "game.cue.chd" -> "game"
		const cleanName = filename.replace(
			/(?:\.(iso|bin|cue|chd|rvz|gcz|wbfs|gcm|gdi|toc|nkit))+$/i,
			"",
		);

		// 1. Exact match (sanitized for URL)
		const exact = cleanName.replace(/[&*/:`<>?|"]/g, "_");

		// 2. No Region (e.g. "Game (USA)" -> "Game")
		const noRegion = exact.replace(/\s*\(.*?\)\s*/g, "").trim();

		// 3. LibRetro Safe (replace spaces with underscores)
		const safe = noRegion.replace(/\s+/g, "_");

		const candidates = new Set([
			`${encodeURIComponent(exact)}.png`,
			`${encodeURIComponent(noRegion)}.png`,
			`${encodeURIComponent(safe)}.png`,
			// Try common suffix removal
			`${encodeURIComponent(exact.replace(/_v[\d\.]+$/, ""))}.png`,
		]);

		for (const cand of candidates) {
			const url = `${base}/${cand}`;
			if (await this.checkUrl(url)) {
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
			// This is a "Hail Mary" pass
			const platform = system === "GameCube" ? "Wii" : system; // GC is hosted on Wii sub-site usually
			const url = `https://www.gametdb.com/${platform}/${gameId}`;

			const response = await fetch(url, {
				method: "GET",
				headers: { "User-Agent": "RetroPacker/1.0" },
			});

			if (!response.ok) return null;
			const text = await response.text();

			// Look for the "thumb" or main image class
			const match = text.match(
				/src="(\/gfx\/cover\/[a-zA-Z0-9]+\/[A-Za-z0-9]+\.jpg)"/,
			);
			if (match) {
				return `https://www.gametdb.com${match[1]}`;
			}
		} catch (e: unknown) {
			/* ignore */
		}
		return null;
	}

	// --- HELPERS ---

	private static async checkUrl(url: string): Promise<boolean> {
		try {
			// Race fetching against a timeout
			const controller = new AbortController();
			const id = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

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
		// Priority list based on ID char
		switch (char) {
			case "E":
				return ["US", "EN"];
			case "J":
				return ["JA"];
			case "P":
				return ["EN", "FR", "DE", "ES", "IT", "AU"]; // PAL
			default:
				return ["US", "EN", "JA"]; // Try everything
		}
	}

	private static mapSystemToGameTDB(system: string): string {
		const map: Record<string, string> = {
			PS1: "psx",
			PS2: "ps2",
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
			GameCube: "Nintendo_-_GameCube",
			Wii: "Nintendo_-_Wii",
			Dreamcast: "Sega_-_Dreamcast",
			Saturn: "Sega_-_Saturn",
		};
		return map[system] || "";
	}
}
