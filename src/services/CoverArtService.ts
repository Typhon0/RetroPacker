import type { IFileSystemRepository } from "@/domain/repositories/IFileSystemRepository";
import type { IHttpRepository } from "@/domain/repositories/IHttpRepository";
import { isDvdSystem, isNintendoSystem } from "@/domain/types/platform.types";

interface AsyncLimiterState {
	active: number;
	pending: Array<() => void>;
}

interface CoverArtDependencies {
	readonly fileSystem: Pick<
		IFileSystemRepository,
		| "createDirectory"
		| "dirname"
		| "exists"
		| "joinPath"
		| "convertFileSource"
		| "getAppDataDir"
	>;
	readonly httpRepository: Pick<IHttpRepository, "fetch">;
}

const TIMEOUT_MS = 3500;
const COVER_CONCURRENCY = 4;

const coverLimiterState: AsyncLimiterState = {
	active: 0,
	pending: [],
};

const coverCache = new Map<string, string | null>();
const coverInFlight = new Map<string, Promise<string | null>>();
let cacheDir: string | null = null;

async function runLimited<T>(fn: () => Promise<T>): Promise<T> {
	await acquireSlot();
	try {
		return await fn();
	} finally {
		releaseSlot();
	}
}

async function acquireSlot(): Promise<void> {
	if (coverLimiterState.active < COVER_CONCURRENCY) {
		coverLimiterState.active += 1;
		return;
	}

	await new Promise<void>((resolve) => {
		coverLimiterState.pending.push(resolve);
	});
}

function releaseSlot(): void {
	const next = coverLimiterState.pending.shift();
	if (next) {
		next();
		return;
	}

	coverLimiterState.active = Math.max(0, coverLimiterState.active - 1);
}

export async function initCoverCache(
	deps: CoverArtDependencies,
): Promise<string> {
	if (cacheDir) {
		return cacheDir;
	}

	const appData = await deps.fileSystem.getAppDataDir();
	cacheDir = await deps.fileSystem.joinPath(appData, "cache", "covers");
	if (!(await deps.fileSystem.exists(cacheDir))) {
		await deps.fileSystem.createDirectory(cacheDir);
	}

	return cacheDir;
}

export async function fetchCover(
	gameId: string | null,
	system: string,
	filePath: string,
	deps: CoverArtDependencies,
): Promise<string | null> {
	const filename = filePath.split(/[\\/]/).pop() || "";
	const cacheKey = getCoverCacheKey(filePath, gameId, system);

	if (coverCache.has(cacheKey)) {
		return coverCache.get(cacheKey) ?? null;
	}

	const inFlight = coverInFlight.get(cacheKey);
	if (inFlight) {
		return inFlight;
	}

	const task = runLimited(async () => {
		const localCover = await findLocalCover(filePath, deps.fileSystem);
		if (localCover) {
			console.log(`[CoverArt] Found local cover: ${localCover}`);
			const localUrl = deps.fileSystem.convertFileSource(localCover);
			coverCache.set(cacheKey, localUrl);
			return localUrl;
		}

		const networkStrategies: Promise<string | null>[] = [];
		if (gameId) {
			networkStrategies.push(
				tryFetchGameTDB(gameId, system, deps.httpRepository),
			);
		}
		networkStrategies.push(
			tryFetchLibRetro(filename, system, deps.httpRepository),
		);

		const results = await Promise.all(networkStrategies);
		const networkCover = results.find((r) => r !== null) ?? null;
		if (networkCover) {
			coverCache.set(cacheKey, networkCover);
			return networkCover;
		}

		if (gameId && (isNintendoSystem(system) || isDvdSystem(system))) {
			const scraped = await scrapeGameTDB(gameId, system, deps.httpRepository);
			if (scraped) {
				coverCache.set(cacheKey, scraped);
				return scraped;
			}
		}

		console.warn(`[CoverArt] All strategies failed for ${filename}`);
		coverCache.set(cacheKey, null);
		return null;
	});

	coverInFlight.set(cacheKey, task);
	try {
		return await task;
	} finally {
		coverInFlight.delete(cacheKey);
	}
}

async function findLocalCover(
	gamePath: string,
	fileSystem: Pick<IFileSystemRepository, "dirname" | "exists" | "joinPath">,
): Promise<string | null> {
	try {
		const dir = await fileSystem.dirname(gamePath);
		const name = gamePath.split(/[\\/]/).pop()?.split(".").shift();

		const candidates = ["cover", "folder", "front", "box", name];
		const extensions = ["jpg", "png", "jpeg", "bmp"];

		for (const candidate of candidates) {
			if (!candidate) {
				continue;
			}
			for (const ext of extensions) {
				const candidatePath = await fileSystem.joinPath(
					dir,
					`${candidate}.${ext}`,
				);
				if (await fileSystem.exists(candidatePath)) {
					return candidatePath;
				}
			}
		}
	} catch {
		// Ignore local cover scan errors.
	}

	return null;
}

async function tryFetchGameTDB(
	gameId: string,
	system: string,
	httpRepository: Pick<IHttpRepository, "fetch">,
): Promise<string | null> {
	const regions = getGameTdbRegions(gameId);
	const systemCode = mapSystemToGameTDB(system);

	const urls: string[] = [];
	for (const region of regions) {
		urls.push(
			`https://art.gametdb.com/${systemCode}/cover3D/${region}/${gameId}.png`,
			`https://art.gametdb.com/${systemCode}/cover3D/${region}/${gameId}.jpg`,
			`https://art.gametdb.com/${systemCode}/cover/${region}/${gameId}.png`,
			`https://art.gametdb.com/${systemCode}/cover/${region}/${gameId}.jpg`,
		);
	}

	return checkFirstUrl(urls, httpRepository);
}

async function tryFetchLibRetro(
	filename: string,
	system: string,
	httpRepository: Pick<IHttpRepository, "fetch">,
): Promise<string | null> {
	const repo = mapSystemToLibRetro(system);
	const repos = repo ? [repo] : getAllDiscSystemLibRetroRepos();
	if (repos.length === 0) {
		return null;
	}

	for (const currentRepo of repos) {
		const result = await tryFetchLibRetroForRepo(
			filename,
			currentRepo,
			httpRepository,
		);
		if (result) {
			return result;
		}
	}

	return null;
}

async function tryFetchLibRetroForRepo(
	filename: string,
	repo: string,
	httpRepository: Pick<IHttpRepository, "fetch">,
): Promise<string | null> {
	const base = `https://raw.githubusercontent.com/libretro-thumbnails/${repo}/master/Named_Boxarts`;

	const cleanName = filename.replace(
		/(?:\.(iso|bin|cue|chd|rvz|gcz|wbfs|gcm|gdi|toc|nkit))+$/i,
		"",
	);

	const exact = cleanName.replace(/[&*/:`<>?|\\"]/g, "_");
	const noRegion = exact.replace(/\s*\(.*?\)\s*/g, "").trim();
	const safe = noRegion.replace(/\s+/g, "_");
	const noExtraCountries = exact.replace(/,\s*[^)]+/g, "");

	const candidateNames = new Set([
		`${encodeURIComponent(exact)}.png`,
		`${encodeURIComponent(noExtraCountries)}.png`,
		`${encodeURIComponent(noRegion)}.png`,
		`${encodeURIComponent(safe)}.png`,
		`${encodeURIComponent(exact.replace(/_v[\d.]+$/, ""))}.png`,
		`${encodeURIComponent(noExtraCountries.replace(/_v[\d.]+$/, ""))}.png`,
	]);

	const urls = [...candidateNames].map((candidate) => `${base}/${candidate}`);
	const result = await checkFirstUrl(urls, httpRepository);
	if (result) {
		console.log(`[CoverArt] Found LibRetro match: ${result}`);
	}

	return result;
}

function getAllDiscSystemLibRetroRepos(): string[] {
	return [
		"Sony_-_PlayStation_2",
		"Sony_-_PlayStation",
		"Sony_-_PlayStation_Portable",
		"Sega_-_Dreamcast",
		"Sega_-_Saturn",
		"Nintendo_-_GameCube",
		"Nintendo_-_Wii",
	];
}

async function scrapeGameTDB(
	gameId: string,
	system: string,
	httpRepository: Pick<IHttpRepository, "fetch">,
): Promise<string | null> {
	try {
		const platform = isNintendoSystem(system) ? "Wii" : system;
		const url = `https://www.gametdb.com/${platform}/${gameId}`;

		const response = await httpRepository.fetch(url, {
			method: "GET",
			headers: { "User-Agent": "RetroPacker/1.0" },
		});

		if (!response.ok) {
			return null;
		}

		const text = await response.text();
		const match = text.match(
			/src="(\/gfx\/cover\/[a-zA-Z0-9]+\/[A-Za-z0-9]+\.jpg)"/,
		);
		if (!match) {
			return null;
		}

		return `https://www.gametdb.com${match[1]}`;
	} catch {
		return null;
	}
}

async function checkUrl(
	url: string,
	httpRepository: Pick<IHttpRepository, "fetch">,
): Promise<boolean> {
	try {
		const controller = new AbortController();
		const id = setTimeout(() => controller.abort(), TIMEOUT_MS);

		const response = await httpRepository.fetch(url, {
			method: "HEAD",
			signal: controller.signal,
		});

		clearTimeout(id);
		return response.ok && response.status === 200;
	} catch {
		return false;
	}
}

async function checkFirstUrl(
	urls: string[],
	httpRepository: Pick<IHttpRepository, "fetch">,
): Promise<string | null> {
	for (const url of urls) {
		const ok = await checkUrl(url, httpRepository);
		if (ok) {
			return url;
		}
	}

	return null;
}

function getGameTdbRegions(gameId: string): string[] {
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

function mapSystemToGameTDB(system: string): string {
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

function mapSystemToLibRetro(system: string): string {
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

function getCoverCacheKey(
	filePath: string,
	gameId: string | null,
	system: string,
): string {
	return `${system}::${gameId ?? ""}::${filePath}`;
}
