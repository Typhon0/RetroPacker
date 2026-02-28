/**
 * CUE Processor Service
 *
 * Handles smart preprocessing of CUE/BIN files before chdman invocation:
 * - Repairs CUE files with absolute paths in FILE directives
 * - Re-links renamed BIN files when a safe match is possible
 * - Generates CUE files for naked .bin inputs
 *
 * @module services/CueProcessorService
 */

import type { IFileSystemRepository } from "@/domain/repositories/IFileSystemRepository";

/**
 * Regex to match the FILE directive in a CUE sheet.
 * Captures the quoted path and the rest of the line (e.g. BINARY).
 */
const FILE_DIRECTIVE_GLOBAL_REGEX = /^(\s*FILE\s+")([^"]+)("\s+.*)$/gm;
const FILE_DIRECTIVE_LINE_REGEX = /^(\s*FILE\s+")([^"]+)("\s+.*)$/i;
const TRACK_NUMBER_REGEX = /(?:track|trk)\s*0*(\d+)/i;

const MULTI_TRACK_BIN_MESSAGE =
	"Multi-track .bin detected without a .cue file. A valid .cue sheet is required.";

const MISSING_REFERENCED_BIN_MESSAGE =
	"Referenced .bin file not found in directory.";

interface CueDirective {
	readonly lineIndex: number;
	readonly prefix: string;
	readonly fileReference: string;
	readonly suffix: string;
}

export interface PrepareCueResult {
	readonly success: boolean;
	readonly modifiedPath?: string;
	readonly errorMessage?: string;
}

export class CueProcessorService {
	/**
	 * Repair a CUE file's FILE directive by stripping absolute paths
	 * down to just the filename.
	 *
	 * @param cueContent - Raw CUE file content
	 * @returns Repaired CUE content (unchanged if already relative)
	 */
	static repairCue(cueContent: string): string {
		return cueContent.replace(
			FILE_DIRECTIVE_GLOBAL_REGEX,
			(_match, prefix, filePath, suffix) => {
				// If the path contains slashes, it has a directory component — strip it
				if (filePath.includes("/") || filePath.includes("\\")) {
					const filename = filePath.replace(/^.*[\\/]/, "");
					return `${prefix}${filename}${suffix}`;
				}
				return `${prefix}${filePath}${suffix}`;
			},
		);
	}

	/**
	 * Generate a standard MODE2/2352 CUE sheet for a given BIN file.
	 *
	 * @param binBasename - The BIN filename (e.g. "game.bin")
	 * @returns CUE sheet content string
	 */
	static generateCue(binBasename: string): string {
		return `FILE "${binBasename}" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n`;
	}

	/**
	 * Prepare the input file for chdman by repairing or generating a CUE sheet
	 * as needed.
	 *
	 * @param jobPath - Original input file path
	 * @param tempDir - Pre-created temporary directory for generated CUE files
	 * @param fileSystem - File system abstraction
	 * @returns Structured preparation result
	 */
	static async prepareInput(
		jobPath: string,
		tempDir: string,
		fileSystem: IFileSystemRepository,
	): Promise<PrepareCueResult> {
		const ext = jobPath.split(".").pop()?.toLowerCase() ?? "";

		if (ext === "cue") {
			return CueProcessorService.handleCueInput(jobPath, tempDir, fileSystem);
		}

		if (ext === "bin") {
			return CueProcessorService.handleBinInput(jobPath, tempDir, fileSystem);
		}

		// No preprocessing needed for other formats (ISO, etc.)
		return { success: true };
	}

	/**
	 * Handle a .cue input: read it, repair/relink FILE directives, and write to
	 * a temp CUE only when changes are required.
	 */
	private static async handleCueInput(
		cuePath: string,
		tempDir: string,
		fileSystem: IFileSystemRepository,
	): Promise<PrepareCueResult> {
		const cueDir = await fileSystem.dirname(cuePath);
		const content = await fileSystem.readText(cuePath);
		const lines = content.split(/\r?\n/);
		const directives = CueProcessorService.collectCueDirectives(lines);
		if (directives.length === 0) {
			return { success: true };
		}

		const directoryEntries = await fileSystem.readDirectory(cueDir);
		const binFiles = directoryEntries
			.filter(
				(entry) => entry.isFile && entry.name.toLowerCase().endsWith(".bin"),
			)
			.map((entry) => entry.name);

		let modified = false;
		for (const directive of directives) {
			const originalReference = directive.fileReference.trim();
			const strippedReference =
				CueProcessorService.getBasename(originalReference);
			let resolvedFilename = strippedReference;

			if (strippedReference !== originalReference) {
				modified = true;
			}

			const resolvedPath = await fileSystem.joinPath(cueDir, resolvedFilename);
			if (!(await fileSystem.exists(resolvedPath))) {
				const relinkedFilename = CueProcessorService.tryRelinkMissingReference(
					strippedReference,
					directive.fileReference,
					directives,
					binFiles,
				);

				if (!relinkedFilename) {
					return {
						success: false,
						errorMessage: MISSING_REFERENCED_BIN_MESSAGE,
					};
				}

				if (relinkedFilename !== resolvedFilename) {
					modified = true;
					resolvedFilename = relinkedFilename;
				}

				const relinkedPath = await fileSystem.joinPath(
					cueDir,
					resolvedFilename,
				);
				if (!(await fileSystem.exists(relinkedPath))) {
					return {
						success: false,
						errorMessage: MISSING_REFERENCED_BIN_MESSAGE,
					};
				}
			}

			lines[directive.lineIndex] =
				`${directive.prefix}${resolvedFilename}${directive.suffix}`;
		}

		if (!modified) {
			return { success: true };
		}

		const filename = CueProcessorService.getBasename(cuePath);
		const tempCuePath = await fileSystem.joinPath(tempDir, filename);
		await fileSystem.writeTextFile(tempCuePath, lines.join("\n"));

		return { success: true, modifiedPath: tempCuePath };
	}

	/**
	 * Handle a .bin input: check if a companion .cue exists.
	 * If not, generate a standard CUE sheet and write to temp dir.
	 * If yes, preprocess the existing CUE file instead.
	 */
	private static async handleBinInput(
		binPath: string,
		tempDir: string,
		fileSystem: IFileSystemRepository,
	): Promise<PrepareCueResult> {
		const binFilename = CueProcessorService.getBasename(binPath);
		const baseName = binFilename.replace(/\.[^.]+$/, "");
		const binDir = await fileSystem.dirname(binPath);
		const companionCuePath = await fileSystem.joinPath(
			binDir,
			`${baseName}.cue`,
		);

		if (await fileSystem.exists(companionCuePath)) {
			// A companion .cue exists — preprocess it instead
			const cueResult = await CueProcessorService.handleCueInput(
				companionCuePath,
				tempDir,
				fileSystem,
			);
			if (!cueResult.success) {
				return cueResult;
			}
			return {
				success: true,
				modifiedPath: cueResult.modifiedPath ?? companionCuePath,
			};
		}

		const isMultiTrack = await CueProcessorService.isMultiTrackBin(
			binPath,
			binDir,
			fileSystem,
		);
		if (isMultiTrack) {
			return {
				success: false,
				errorMessage: MULTI_TRACK_BIN_MESSAGE,
			};
		}

		// No companion CUE — generate one
		const cueContent = CueProcessorService.generateCue(binFilename);
		const tempCuePath = await fileSystem.joinPath(tempDir, `${baseName}.cue`);
		await fileSystem.writeTextFile(tempCuePath, cueContent);

		return { success: true, modifiedPath: tempCuePath };
	}

	private static collectCueDirectives(
		lines: readonly string[],
	): CueDirective[] {
		const directives: CueDirective[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const match = FILE_DIRECTIVE_LINE_REGEX.exec(line);
			if (!match) continue;

			directives.push({
				lineIndex: i,
				prefix: match[1],
				fileReference: match[2],
				suffix: match[3],
			});
		}

		return directives;
	}

	private static tryRelinkMissingReference(
		strippedReference: string,
		originalReference: string,
		allDirectives: readonly CueDirective[],
		binFiles: readonly string[],
	): string | undefined {
		const lowerReference = strippedReference.toLowerCase();
		const exactCaseInsensitiveMatches = binFiles.filter(
			(name) => name.toLowerCase() === lowerReference,
		);
		if (exactCaseInsensitiveMatches.length === 1) {
			return exactCaseInsensitiveMatches[0];
		}

		const isSingleFileCue = allDirectives.length === 1;
		if (isSingleFileCue && binFiles.length === 1) {
			return binFiles[0];
		}

		const trackNumber =
			CueProcessorService.extractTrackNumber(originalReference);
		if (trackNumber !== undefined) {
			const trackMatches = binFiles.filter((name) => {
				return CueProcessorService.extractTrackNumber(name) === trackNumber;
			});
			if (trackMatches.length === 1) {
				return trackMatches[0];
			}
		}

		const refBaseNoExt = strippedReference
			.replace(/\.[^.]+$/, "")
			.toLowerCase();
		const baseMatches = binFiles.filter((name) => {
			return name.replace(/\.[^.]+$/, "").toLowerCase() === refBaseNoExt;
		});
		if (baseMatches.length === 1) {
			return baseMatches[0];
		}

		return undefined;
	}

	private static async isMultiTrackBin(
		binPath: string,
		binDir: string,
		fileSystem: IFileSystemRepository,
	): Promise<boolean> {
		const binFilename = CueProcessorService.getBasename(binPath);
		const baseNoExt = binFilename.replace(/\.[^.]+$/, "");
		const currentTrackRoot = CueProcessorService.extractTrackRoot(baseNoExt);
		if (!currentTrackRoot) {
			return false;
		}

		const entries = await fileSystem.readDirectory(binDir);
		let matches = 0;
		for (const entry of entries) {
			if (!entry.isFile || !entry.name.toLowerCase().endsWith(".bin")) continue;
			const entryNoExt = entry.name.replace(/\.[^.]+$/, "");
			const root = CueProcessorService.extractTrackRoot(entryNoExt);
			if (root && root === currentTrackRoot) {
				matches += 1;
				if (matches >= 2) {
					return true;
				}
			}
		}

		return false;
	}

	private static extractTrackRoot(name: string): string | undefined {
		const normalized = name
			.toLowerCase()
			.replace(/\s*[([]?\s*(?:track|trk)\s*0*\d+\s*[)\]]?\s*$/i, "")
			.replace(/\s*[-_.]\s*(?:track|trk)\s*0*\d+\s*$/i, "")
			.trim();

		return normalized !== name.toLowerCase().trim() && normalized.length > 0
			? normalized
			: undefined;
	}

	private static extractTrackNumber(name: string): number | undefined {
		const match = name.match(TRACK_NUMBER_REGEX);
		if (!match) return undefined;
		const parsed = Number.parseInt(match[1], 10);
		return Number.isNaN(parsed) ? undefined : parsed;
	}

	private static getBasename(path: string): string {
		return path.replace(/^.*[\\/]/, "");
	}
}
