import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function getBasename(path: string): string {
	const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
	const basenameWithExt = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
	const lastDot = basenameWithExt.lastIndexOf(".");
	return lastDot > 0 ? basenameWithExt.slice(0, lastDot) : basenameWithExt;
}

export function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return "0s";
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	if (h > 0) return `${h}h ${m}m ${s}s`;
	if (m > 0) return `${m}m ${s}s`;
	return `${s}s`;
}

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatSize(bytes: number): string {
	if (!Number.isFinite(bytes)) return "Unknown";
	const safe = Math.max(0, bytes);
	if (safe === 0) return "0 B";
	let size = safe;
	let unitIndex = 0;
	while (size >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
		size /= 1024;
		unitIndex++;
	}
	return `${size.toFixed(2)} ${SIZE_UNITS[unitIndex]}`;
}

export function formatDeltaSize(bytes: number): string {
	if (bytes === 0) return "0 B";
	return formatSize(Math.abs(bytes));
}

export function formatRatio(ratio: number): string {
	if (!Number.isFinite(ratio)) return "-";
	return `${Number.isInteger(ratio) ? ratio.toString() : ratio.toFixed(1)}%`;
}

export function formatCompactRatio(
	ratio: number | undefined,
): string | undefined {
	if (ratio === undefined || !Number.isFinite(ratio)) return undefined;
	return `${ratio.toFixed(1)}%`;
}

export function formatFileSize(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function estimateSavedBytes(
	originalSize: number,
	compressionRatio: number,
): number {
	if (!Number.isFinite(originalSize) || !Number.isFinite(compressionRatio))
		return 0;
	return originalSize - originalSize * (compressionRatio / 100);
}

export function formatPlatformLabel(platform: string): string {
	switch (platform) {
		case "ps1":
			return "PS1";
		case "ps2":
			return "PS2";
		case "psp":
			return "PSP";
		case "saturn":
			return "Saturn";
		case "dreamcast":
			return "Dreamcast";
		case "gamecube":
			return "GameCube";
		case "wii":
			return "Wii";
		case "segacd":
			return "Sega CD";
		default:
			return "Auto";
	}
}
