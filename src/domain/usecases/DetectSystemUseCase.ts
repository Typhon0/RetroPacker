import type { ICommandExecutor } from "../repositories/ICommandExecutor";
import type { IFileSystemRepository } from "../repositories/IFileSystemRepository";
import type { DetectedSystem } from "../types/platform.types";

/**
 * Dependencies for DetectSystemUseCase.
 */
export interface DetectSystemDependencies {
	readonly fileSystem: Pick<
		IFileSystemRepository,
		| "readBytes"
		| "readTextFile"
		| "readText"
		| "exists"
		| "dirname"
		| "joinPath"
	>;
	readonly commandExecutor?: Pick<ICommandExecutor, "execute">;
}

/** Unsupported archive extensions that must be extracted first. */
const ARCHIVE_EXTENSIONS = new Set(["zip", "7z", "rar"]);

/** Extensions for compressed emulator formats needing CLI metadata extraction. */
const CHD_EXTENSION = "chd";
const DOLPHIN_EXTENSIONS = new Set(["rvz", "gcz", "wia", "wbfs"]);

/** Size of the binary header buffer to read (64 KB). */
const HEADER_READ_SIZE = 65536;
const ISO_PRIMARY_VOLUME_DESCRIPTOR_OFFSET = 0x8000;
const ISO_STANDARD_IDENTIFIER_OFFSET = ISO_PRIMARY_VOLUME_DESCRIPTOR_OFFSET + 1; // "CD001"
const ISO_PLATFORM_SCAN_END_OFFSET = 0x9000;
const ISO_ROOT_DIRECTORY_RECORD_OFFSET =
	ISO_PRIMARY_VOLUME_DESCRIPTOR_OFFSET + 156;
const ISO_ROOT_DIRECTORY_MIN_RECORD_LENGTH = 34;
const ISO_SECTOR_SIZE = 2048;
const ISO_ROOT_DIRECTORY_READ_MAX_BYTES = 512 * 1024;
const PS3_EBOOT_PATH_REGEX = /\/ps3_game\/usrdir\/eboot\.bin$/i;
const SCE_EXEC_MAGIC = new Uint8Array([0x53, 0x43, 0x45, 0x00]); // "SCE\0"
const ELF_EXEC_MAGIC = new Uint8Array([0x7f, 0x45, 0x4c, 0x46]); // "\x7FELF"

/**
 * Magic byte signatures for 2048-byte/sector formats (DVD-based).
 */
const TIER_A_SIGNATURES: ReadonlyArray<{
	offset: number;
	bytes: Uint8Array | string;
	system: DetectedSystem;
}> = [
	// Wii disc magic at offset 0x18
	{
		offset: 0x18,
		bytes: new Uint8Array([0x5d, 0x1c, 0x9e, 0xa3]),
		system: "Wii",
	},
	// GameCube disc magic at offset 0x1C
	{
		offset: 0x1c,
		bytes: new Uint8Array([0xc2, 0x33, 0x9f, 0x3d]),
		system: "GameCube",
	},
	// PS2 DVD — "PLAYSTATION " at sector 16 + 16 bytes = 0x8010
	{ offset: 0x8010, bytes: "PLAYSTATION ", system: "PS2" },
];

/**
 * Magic byte signatures for 2352-byte/sector formats (CD-ROM-based).
 */
const TIER_B_SIGNATURES: ReadonlyArray<{
	offset: number;
	bytes: string;
	system: DetectedSystem;
}> = [
	// Sega Saturn — after 16-byte sync header
	{ offset: 0x10, bytes: "SEGA SEGASATURN", system: "Saturn" },
	// Sega Dreamcast — after 16-byte sync header
	{ offset: 0x10, bytes: "SEGA SEGAKATANA", system: "Dreamcast" },
	// PS1 / PS2 CD-ROM — sector 16 (37632) + 16 bytes = 0x9310
	{ offset: 0x9310, bytes: "PLAYSTATION ", system: "PS1" },
];

/**
 * Regex-based path fallback patterns (Step 5).
 * Uses strict word boundaries to avoid false positives.
 */
const PATH_REGEX_PATTERNS: ReadonlyArray<{
	pattern: RegExp;
	system: DetectedSystem;
}> = [
	{ pattern: /\b(wii)\b/i, system: "Wii" },
	{ pattern: /\b(gamecube|gcn)\b/i, system: "GameCube" },
	{ pattern: /\b(ps2|playstation.?2)\b/i, system: "PS2" },
];

/**
 * Use Case: Detect System
 *
 * Detects the gaming platform from a file using a strict 5-step pipeline:
 * 1. Reject unsupported archives (.zip, .7z, .rar)
 * 2. Extract platform from compressed emulator formats via CLI tools
 * 3. Pointer file resolution (.cue, .gdi, .ccd)
 * 4. 2-tier binary magic header scan (DVD 2048-byte + CD-ROM 2352-byte sectors)
 * 5. Safe regex fallback on file path
 *
 * If no match is found, returns "Unknown" — NEVER defaults to a specific platform.
 */
export class DetectSystemUseCase {
	constructor(private readonly deps: DetectSystemDependencies) {}

	/**
	 * Detect the system from a file path.
	 * Runs the full 5-step pipeline sequentially; halts on first match.
	 *
	 * @param filePath - Absolute path to the file
	 * @returns Detected system, or "Unknown" when unresolved
	 */
	async execute(filePath: string): Promise<DetectedSystem> {
		const ext = filePath.split(".").pop()?.toLowerCase() ?? "";

		// ── Step 1: Reject unsupported archive formats ──────────────
		if (ARCHIVE_EXTENSIONS.has(ext)) {
			return "Unknown";
		}

		// Strict PS3 executable rejection:
		// only when both path layout and executable header signature match.
		if (ext === "bin" && (await this.isDefinitivePs3Executable(filePath))) {
			return "Unsupported";
		}

		// ── Step 2: Extract platform from compressed emulator formats
		//    These formats require CLI tools since we can't read raw
		//    binary headers from compressed containers.
		if (ext === CHD_EXTENSION) {
			return this.detectFromChd(filePath);
		}

		if (DOLPHIN_EXTENSIONS.has(ext)) {
			return this.detectFromDolphinFormat(filePath, ext);
		}

		// PSP compressed formats — always PSP
		if (ext === "cso" || ext === "ciso") {
			return "PSP";
		}

		// Switch — recognized but not processable by chdman/DolphinTool
		if (ext === "nsp" || ext === "nsz" || ext === "xci") {
			return "Switch";
		}

		// ── Step 3: Pointer file resolution (.cue, .gdi, .ccd) ─────
		const binaryTarget = await this.resolvePointerFile(filePath, ext);

		// Null means the referenced binary file is missing on disk
		if (binaryTarget === null) {
			if (ext === "cue") {
				const cueFallback = await this.detectFromCueMetadata(filePath);
				if (cueFallback !== "Unknown") {
					return cueFallback;
				}
			}

			if (this.supportsCompanionCueFallback(ext)) {
				const companionCueFallback =
					await this.detectFromCompanionCueMetadata(filePath);
				if (companionCueFallback !== "Unknown") {
					return companionCueFallback;
				}
			}
			return "Unknown";
		}

		// ── Step 4: Binary magic header scan ────────────────────────
		if (this.isBinaryFormat(ext) || binaryTarget !== filePath) {
			const headerResult = await this.detectByMagicHeader(binaryTarget);
			if (headerResult !== "Unknown") {
				return headerResult;
			}
		}

		// CUE + descriptor/data metadata fallback for cases where header
		// signatures are absent.
		if (ext === "cue") {
			const cueFallback = await this.detectFromCueMetadata(filePath);
			if (cueFallback !== "Unknown") {
				return cueFallback;
			}
		}

		if (this.supportsCompanionCueFallback(ext)) {
			const companionCueFallback =
				await this.detectFromCompanionCueMetadata(filePath);
			if (companionCueFallback !== "Unknown") {
				return companionCueFallback;
			}
		}

		// ── Step 5: Safe regex fallback on file path ────────────────
		const regexResult = this.detectByPathRegex(filePath);
		if (regexResult !== "Unknown") {
			return regexResult;
		}

		return "Unknown";
	}

	// ─── Step 2 Helpers ────────────────────────────────────────────

	/**
	 * Detect platform from a .chd file by running `chdman info`.
	 * Parses "Logical size" to determine sector type (DVD vs CD).
	 */
	private async detectFromChd(filePath: string): Promise<DetectedSystem> {
		const { commandExecutor } = this.deps;

		if (!commandExecutor) {
			return "Unknown";
		}

		try {
			const result = await commandExecutor.execute("chdman", [
				"info",
				"-i",
				filePath,
			]);

			if (result.code !== 0 || !result.stdout) {
				return "Unknown";
			}

			return this.parseChdInfoOutput(result.stdout);
		} catch (e) {
			console.warn(
				`[DetectSystemUseCase] chdman info failed for ${filePath}:`,
				e,
			);
			return "Unknown";
		}
	}

	/**
	 * Parse chdman info stdout to determine the platform.
	 * Checks "Logical size:" to determine if DVD (2048) or CD (2352) sectors.
	 */
	private parseChdInfoOutput(stdout: string): DetectedSystem {
		// Look for "Logical size: <number>"
		const logicalSizeMatch = stdout.match(/Logical size:\s*([\d,]+)/i);

		if (!logicalSizeMatch) {
			return "Unknown";
		}

		const logicalSize = parseInt(logicalSizeMatch[1].replace(/,/g, ""), 10);

		if (!Number.isFinite(logicalSize) || logicalSize <= 0) {
			return "Unknown";
		}

		// Check CD sector size FIRST — because many CD sizes are also
		// multiples of 2048 (e.g. 681984000 % 2048 === 0), but the
		// definitive CD sector size is 2352.
		if (logicalSize % 2352 === 0) {
			return "PS1"; // CD format → PS1/Saturn/Dreamcast (uses createcd)
		}

		// DVD sector size = 2048 bytes
		if (logicalSize % 2048 === 0) {
			return "PS2"; // DVD format → PS2 (uses createdvd)
		}

		return "Unknown";
	}

	/**
	 * Detect platform from Dolphin-format files (.rvz, .gcz, .wia, .wbfs)
	 * by running `DolphinTool header` and parsing the Game ID.
	 */
	private async detectFromDolphinFormat(
		filePath: string,
		_ext: string,
	): Promise<DetectedSystem> {
		const { commandExecutor } = this.deps;

		if (!commandExecutor) {
			return "Unknown";
		}

		try {
			const result = await commandExecutor.execute("DolphinTool", [
				"header",
				"-i",
				filePath,
			]);

			if (result.code !== 0 || !result.stdout) {
				return "Unknown";
			}

			return this.parseDolphinHeaderOutput(result.stdout);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			console.warn(
				`[DetectSystemUseCase] DolphinTool header failed for ${filePath}: ${msg}`,
			);
			return "Unknown";
		}
	}

	/**
	 * Parse DolphinTool header output to determine Wii vs GameCube.
	 * Checks the first letter of Game ID:
	 *   R, S → Wii
	 *   G, D → GameCube
	 */
	private parseDolphinHeaderOutput(stdout: string): DetectedSystem {
		const gameIdMatch = stdout.match(/Game ID:\s*(\S+)/i);

		if (!gameIdMatch || gameIdMatch[1].length < 1) {
			return "Unknown";
		}

		const firstChar = gameIdMatch[1][0].toUpperCase();

		// Wii Game IDs start with R, S
		if (firstChar === "R" || firstChar === "S") {
			return "Wii";
		}

		// GameCube Game IDs start with G, D
		if (firstChar === "G" || firstChar === "D") {
			return "GameCube";
		}

		return "Unknown";
	}

	// ─── Step 3: Pointer File Resolution ───────────────────────────

	/**
	 * Resolve pointer/descriptor files to their binary targets.
	 * Returns the binary path to scan, or null if the referenced file is missing.
	 * Returns the original filePath if it's not a pointer format.
	 */
	private async resolvePointerFile(
		filePath: string,
		ext: string,
	): Promise<string | null> {
		try {
			if (ext === "cue") {
				return await this.resolveCueFile(filePath);
			}

			if (ext === "gdi") {
				return await this.resolveGdiFile(filePath);
			}

			if (ext === "ccd") {
				return await this.resolveCcdFile(filePath);
			}
		} catch (e) {
			console.warn(
				`[DetectSystemUseCase] Failed to resolve pointer file ${filePath}:`,
				e,
			);
			return null;
		}

		// Not a pointer format — return the original path
		return filePath;
	}

	/**
	 * Parse a .cue file to find the first FILE "name" BINARY directive.
	 */
	private async resolveCueFile(cuePath: string): Promise<string | null> {
		const { fileSystem } = this.deps;
		const content = await this.readPointerText(cuePath);
		const match = content.match(/FILE\s+"([^"]+)"\s+BINARY/i);

		if (!match) {
			console.warn(
				`[DetectSystemUseCase] No FILE directive found in CUE: ${cuePath}`,
			);
			return null;
		}

		const rawReference = match[1].trim();
		const binFilename = this.basename(rawReference);
		const dir = await fileSystem.dirname(cuePath);
		const binPath = await fileSystem.joinPath(dir, binFilename);

		if (!(await fileSystem.exists(binPath))) {
			console.warn(
				`[DetectSystemUseCase] Missing target binary file: ${binPath}`,
			);
			return null;
		}

		return binPath;
	}

	/**
	 * Parse a .gdi file to find the first data track binary.
	 * GDI format: track_num lba type sector_size filename [offset]
	 * Data tracks have type 4 (MODE1) or 0.
	 */
	private async resolveGdiFile(gdiPath: string): Promise<string | null> {
		const { fileSystem } = this.deps;
		const content = await this.readPointerText(gdiPath);
		const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

		// First line is typically the track count; skip it
		const trackPattern = /^\s*(\d+)\s+\d+\s+(\d+)\s+\d+\s+(\S+)/;

		for (let i = 1; i < lines.length; i++) {
			const match = lines[i].match(trackPattern);
			if (!match) continue;

			const trackType = parseInt(match[2], 10);
			// Type 4 = data track, type 0 = data track in some GDI variants
			if (trackType === 4 || trackType === 0) {
				const trackFilename = match[3].replace(/^"(.*)"$/, "$1");
				const dir = await fileSystem.dirname(gdiPath);
				const trackPath = await fileSystem.joinPath(dir, trackFilename);

				if (!(await fileSystem.exists(trackPath))) {
					console.warn(
						`[DetectSystemUseCase] Missing target binary file: ${trackPath}`,
					);
					return null;
				}

				return trackPath;
			}
		}

		console.warn(
			`[DetectSystemUseCase] No data track found in GDI: ${gdiPath}`,
		);
		return null;
	}

	/**
	 * Resolve a .ccd file to its companion .img file (same basename).
	 */
	private async resolveCcdFile(ccdPath: string): Promise<string | null> {
		const { fileSystem } = this.deps;
		const dir = await fileSystem.dirname(ccdPath);
		const basename =
			ccdPath
				.split(/[\\/]/)
				.pop()
				?.replace(/\.ccd$/i, "") ?? "";
		const imgPath = await fileSystem.joinPath(dir, `${basename}.img`);

		if (!(await fileSystem.exists(imgPath))) {
			console.warn(
				`[DetectSystemUseCase] Missing companion .img file: ${imgPath}`,
			);
			return null;
		}

		return imgPath;
	}

	// ─── Step 4: Binary Magic Header Scan ──────────────────────────

	/**
	 * Read binary magic headers from a file.
	 * Checks both 2048-byte (DVD) and 2352-byte (CD-ROM) sector signatures.
	 */
	private async detectByMagicHeader(filePath: string): Promise<DetectedSystem> {
		try {
			const { fileSystem } = this.deps;
			const buffer = await fileSystem.readBytes(filePath, 0, HEADER_READ_SIZE);

			// ISO9660 descriptor scan for platforms whose identifiers are not
			// guaranteed to appear at one rigid byte offset.
			const isoPlatform = await this.detectIsoPlatformFromVolumeDescriptor(
				filePath,
				buffer,
			);
			if (isoPlatform !== "Unknown") {
				return isoPlatform;
			}

			// Tier A: DVD-based formats (2048 bytes/sector)
			for (const sig of TIER_A_SIGNATURES) {
				if (this.matchSignature(buffer, sig.offset, sig.bytes)) {
					return sig.system;
				}
			}

			// Tier B: CD-ROM formats (2352 bytes/sector)
			for (const sig of TIER_B_SIGNATURES) {
				if (this.matchSignature(buffer, sig.offset, sig.bytes)) {
					return sig.system;
				}
			}
		} catch (e) {
			console.warn(
				`[DetectSystemUseCase] Failed to read header from ${filePath}:`,
				e,
			);
		}

		return "Unknown";
	}

	/**
	 * Detect PSP/PS2 from ISO9660 volume descriptor contents.
	 *
	 * Valid ISO images expose "CD001" at offset 0x8001.
	 * We then scan a bounded window in the descriptor area for platform markers.
	 */
	private async detectIsoPlatformFromVolumeDescriptor(
		filePath: string,
		buffer: Uint8Array,
	): Promise<DetectedSystem> {
		if (!this.matchSignature(buffer, ISO_STANDARD_IDENTIFIER_OFFSET, "CD001")) {
			return "Unknown";
		}

		const scanEnd = Math.min(buffer.length, ISO_PLATFORM_SCAN_END_OFFSET);
		if (scanEnd <= ISO_PRIMARY_VOLUME_DESCRIPTOR_OFFSET) {
			return "Unknown";
		}

		const descriptorText = this.toPrintableUpperAscii(
			buffer.slice(ISO_PRIMARY_VOLUME_DESCRIPTOR_OFFSET, scanEnd),
		);

		if (this.containsPspIsoMarker(descriptorText)) {
			return "PSP";
		}

		if (descriptorText.includes("PLAYSTATION ")) {
			return "PS2";
		}

		// Fallback: parse root directory extent from PVD and scan root directory
		// payload for PSP markers (PSP_GAME/UMD_DATA), which can be located well
		// beyond the initial 64 KiB header slice.
		if (
			ISO_ROOT_DIRECTORY_RECORD_OFFSET + ISO_ROOT_DIRECTORY_MIN_RECORD_LENGTH >
			buffer.length
		) {
			return "Unknown";
		}

		const rootRecordLength = buffer[ISO_ROOT_DIRECTORY_RECORD_OFFSET];
		if (
			rootRecordLength < ISO_ROOT_DIRECTORY_MIN_RECORD_LENGTH ||
			ISO_ROOT_DIRECTORY_RECORD_OFFSET + rootRecordLength > buffer.length
		) {
			return "Unknown";
		}

		const rootExtentLba = this.readUint32LE(
			buffer,
			ISO_ROOT_DIRECTORY_RECORD_OFFSET + 2,
		);
		const rootDataLength = this.readUint32LE(
			buffer,
			ISO_ROOT_DIRECTORY_RECORD_OFFSET + 10,
		);
		if (rootExtentLba <= 0 || rootDataLength <= 0) {
			return "Unknown";
		}

		const rootOffset = rootExtentLba * ISO_SECTOR_SIZE;
		const rootReadLength = Math.min(
			rootDataLength,
			ISO_ROOT_DIRECTORY_READ_MAX_BYTES,
		);
		if (rootReadLength <= 0) {
			return "Unknown";
		}

		if (rootOffset + rootReadLength <= buffer.length) {
			const rootBytes = buffer.slice(rootOffset, rootOffset + rootReadLength);
			const rootText = this.toPrintableUpperAscii(rootBytes);
			if (this.containsPspIsoMarker(rootText)) {
				return "PSP";
			}
			return "Unknown";
		}

		const hasPspMarkersInRoot = await this.fileRangeContainsMarkers(
			filePath,
			rootOffset,
			rootReadLength,
			["PSP_GAME", "UMD_DATA", "UMD_VIDEO"],
		);
		if (hasPspMarkersInRoot) {
			return "PSP";
		}

		return "Unknown";
	}

	private containsPspIsoMarker(text: string): boolean {
		return (
			text.includes("PSP_GAME") ||
			text.includes("UMD_DATA") ||
			text.includes("UMD_VIDEO")
		);
	}

	private readUint32LE(buffer: Uint8Array, offset: number): number {
		if (offset + 3 >= buffer.length) return 0;
		return (
			(buffer[offset] |
				(buffer[offset + 1] << 8) |
				(buffer[offset + 2] << 16) |
				(buffer[offset + 3] << 24)) >>>
			0
		);
	}

	private toPrintableUpperAscii(bytes: Uint8Array): string {
		let value = "";
		for (let i = 0; i < bytes.length; i++) {
			const byte = bytes[i];
			value += byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : " ";
		}
		return value.toUpperCase();
	}

	private async fileRangeContainsMarkers(
		filePath: string,
		offset: number,
		length: number,
		markers: readonly string[],
	): Promise<boolean> {
		const { fileSystem } = this.deps;
		const chunkSize = Math.min(HEADER_READ_SIZE, 32768);
		let remaining = length;
		let cursor = offset;
		let tail = "";
		const overlap = Math.max(...markers.map((marker) => marker.length), 16);

		while (remaining > 0) {
			const readLength = Math.min(chunkSize, remaining);
			const bytes = await fileSystem.readBytes(filePath, cursor, readLength);
			if (bytes.length === 0) {
				break;
			}

			const text = tail + this.toPrintableUpperAscii(bytes);
			for (const marker of markers) {
				if (text.includes(marker)) {
					return true;
				}
			}

			tail = text.length > overlap ? text.slice(text.length - overlap) : text;
			cursor += bytes.length;
			remaining -= bytes.length;
		}

		return false;
	}

	/**
	 * Match a signature (raw bytes or ASCII string) at a given offset.
	 */
	private matchSignature(
		buffer: Uint8Array,
		offset: number,
		expected: Uint8Array | string,
	): boolean {
		if (typeof expected === "string") {
			if (offset + expected.length > buffer.length) return false;
			for (let i = 0; i < expected.length; i++) {
				if (buffer[offset + i] !== expected.charCodeAt(i)) return false;
			}
			return true;
		}

		if (offset + expected.length > buffer.length) return false;
		for (let i = 0; i < expected.length; i++) {
			if (buffer[offset + i] !== expected[i]) return false;
		}
		return true;
	}

	// ─── Step 5: Regex Path Fallback ───────────────────────────────

	/**
	 * Regex-based detection from the full file path.
	 * Uses strict word boundaries to avoid false positives.
	 */
	private detectByPathRegex(filePath: string): DetectedSystem {
		const normalizedPath = filePath.replace(/\\/g, "/");

		for (const { pattern, system } of PATH_REGEX_PATTERNS) {
			if (pattern.test(normalizedPath)) {
				return system;
			}
		}

		return "Unknown";
	}

	/**
	 * Check if a file extension represents a raw binary format
	 * that should have its header scanned.
	 */
	private isBinaryFormat(ext: string): boolean {
		return ext === "iso" || ext === "bin" || ext === "img" || ext === "mdf";
	}

	private supportsCompanionCueFallback(ext: string): boolean {
		return ext === "bin" || ext === "img" || ext === "mdf" || ext === "ccd";
	}

	private async isDefinitivePs3Executable(filePath: string): Promise<boolean> {
		const normalized = filePath.replace(/\\/g, "/");
		if (!PS3_EBOOT_PATH_REGEX.test(normalized)) {
			return false;
		}

		try {
			const { fileSystem } = this.deps;
			const header = await fileSystem.readBytes(filePath, 0, 4);
			return (
				this.matchSignature(header, 0, SCE_EXEC_MAGIC) ||
				this.matchSignature(header, 0, ELF_EXEC_MAGIC)
			);
		} catch {
			return false;
		}
	}

	private async readPointerText(path: string): Promise<string> {
		const { fileSystem } = this.deps;
		const fastRead = await fileSystem.readText(path, HEADER_READ_SIZE);
		if (fastRead.length > 0) {
			return fastRead;
		}
		return fileSystem.readTextFile(path);
	}

	private async detectFromCueMetadata(
		cuePath: string,
	): Promise<DetectedSystem> {
		try {
			const cueText = await this.readPointerText(cuePath);
			return this.detectCueTrackSystem(cueText);
		} catch {
			return "Unknown";
		}
	}

	private async detectFromCompanionCueMetadata(
		path: string,
	): Promise<DetectedSystem> {
		try {
			const { fileSystem } = this.deps;
			const dir = await fileSystem.dirname(path);
			const filename = this.basename(path);
			const baseName = filename.replace(/\.[^.]+$/, "");
			const companionCue = await fileSystem.joinPath(dir, `${baseName}.cue`);
			if (!(await fileSystem.exists(companionCue))) {
				return "Unknown";
			}
			return this.detectFromCueMetadata(companionCue);
		} catch {
			return "Unknown";
		}
	}

	private detectCueTrackSystem(cueText: string): DetectedSystem {
		// Reliable heuristic for PlayStation CD images.
		if (/\bTRACK\s+\d+\s+MODE2\/2352\b/i.test(cueText)) {
			return "PS1";
		}
		return "Unknown";
	}

	private basename(path: string): string {
		return path.replace(/^.*[\\/]/, "");
	}
}
