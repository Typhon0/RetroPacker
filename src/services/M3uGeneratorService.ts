/**
 * M3U Generator Service
 *
 * Generates .m3u playlist files for multi-disc games after successful
 * batch compression. Required by frontends like RetroArch and DuckStation
 * for disc swapping.
 *
 * @module services/M3uGeneratorService
 */

import type { IFileSystemRepository } from "@/domain/repositories/IFileSystemRepository";

/**
 * Regex to identify multi-disc filenames.
 * Captures:
 *   Group 1 — Base name before disc indicator
 *   Group 2 — Disc number
 *   Group 3 — Remainder after disc indicator (e.g. region tag)
 */
const DISC_REGEX =
	/(.*?)\s*[\(\[](?:Disc|Disk|Pt|Part)\s*(\d+)[A-Za-z]?[\)\]](.*)/i;

export interface DiscEntry {
	readonly filename: string;
	readonly discNumber: number;
}

export interface DiscGroup {
	readonly baseName: string;
	readonly entries: DiscEntry[];
}

export class M3uGeneratorService {
	/**
	 * Group filenames by their multi-disc base name.
	 *
	 * @param filenames - Array of filenames (not full paths)
	 * @returns Map from normalized base name to sorted disc entries
	 */
	static groupByDisc(filenames: string[]): Map<string, DiscGroup> {
		const groups = new Map<string, DiscGroup>();

		for (const filename of filenames) {
			const match = filename.match(DISC_REGEX);
			if (!match) continue;

			const baseName = (match[1] + match[3]).trim();
			// Strip trailing extension from base name for the key
			const baseKey = baseName.replace(/\.[^.]+$/, "").trim();
			const discNumber = parseInt(match[2], 10);

			const existing = groups.get(baseKey);
			if (existing) {
				existing.entries.push({ filename, discNumber });
			} else {
				groups.set(baseKey, {
					baseName: baseKey,
					entries: [{ filename, discNumber }],
				});
			}
		}

		// Sort entries within each group by disc number
		for (const group of groups.values()) {
			group.entries.sort((a, b) => a.discNumber - b.discNumber);
		}

		return groups;
	}

	/**
	 * Generate .m3u playlist files for multi-disc game groups.
	 *
	 * @param outputDir - Directory to write .m3u files to
	 * @param completedOutputPaths - Full paths of successfully compressed .chd files
	 * @param fileSystem - File system abstraction
	 * @returns Array of generated .m3u file paths
	 */
	static async generateM3uFiles(
		outputDir: string,
		completedOutputPaths: string[],
		fileSystem: IFileSystemRepository,
	): Promise<string[]> {
		// Extract filenames from full paths
		const filenames = completedOutputPaths.map((p) =>
			p.replace(/^.*[\\/]/, ""),
		);

		const discGroups = M3uGeneratorService.groupByDisc(filenames);
		const generatedPaths: string[] = [];

		for (const [baseName, group] of discGroups) {
			// Only generate M3U for groups with more than 1 disc
			if (group.entries.length <= 1) continue;

			// Build M3U content — relative filenames separated by newlines
			const content = group.entries.map((entry) => entry.filename).join("\n");

			const m3uFilename = `${baseName}.m3u`;
			const m3uPath = await fileSystem.joinPath(outputDir, m3uFilename);

			await fileSystem.writeTextFile(m3uPath, content);
			generatedPaths.push(m3uPath);
		}

		return generatedPaths;
	}
}
