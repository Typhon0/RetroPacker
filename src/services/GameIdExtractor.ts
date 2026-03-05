import type { ICommandExecutor } from "@/domain/repositories/ICommandExecutor";
import type { IFileSystemRepository } from "@/domain/repositories/IFileSystemRepository";
import {
	isNintendoSystem,
	isPlayStationSystem,
} from "@/domain/types/platform.types";

export interface GameIdExtractorDependencies {
	readonly commandExecutor: Pick<ICommandExecutor, "execute">;
	readonly fileSystem: Pick<IFileSystemRepository, "readBytes">;
}

/**
 * Extract game ID from a file using external tools first, then binary headers.
 */
export async function extractGameId(
	filePath: string,
	system: string,
	deps: GameIdExtractorDependencies,
): Promise<string | null> {
	const toolId = await extractIdViaTools(filePath, system, deps);
	if (toolId) {
		console.log(`[GameIdExtractor] Tool extraction success: ${toolId}`);
		return toolId;
	}

	if (isNintendoSystem(system)) {
		return extractNintendoGameId(filePath, deps);
	}
	if (isPlayStationSystem(system) && system.toLowerCase() === "psp") {
		return extractPSPGameId(filePath, deps);
	}
	return extractPSGameId(filePath, deps);
}

/**
 * Try to extract ID via external tools (chdman info, DolphinTool header).
 */
export async function extractIdViaTools(
	filePath: string,
	system: string,
	deps: GameIdExtractorDependencies,
): Promise<string | null> {
	const ext = filePath.split(".").pop()?.toLowerCase();

	if (ext === "chd") {
		return parseChdInfo(filePath, deps);
	}

	if (isNintendoSystem(system)) {
		if (["rvz", "gcz", "wbfs", "iso", "ciso"].includes(ext || "")) {
			return parseDolphinHeader(filePath, deps);
		}
	}

	return null;
}

async function parseChdInfo(
	filePath: string,
	deps: GameIdExtractorDependencies,
): Promise<string | null> {
	try {
		const result = await deps.commandExecutor.execute("chdman", [
			"info",
			"-i",
			filePath,
		]);
		if (result.code !== 0 || !result.stdout) {
			return null;
		}

		const match = result.stdout.match(/[A-Z]{4}[-_]?\d{5}/);
		if (!match) {
			return null;
		}

		const id = match[0].replace("_", "-");
		if (!id.includes("-")) {
			return `${id.substring(0, 4)}-${id.substring(4)}`;
		}
		return id;
	} catch (e: unknown) {
		console.warn("chdman info failed:", e);
		return null;
	}
}

async function parseDolphinHeader(
	filePath: string,
	deps: GameIdExtractorDependencies,
): Promise<string | null> {
	try {
		const result = await deps.commandExecutor.execute("DolphinTool", [
			"header",
			"-i",
			filePath,
		]);
		if (result.code !== 0 || !result.stdout) {
			return null;
		}

		const match = result.stdout.match(/Game ID:\s*([A-Z0-9]{6})/i);
		return match ? match[1] : null;
	} catch (e: unknown) {
		console.warn("dolphintool header failed:", e);
		return null;
	}
}

async function extractPSGameId(
	filePath: string,
	deps: GameIdExtractorDependencies,
): Promise<string | null> {
	try {
		const buffer = await deps.fileSystem.readBytes(
			filePath,
			0,
			2 * 1024 * 1024,
		);
		const text = new TextDecoder("ascii").decode(buffer);

		const match =
			text.match(/[A-Z]{4}[-_]\d{3}\.?\d{2}/) ||
			text.match(/[A-Z]{4}\s+\d{5}/) ||
			text.match(/[A-Z]{4}[-_]?\d{5}/);

		if (match) {
			return match[0].replace("_", "-").replace(".", "");
		}
		return null;
	} catch {
		return null;
	}
}

async function extractPSPGameId(
	filePath: string,
	deps: GameIdExtractorDependencies,
): Promise<string | null> {
	return extractPSGameId(filePath, deps);
}

async function extractNintendoGameId(
	filePath: string,
	deps: GameIdExtractorDependencies,
): Promise<string | null> {
	try {
		const buffer = await deps.fileSystem.readBytes(filePath, 0, 6);
		const id = new TextDecoder("ascii").decode(buffer);
		return /^[A-Z0-9]{6}$/.test(id) ? id : null;
	} catch {
		return null;
	}
}
