export interface CueBinLinkCandidate {
	readonly id: string;
	readonly path: string;
	readonly filename?: string;
	readonly system?: unknown;
	readonly platformOverride?: unknown;
}

export interface LinkedCueBinPair {
	readonly primaryJobId: string;
	readonly companionJobIds: readonly string[];
	readonly companionFilenames: readonly string[];
	readonly companionJobId: string;
	readonly companionFilename: string;
}

export interface CueBinLinkMap {
	readonly byPrimary: Map<string, LinkedCueBinPair>;
	readonly byAnyJobId: Map<string, LinkedCueBinPair>;
	readonly hiddenCompanionJobIds: Set<string>;
}

function getFileExtension(path: string): string {
	const filename = path.split(/[\\/]/).pop() ?? "";
	const dotIndex = filename.lastIndexOf(".");
	if (dotIndex < 0) return "";
	return filename.slice(dotIndex + 1).toLowerCase();
}

function getBaseNameWithoutExtension(path: string): string {
	const filename = path.split(/[\\/]/).pop() ?? "";
	const dotIndex = filename.lastIndexOf(".");
	if (dotIndex <= 0) return filename.toLowerCase();
	return filename.slice(0, dotIndex).toLowerCase();
}

function getDirectory(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	const slashIndex = normalized.lastIndexOf("/");
	if (slashIndex < 0) return ".";
	return normalized.slice(0, slashIndex).toLowerCase();
}

function getBasename(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	const slashIndex = normalized.lastIndexOf("/");
	return slashIndex < 0 ? normalized : normalized.slice(slashIndex + 1);
}

const DESCRIPTOR_EXTENSIONS = new Set(["cue", "ccd", "gdi", "toc"]);
const DATA_EXTENSIONS = new Set(["bin", "img", "mdf"]);
const LINKABLE_EXTENSIONS = new Set([
	...DESCRIPTOR_EXTENSIONS,
	...DATA_EXTENSIONS,
]);

function getDescriptorRank(path: string): number {
	const ext = getFileExtension(path);
	switch (ext) {
		case "cue":
			return 0;
		case "ccd":
			return 1;
		case "gdi":
			return 2;
		case "toc":
			return 3;
		case "bin":
			return 4;
		case "img":
			return 5;
		case "mdf":
			return 6;
		default:
			return 99;
	}
}

function hasKnownPlatform(job: CueBinLinkCandidate): boolean {
	const system = typeof job.system === "string" ? job.system : undefined;
	if (system && system !== "Unknown") {
		return true;
	}
	const platformOverride =
		typeof job.platformOverride === "string" ? job.platformOverride : undefined;
	return !!platformOverride && platformOverride !== "auto";
}

export function buildCueBinLinkMap(
	jobs: readonly CueBinLinkCandidate[],
): CueBinLinkMap {
	const groups = new Map<string, CueBinLinkCandidate[]>();

	for (const job of jobs) {
		const ext = getFileExtension(job.path);
		if (!LINKABLE_EXTENSIONS.has(ext)) continue;

		const key = `${getDirectory(job.path)}::${getBaseNameWithoutExtension(job.path)}`;
		const group = groups.get(key) ?? [];
		group.push(job);
		groups.set(key, group);
	}

	const byPrimary = new Map<string, LinkedCueBinPair>();
	const byAnyJobId = new Map<string, LinkedCueBinPair>();
	const hiddenCompanionJobIds = new Set<string>();

	for (const group of groups.values()) {
		if (group.length < 2) {
			continue;
		}

		const hasDescriptor = group.some((job) =>
			DESCRIPTOR_EXTENSIONS.has(getFileExtension(job.path)),
		);
		if (!hasDescriptor) {
			continue;
		}

		const primary = group.reduce((best, current) => {
			const bestKnown = hasKnownPlatform(best);
			const currentKnown = hasKnownPlatform(current);
			if (bestKnown !== currentKnown) {
				return currentKnown ? current : best;
			}

			const bestRank = getDescriptorRank(best.path);
			const currentRank = getDescriptorRank(current.path);
			if (bestRank !== currentRank) {
				return currentRank < bestRank ? current : best;
			}

			return current.id < best.id ? current : best;
		});
		const companions = group.filter((job) => job.id !== primary.id);
		if (companions.length === 0) {
			continue;
		}

		const pair: LinkedCueBinPair = {
			primaryJobId: primary.id,
			companionJobIds: companions.map((job) => job.id),
			companionFilenames: companions.map(
				(job) => job.filename ?? getBasename(job.path),
			),
			companionJobId: companions[0].id,
			companionFilename:
				companions[0].filename ?? getBasename(companions[0].path),
		};

		byPrimary.set(pair.primaryJobId, pair);
		for (const job of group) {
			byAnyJobId.set(job.id, pair);
		}
		for (const companionId of pair.companionJobIds) {
			hiddenCompanionJobIds.add(companionId);
		}
	}

	return {
		byPrimary,
		byAnyJobId,
		hiddenCompanionJobIds,
	};
}

export function filterVisibleCueBinJobs<T extends CueBinLinkCandidate>(
	jobs: readonly T[],
): T[] {
	const links = buildCueBinLinkMap(jobs);
	return jobs.filter((job) => !links.hiddenCompanionJobIds.has(job.id));
}
