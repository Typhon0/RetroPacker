import { mkdir, exists } from "@tauri-apps/plugin-fs";
import { appDataDir, join, dirname } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";

class AsyncLimiter {
    private active = 0;
    private readonly pending: Array<() => void> = [];

    constructor(private readonly limit: number) { }

    private async acquire(): Promise<void> {
        if (this.active < this.limit) {
            this.active += 1;
            return;
        }
        // Park until a slot opens. The slot is reserved by the
        // resolver in release(), so we don't increment here.
        await new Promise<void>((resolve) => this.pending.push(resolve));
    }

    private release(): void {
        const next = this.pending.shift();
        if (next) {
            // Hand the slot directly to the next waiter (active count stays the same)
            next();
        } else {
            this.active = Math.max(0, this.active - 1);
        }
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

/**
 * Fetches game cover art from local files, GameTDB, LibRetro Thumbnails,
 * and web scraping. Manages caching and concurrency.
 */
export class CoverArtService {
    private static cacheDir: string | null = null;
    private static readonly TIMEOUT_MS = 3500;
    private static readonly COVER_CONCURRENCY = 4;
    private static readonly coverLimiter = new AsyncLimiter(
        CoverArtService.COVER_CONCURRENCY,
    );
    private static readonly coverCache = new Map<string, string | null>();
    private static readonly coverInFlight = new Map<
        string,
        Promise<string | null>
    >();

    static async initCache(): Promise<string> {
        if (CoverArtService.cacheDir) return CoverArtService.cacheDir;
        const appData = await appDataDir();
        CoverArtService.cacheDir = await join(appData, "cache", "covers");
        if (!(await exists(CoverArtService.cacheDir))) {
            await mkdir(CoverArtService.cacheDir, { recursive: true });
        }
        return CoverArtService.cacheDir;
    }

    static async fetchCover(
        gameId: string | null,
        system: string,
        filePath: string,
    ): Promise<string | null> {
        const filename = filePath.split(/[\\/]/).pop() || "";
        const cacheKey = CoverArtService.getCoverCacheKey(filePath, gameId, system);

        if (CoverArtService.coverCache.has(cacheKey)) {
            return CoverArtService.coverCache.get(cacheKey) ?? null;
        }

        const inFlight = CoverArtService.coverInFlight.get(cacheKey);
        if (inFlight) return inFlight;

        const task = CoverArtService.coverLimiter.run(async () => {
            // 1. Local cover (fast disk check — stays first)
            const localCover = await CoverArtService.findLocalCover(filePath);
            if (localCover) {
                console.log(`[CoverArt] Found local cover: ${localCover}`);
                const localUrl = convertFileSrc(localCover);
                CoverArtService.coverCache.set(cacheKey, localUrl);
                return localUrl;
            }

            // 2. GameTDB + LibRetro in parallel (both are HEAD-check strategies)
            const networkStrategies: Promise<string | null>[] = [];
            if (gameId) {
                networkStrategies.push(CoverArtService.tryFetchGameTDB(gameId, system));
            }
            networkStrategies.push(
                CoverArtService.tryFetchLibRetro(filename, system),
            );

            const results = await Promise.all(networkStrategies);
            const networkCover = results.find((r) => r !== null) ?? null;
            if (networkCover) {
                CoverArtService.coverCache.set(cacheKey, networkCover);
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
                const scraped = await CoverArtService.scrapeGameTDB(gameId, system);
                if (scraped) {
                    CoverArtService.coverCache.set(cacheKey, scraped);
                    return scraped;
                }
            }

            console.warn(`[CoverArt] All strategies failed for ${filename}`);
            CoverArtService.coverCache.set(cacheKey, null);
            return null;
        });

        CoverArtService.coverInFlight.set(cacheKey, task);
        try {
            return await task;
        } finally {
            CoverArtService.coverInFlight.delete(cacheKey);
        }
    }

    private static async findLocalCover(
        gamePath: string,
    ): Promise<string | null> {
        try {
            const dir = await dirname(gamePath);
            const name = gamePath.split(/[\\/]/).pop()?.split(".").shift();

            const candidates = ["cover", "folder", "front", "box", name];
            const extensions = ["jpg", "png", "jpeg", "bmp"];

            // Check specific filenames via exists() instead of listing the directory
            for (const cand of candidates) {
                if (!cand) continue;
                for (const ext of extensions) {
                    const candidatePath = await join(dir, `${cand}.${ext}`);
                    if (await exists(candidatePath)) {
                        return candidatePath;
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
        const regions = CoverArtService.getGameTdbRegions(gameId);
        const systemCode = CoverArtService.mapSystemToGameTDB(system);

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

        return CoverArtService.checkFirstUrl(urls);
    }

    private static async tryFetchLibRetro(
        filename: string,
        system: string,
    ): Promise<string | null> {
        const repo = CoverArtService.mapSystemToLibRetro(system);
        if (!repo) return null;

        const base = `https://raw.githubusercontent.com/libretro-thumbnails/${repo}/master/Named_Boxarts`;

        const cleanName = filename.replace(
            /(?:\.(iso|bin|cue|chd|rvz|gcz|wbfs|gcm|gdi|toc|nkit))+$/i,
            "",
        );

        const exact = cleanName.replace(/[&*/:`<>?|\\"]/g, "_");
        const noRegion = exact.replace(/\s*\(.*?\)\s*/g, "").trim();
        const safe = noRegion.replace(/\s+/g, "_");

        const candidateNames = new Set([
            `${encodeURIComponent(exact)}.png`,
            `${encodeURIComponent(noRegion)}.png`,
            `${encodeURIComponent(safe)}.png`,
            `${encodeURIComponent(exact.replace(/_v[\d\.]+$/, ""))}.png`,
        ]);

        const urls = [...candidateNames].map((cand) => `${base}/${cand}`);
        const result = await CoverArtService.checkFirstUrl(urls);
        if (result) {
            console.log(`[CoverArt] Found LibRetro match: ${result}`);
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
                CoverArtService.TIMEOUT_MS,
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
     * Try HEAD requests sequentially for each URL.
     * Returns the first URL that responds 200, or null if all fail.
     * Sequential to avoid firing dozens of HEAD requests simultaneously.
     */
    private static async checkFirstUrl(urls: string[]): Promise<string | null> {
        for (const url of urls) {
            const ok = await CoverArtService.checkUrl(url);
            if (ok) return url;
        }
        return null;
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
