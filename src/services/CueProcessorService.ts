/**
 * CUE Processor Service
 *
 * Handles smart preprocessing of CUE/BIN files before chdman invocation:
 * - Repairs CUE files with absolute paths in FILE directives
 * - Generates CUE files for naked .bin inputs
 *
 * @module services/CueProcessorService
 */

import type { IFileSystemRepository } from "@/domain/repositories/IFileSystemRepository";

const TEMP_DIR_NAME = ".retropacker_temp";

/**
 * Regex to match the FILE directive in a CUE sheet.
 * Captures the quoted path and the rest of the line (e.g. BINARY).
 */
const FILE_DIRECTIVE_REGEX = /^(\s*FILE\s+")([^"]+)("\s+.*)$/gm;

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
			FILE_DIRECTIVE_REGEX,
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
	 * Prepare the input file for chdman by reparing or generating a CUE sheet
	 * as needed.
	 *
	 * @param jobPath - Original input file path
	 * @param outputDir - Output directory (temp files go in outputDir/.retropacker_temp/)
	 * @param fileSystem - File system abstraction
	 * @returns Path to the preprocessed CUE file, or null if no preprocessing needed
	 */
	static async prepareInput(
		jobPath: string,
		outputDir: string,
		fileSystem: IFileSystemRepository,
	): Promise<string | null> {
		const ext = jobPath.split(".").pop()?.toLowerCase() ?? "";

		if (ext === "cue") {
			return CueProcessorService.handleCueInput(jobPath, outputDir, fileSystem);
		}

		if (ext === "bin") {
			return CueProcessorService.handleBinInput(jobPath, outputDir, fileSystem);
		}

		// No preprocessing needed for other formats (ISO, etc.)
		return null;
	}

	/**
	 * Handle a .cue input: read it, repair if needed, write to temp dir.
	 */
	private static async handleCueInput(
		cuePath: string,
		outputDir: string,
		fileSystem: IFileSystemRepository,
	): Promise<string> {
		const content = await fileSystem.readTextFile(cuePath);
		const repaired = CueProcessorService.repairCue(content);

		const filename = cuePath.replace(/^.*[\\/]/, "");
		const tempDir = await fileSystem.joinPath(outputDir, TEMP_DIR_NAME);
		await fileSystem.createDirectory(tempDir);

		const tempCuePath = await fileSystem.joinPath(tempDir, filename);
		await fileSystem.writeTextFile(tempCuePath, repaired);

		return tempCuePath;
	}

	/**
	 * Handle a .bin input: check if a companion .cue exists.
	 * If not, generate a standard CUE sheet and write to temp dir.
	 * If yes, preprocess the existing CUE file instead.
	 */
	private static async handleBinInput(
		binPath: string,
		outputDir: string,
		fileSystem: IFileSystemRepository,
	): Promise<string | null> {
		const binFilename = binPath.replace(/^.*[\\/]/, "");
		const baseName = binFilename.replace(/\.[^.]+$/, "");
		const binDir = await fileSystem.dirname(binPath);
		const companionCuePath = await fileSystem.joinPath(
			binDir,
			`${baseName}.cue`,
		);

		if (await fileSystem.exists(companionCuePath)) {
			// A companion .cue exists — preprocess it instead
			return CueProcessorService.handleCueInput(
				companionCuePath,
				outputDir,
				fileSystem,
			);
		}

		// No companion CUE — generate one
		const cueContent = CueProcessorService.generateCue(binFilename);
		const tempDir = await fileSystem.joinPath(outputDir, TEMP_DIR_NAME);
		await fileSystem.createDirectory(tempDir);

		const tempCuePath = await fileSystem.joinPath(tempDir, `${baseName}.cue`);
		await fileSystem.writeTextFile(tempCuePath, cueContent);

		return tempCuePath;
	}
}
