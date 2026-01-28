/**
 * Use Case - Detect System
 * Business logic for detecting gaming system from file.
 *
 * Single Responsibility: Only handles system detection.
 *
 * @module domain/usecases/DetectSystemUseCase
 */

import { DetectedSystem } from "../types/platform.types";
import { IFileSystemRepository } from "../repositories/IFileSystemRepository";

/**
 * Dependencies for DetectSystemUseCase.
 */
export interface DetectSystemDependencies {
	readonly fileSystem: IFileSystemRepository;
}

/**
 * Use Case: Detect System
 *
 * Detects the gaming system from a file using multiple strategies:
 * 1. File extension
 * 2. Path patterns
 * 3. Binary header analysis (for ISO files)
 */
export class DetectSystemUseCase {
	constructor(private readonly deps: DetectSystemDependencies) {}

	/**
	 * Detect the system from a file path.
	 * Uses async header analysis for accurate detection.
	 *
	 * @param filePath - Path to the file
	 * @returns Detected system
	 */
	async execute(filePath: string): Promise<DetectedSystem> {
		const filename = filePath.split(/[\\/]/).pop() ?? "";
		const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
		const lowerPath = filePath.toLowerCase().replace(/\\/g, "/");

		// 1. Extension-based detection (fast, definitive)
		const extResult = this.detectByExtension(ext);
		if (extResult !== "Unknown") {
			return extResult;
		}

		// 2. Path-based detection (fast, uses folder structure)
		const pathResult = this.detectByPath(lowerPath);
		if (pathResult !== "Unknown") {
			return pathResult;
		}

		// 3. For .iso files: check binary header
		if (ext === "iso") {
			const headerResult = await this.detectByHeader(filePath, filename);
			if (headerResult !== "Unknown") {
				return headerResult;
			}

			// Fallback for ISO: check filename patterns
			const filenameResult = this.detectByFilename(filename);
			if (filenameResult !== "Unknown") {
				return filenameResult;
			}

			// Default for ISO
			return "PS2";
		}

		return "Unknown";
	}

	/**
	 * Synchronous detection (no header analysis).
	 * Use when async is not possible.
	 *
	 * @param filename - File name
	 * @param ext - File extension (without dot)
	 * @returns Detected system
	 */
	detectSync(filename: string, ext?: string): DetectedSystem {
		const lowerName = filename.toLowerCase();
		const lowerExt = ext?.toLowerCase() ?? "";

		// Extension check
		const extResult = this.detectByExtension(lowerExt);
		if (extResult !== "Unknown") {
			return extResult;
		}

		// Filename/path patterns
		if (lowerName.includes("gamecube") || lowerName.includes("gcn"))
			return "GameCube";
		if (lowerName.includes("wii")) return "Wii";
		if (lowerName.includes("ps2")) return "PS2";
		if (lowerName.includes("psx") || lowerName.includes("ps1")) return "PS1";

		return "Unknown";
	}

	/**
	 * Detect by file extension.
	 */
	private detectByExtension(ext: string): DetectedSystem {
		switch (ext) {
			case "chd":
				return "CHD";
			case "gdi":
				return "Dreamcast";
			case "gcm":
				return "GameCube";
			case "wbfs":
				return "Wii";
			case "rvz":
			case "gcz":
				return "GameCube";
			case "cue":
			case "bin":
				return "PS1";
			case "nsp":
			case "nsz":
			case "xci":
			case "xcz":
				return "Switch";
			default:
				return "Unknown";
		}
	}

	/**
	 * Detect by path patterns.
	 */
	private detectByPath(lowerPath: string): DetectedSystem {
		if (lowerPath.includes("gamecube") || lowerPath.includes("gcn"))
			return "GameCube";
		if (lowerPath.includes("wii") && !lowerPath.includes("switch"))
			return "Wii";
		if (lowerPath.includes("dreamcast")) return "Dreamcast";
		if (lowerPath.includes("saturn")) return "Saturn";
		if (lowerPath.includes("ps2") || lowerPath.includes("playstation 2"))
			return "PS2";
		if (
			lowerPath.includes("psx") ||
			lowerPath.includes("ps1") ||
			lowerPath.includes("playstation")
		)
			return "PS1";
		return "Unknown";
	}

	/**
	 * Detect by filename patterns.
	 */
	private detectByFilename(filename: string): DetectedSystem {
		const lowerName = filename.toLowerCase();
		if (lowerName.includes("ps2")) return "PS2";
		if (lowerName.includes("psx") || lowerName.includes("ps1")) return "PS1";
		return "Unknown";
	}

	/**
	 * Detect by reading ISO header (for Nintendo detection).
	 */
	private async detectByHeader(
		filePath: string,
		filename: string,
	): Promise<DetectedSystem> {
		try {
			const { fileSystem } = this.deps;
			const buffer = await fileSystem.readBytes(filePath, 0, 32);

			// Get potential game ID (first 6 bytes)
			const gameId = new TextDecoder("ascii").decode(buffer.slice(0, 6));

			console.log(
				`[DetectSystemUseCase] Checking ISO header for ${filename}: GameID="${gameId}"`,
			);

			// GameCube magic: 0xC2 0x33 0x9F 0x3D at offset 28
			const magicGC =
				buffer[28] === 0xc2 &&
				buffer[29] === 0x33 &&
				buffer[30] === 0x9f &&
				buffer[31] === 0x3d;

			// Wii magic: 0x5D 0x1C 0x9E 0xA3 at offset 24
			const magicWii =
				buffer[24] === 0x5d &&
				buffer[25] === 0x1c &&
				buffer[26] === 0x9e &&
				buffer[27] === 0xa3;

			if (magicWii) {
				console.log("[DetectSystemUseCase] Detected Wii via Magic Bytes");
				return "Wii";
			}

			if (magicGC) {
				console.log("[DetectSystemUseCase] Detected GameCube via Magic Bytes");
				return "GameCube";
			}

			// Valid alphanumeric 6-char ID at offset 0 suggests Nintendo
			if (/^[A-Z0-9]{6}$/.test(gameId)) {
				console.log(
					`[DetectSystemUseCase] Detected Nintendo via Game ID: ${gameId}`,
				);
				return "GameCube";
			}
		} catch (e) {
			console.warn(
				`[DetectSystemUseCase] Failed to check ISO header for ${filename}:`,
				e,
			);
		}

		return "Unknown";
	}
}
