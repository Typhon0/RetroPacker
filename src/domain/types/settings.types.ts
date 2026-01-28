/**
 * Domain Types - Settings
 * Type definitions for application settings and tool configurations.
 *
 * @module domain/types/settings.types
 */

/**
 * Compression preset levels.
 */
export type CompressionPreset = "balanced" | "max" | "fast" | "raw" | "custom";

/**
 * Media type for CHD compression.
 */
export type MediaType = "auto" | "cd" | "dvd" | "hdd" | "ld" | "raw";

/**
 * Output format for DolphinTool.
 */
export type DolphinFormat = "rvz" | "iso" | "gcz" | "wia";

/**
 * Compression algorithm for DolphinTool.
 */
export type DolphinCompressionAlgorithm = "zstd" | "lzma" | "none";

/**
 * Verification algorithm for DolphinTool verify command.
 */
export type VerifyAlgorithm = "md5" | "sha1" | "crc32";

/**
 * CHD-specific settings for chdman.
 */
export interface ChdSettings {
	/** Hunk size in bytes (e.g., 2048). Undefined means auto-detect. */
	readonly hunkSize?: number;
	/** Media type for compression strategy. */
	readonly mediaType: MediaType;
}

/**
 * Dolphin-specific settings for DolphinTool.
 */
export interface DolphinSettings {
	/** Block size in bytes (e.g., 131072 for 128KB). */
	readonly blockSize: number;
	/** Output format for converted files. */
	readonly format: DolphinFormat;
	/** Compression algorithm to use. */
	readonly compressionAlgorithm: DolphinCompressionAlgorithm;
	/** Whether to scrub the disc image. */
	readonly scrub: boolean;
	/** Algorithm for verification. */
	readonly verifyAlgorithm: VerifyAlgorithm;
	/** Whether to extract only game data. */
	readonly extractGameOnly: boolean;
}

/**
 * Default CHD settings.
 */
export const DEFAULT_CHD_SETTINGS: ChdSettings = {
	hunkSize: undefined,
	mediaType: "auto",
};

/**
 * Default Dolphin settings.
 */
export const DEFAULT_DOLPHIN_SETTINGS: DolphinSettings = {
	blockSize: 131072, // 128KB
	format: "rvz",
	compressionAlgorithm: "zstd",
	scrub: false,
	verifyAlgorithm: "md5",
	extractGameOnly: false,
};

/**
 * Compression level mapping for presets.
 */
export const COMPRESSION_LEVEL_MAP: Record<CompressionPreset, number> = {
	fast: 1,
	balanced: 5,
	max: 19,
	raw: 0,
	custom: 5,
} as const;

/**
 * Get compression level for a preset.
 */
export function getCompressionLevel(preset: CompressionPreset): number {
	return COMPRESSION_LEVEL_MAP[preset];
}
