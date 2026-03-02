import { open, type SeekMode } from "@tauri-apps/plugin-fs";
import {
	isNintendoSystem,
	isPlayStationSystem,
} from "@/domain/types/platform.types";
import { BinaryManagerService } from "./BinaryManagerService";

type ReadableHandle = {
	read: (buffer: Uint8Array) => Promise<number | null>;
	close: () => Promise<void>;
	seek?: (offset: number, mode: SeekMode) => Promise<number>;
};

/**
 * Extracts game identifiers from ROM files using binary header analysis
 * and external tool output (chdman, DolphinTool).
 */
export class GameIdExtractor {
	/**
	 * Extract game ID from a file using external tools first, then binary headers.
	 */
	static async extractGameId(
		filePath: string,
		system: string,
	): Promise<string | null> {
		const toolId = await GameIdExtractor.extractIdViaTools(filePath, system);
		if (toolId) {
			console.log(`[GameIdExtractor] Tool extraction success: ${toolId}`);
			return toolId;
		}

		if (isNintendoSystem(system)) {
			return GameIdExtractor.extractNintendoGameId(filePath);
		}
		if (isPlayStationSystem(system) && system.toLowerCase() === "psp") {
			return GameIdExtractor.extractPSPGameId(filePath);
		}
		return GameIdExtractor.extractPSGameId(filePath);
	}

	/**
	 * Try to extract ID via external tools (chdman info, dolphintool header).
	 */
	static async extractIdViaTools(
		filePath: string,
		system: string,
	): Promise<string | null> {
		const ext = filePath.split(".").pop()?.toLowerCase();

		if (ext === "chd") {
			return GameIdExtractor.parseChdInfo(filePath);
		}

		if (isNintendoSystem(system)) {
			if (["rvz", "gcz", "wbfs", "iso", "ciso"].includes(ext || "")) {
				return GameIdExtractor.parseDolphinHeader(filePath);
			}
		}

		return null;
	}

	private static async parseChdInfo(filePath: string): Promise<string | null> {
		try {
			const stdout = await BinaryManagerService.execute("chdman", [
				"info",
				"-i",
				filePath,
			]);

			const match = stdout.match(/[A-Z]{4}[-_]?\d{5}/);
			if (match) {
				const id = match[0].replace("_", "-");
				if (!id.includes("-")) {
					return `${id.substring(0, 4)}-${id.substring(4)}`;
				}
				return id;
			}

			return null;
		} catch (e: unknown) {
			console.warn("chdman info failed:", e);
			return null;
		}
	}

	private static async parseDolphinHeader(
		filePath: string,
	): Promise<string | null> {
		try {
			const stdout = await BinaryManagerService.execute("dolphintool", [
				"header",
				"-i",
				filePath,
			]);

			const match = stdout.match(/Game ID:\s*([A-Z0-9]{6})/i);
			if (match) return match[1];

			return null;
		} catch (e: unknown) {
			console.warn("dolphintool header failed:", e);
			return null;
		}
	}

	private static async extractPSGameId(
		filePath: string,
	): Promise<string | null> {
		let file: ReadableHandle | null = null;
		try {
			file = (await open(filePath, { read: true })) as ReadableHandle;

			const buffer = new Uint8Array(2 * 1024 * 1024);
			await file.read(buffer);
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
		} finally {
			if (file) await file.close();
		}
	}

	private static async extractPSPGameId(
		filePath: string,
	): Promise<string | null> {
		return GameIdExtractor.extractPSGameId(filePath);
	}

	private static async extractNintendoGameId(
		filePath: string,
	): Promise<string | null> {
		let file: ReadableHandle | null = null;
		try {
			file = (await open(filePath, { read: true })) as ReadableHandle;
			const buffer = new Uint8Array(6);
			await file.read(buffer);
			const id = new TextDecoder("ascii").decode(buffer);
			return /^[A-Z0-9]{6}$/.test(id) ? id : null;
		} catch {
			return null;
		} finally {
			if (file) await file.close();
		}
	}
}
