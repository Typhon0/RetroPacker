/**
 * Domain Types - Platform
 * Type definitions for gaming platforms and systems.
 *
 * @module domain/types/platform.types
 */

/**
 * Supported gaming platforms for compression/extraction.
 */
export const PLATFORM = {
	AUTO: "auto",
	PS1: "ps1",
	PS2: "ps2",
	PSP: "psp",
	SATURN: "saturn",
	DREAMCAST: "dreamcast",
	GAMECUBE: "gamecube",
	WII: "wii",
} as const;

export type Platform = (typeof PLATFORM)[keyof typeof PLATFORM];

/**
 * Detected system from file analysis.
 * Can include additional systems not selectable as platforms.
 */
export type DetectedSystem =
	| "PS1"
	| "PS2"
	| "PSP"
	| "Saturn"
	| "Dreamcast"
	| "GameCube"
	| "Wii"
	| "Switch"
	| "CHD"
	| "Unknown";

/**
 * Nintendo platforms that use DolphinTool.
 */
export const NINTENDO_PLATFORMS: readonly Platform[] = [
	PLATFORM.GAMECUBE,
	PLATFORM.WII,
] as const;

/**
 * Check if a platform is a Nintendo platform (uses DolphinTool).
 */
export function isNintendoPlatform(platform: Platform | string): boolean {
	const normalized = platform.toLowerCase();
	return (
		normalized === "gamecube" ||
		normalized === "wii" ||
		normalized === "nintendo"
	);
}

/**
 * Check if a detected system is Nintendo.
 */
export function isNintendoSystem(system: DetectedSystem | string): boolean {
	const normalized = system.toLowerCase();
	return (
		normalized === "gamecube" ||
		normalized === "wii" ||
		normalized === "nintendo"
	);
}

/**
 * Map display names to platform enum values.
 */
export const PLATFORM_DISPLAY_NAMES: Record<Platform, string> = {
	[PLATFORM.AUTO]: "Auto-Detect",
	[PLATFORM.PS1]: "PlayStation 1",
	[PLATFORM.PS2]: "PlayStation 2",
	[PLATFORM.PSP]: "PlayStation Portable",
	[PLATFORM.SATURN]: "Sega Saturn",
	[PLATFORM.DREAMCAST]: "Sega Dreamcast",
	[PLATFORM.GAMECUBE]: "Nintendo GameCube",
	[PLATFORM.WII]: "Nintendo Wii",
};
