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
	SEGACD: "segacd",
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
	| "SegaCD"
	| "GameCube"
	| "Wii"
	| "Switch"
	| "CHD"
	| "Unsupported"
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
 * Check if a detected system is a PlayStation platform.
 */
export function isPlayStationSystem(system: DetectedSystem | string): boolean {
	const normalized = system.toLowerCase();
	return normalized === "ps1" || normalized === "ps2" || normalized === "psp";
}

/**
 * Check if a detected system is a Sega platform.
 */
export function isSegaPlatform(system: DetectedSystem | string): boolean {
	const normalized = system.toLowerCase();
	return (
		normalized === "saturn" ||
		normalized === "dreamcast" ||
		normalized === "segacd"
	);
}

/**
 * Check if a detected system should use CD tooling strategy.
 */
export function isCdSystem(system: DetectedSystem | string): boolean {
	const normalized = system.toLowerCase();
	return (
		normalized === "ps1" ||
		normalized === "saturn" ||
		normalized === "dreamcast" ||
		normalized === "segacd"
	);
}

/**
 * Check if a detected system should use DVD tooling strategy.
 */
export function isDvdSystem(system: DetectedSystem | string): boolean {
	const normalized = system.toLowerCase();
	return normalized === "ps2" || normalized === "psp";
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
	[PLATFORM.SEGACD]: "Sega CD",
	[PLATFORM.GAMECUBE]: "Nintendo GameCube",
	[PLATFORM.WII]: "Nintendo Wii",
};
