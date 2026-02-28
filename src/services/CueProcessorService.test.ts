import { describe, expect, it } from "vitest";
import type {
	DirectoryEntry,
	IFileSystemRepository,
} from "@/domain/repositories/IFileSystemRepository";
import { CueProcessorService } from "./CueProcessorService";

// ── Helpers ──────────────────────────────────────────────────

function createMockFileSystem(
	overrides: Partial<IFileSystemRepository> = {},
): IFileSystemRepository {
	return {
		async getFileInfo(path) {
			return {
				path,
				name: path.split(/[\\/]/).pop() ?? "",
				size: 0,
				isDirectory: false,
				extension: "",
			};
		},
		async exists() {
			return false;
		},
		async readDirectory() {
			return [];
		},
		async joinPath(...segments) {
			return segments.join("/");
		},
		async dirname(path) {
			const idx = path.replace(/\\/g, "/").lastIndexOf("/");
			return idx === -1 ? "." : path.slice(0, idx);
		},
		async readBytes() {
			return new Uint8Array();
		},
		async writeTextFile() {
			return;
		},
		async createDirectory() {
			return;
		},
		async moveToTrash() {
			return true;
		},
		async readTextFile() {
			return "";
		},
		async readText() {
			return "";
		},
		async removeDirectory() {
			return;
		},
		async computeFileHash() {
			return "";
		},
		...overrides,
	};
}

function fileEntry(name: string): DirectoryEntry {
	return {
		name,
		isFile: true,
		isDirectory: false,
	};
}

const MODE2_CUE = `  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n`;

// ── repairCue ────────────────────────────────────────────────

describe("CueProcessorService.repairCue", () => {
	it("strips absolute Windows paths from FILE directive", () => {
		const input = `FILE "C:\\Users\\Name\\game.bin" BINARY\n${MODE2_CUE}`;
		const result = CueProcessorService.repairCue(input);
		expect(result).toContain(`FILE "game.bin" BINARY`);
		expect(result).not.toContain("C:\\");
	});

	it("strips absolute Unix paths from FILE directive", () => {
		const input = `FILE "/home/user/roms/game.bin" BINARY\n${MODE2_CUE}`;
		const result = CueProcessorService.repairCue(input);
		expect(result).toContain(`FILE "game.bin" BINARY`);
		expect(result).not.toContain("/home/");
	});

	it("leaves relative paths unchanged", () => {
		const input = `FILE "game.bin" BINARY\n${MODE2_CUE}`;
		const result = CueProcessorService.repairCue(input);
		expect(result).toBe(input);
	});

	it("handles multiple FILE directives", () => {
		const input = [
			`FILE "D:\\ISOs\\track01.bin" BINARY`,
			`  TRACK 01 MODE2/2352`,
			`    INDEX 01 00:00:00`,
			`FILE "D:\\ISOs\\track02.bin" BINARY`,
			`  TRACK 02 AUDIO`,
			`    INDEX 01 00:00:00`,
		].join("\n");
		const result = CueProcessorService.repairCue(input);
		expect(result).toContain(`FILE "track01.bin" BINARY`);
		expect(result).toContain(`FILE "track02.bin" BINARY`);
		expect(result).not.toContain("D:\\");
	});
});

// ── generateCue ──────────────────────────────────────────────

describe("CueProcessorService.generateCue", () => {
	it("generates correct MODE2/2352 CUE content", () => {
		const result = CueProcessorService.generateCue("game.bin");
		expect(result).toBe(
			`FILE "game.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n`,
		);
	});

	it("uses the exact basename provided", () => {
		const result = CueProcessorService.generateCue("Crash Bandicoot (USA).bin");
		expect(result).toContain(`FILE "Crash Bandicoot (USA).bin" BINARY`);
	});
});

// ── prepareInput ─────────────────────────────────────────────

describe("CueProcessorService.prepareInput", () => {
	it("writes repaired temp cue for absolute path references", async () => {
		const writtenFiles: Record<string, string> = {};
		const fs = createMockFileSystem({
			async readText() {
				return `FILE "D:\\ISOs\\PS1\\Crash Bandicoot.bin" BINARY\n${MODE2_CUE}`;
			},
			async exists(path) {
				return path.endsWith("Crash Bandicoot.bin");
			},
			async writeTextFile(path, content) {
				writtenFiles[path] = content;
			},
		});

		const result = await CueProcessorService.prepareInput(
			"/roms/Crash Bandicoot.cue",
			"/output/.retropacker_temp",
			fs,
		);

		expect(result.success).toBe(true);
		const modifiedPath = result.modifiedPath;
		if (!modifiedPath) {
			throw new Error("Expected a temp cue path for repaired cue");
		}
		expect(modifiedPath).toBe("/output/.retropacker_temp/Crash Bandicoot.cue");
		expect(writtenFiles[modifiedPath]).toContain(
			`FILE "Crash Bandicoot.bin" BINARY`,
		);
		expect(writtenFiles[modifiedPath]).not.toContain("D:\\");
	});

	it("returns success without override when cue is already valid", async () => {
		const fs = createMockFileSystem({
			async readText() {
				return `FILE "game.bin" BINARY\n${MODE2_CUE}`;
			},
			async exists(path) {
				return path.endsWith("/roms/game.bin");
			},
		});

		const result = await CueProcessorService.prepareInput(
			"/roms/game.cue",
			"/output/.retropacker_temp",
			fs,
		);

		expect(result.success).toBe(true);
		expect(result.modifiedPath).toBeUndefined();
	});

	it("relinks renamed single-bin cues and writes temp cue", async () => {
		const writtenFiles: Record<string, string> = {};
		const fs = createMockFileSystem({
			async readText() {
				return `FILE "old-name.bin" BINARY\n${MODE2_CUE}`;
			},
			async readDirectory() {
				return [fileEntry("new-name.bin")];
			},
			async exists(path) {
				return path.endsWith("/roms/new-name.bin");
			},
			async writeTextFile(path, content) {
				writtenFiles[path] = content;
			},
		});

		const result = await CueProcessorService.prepareInput(
			"/roms/game.cue",
			"/output/.retropacker_temp",
			fs,
		);

		expect(result.success).toBe(true);
		const modifiedPath = result.modifiedPath;
		if (!modifiedPath) {
			throw new Error("Expected a temp cue path for relinked cue");
		}
		expect(modifiedPath).toBe("/output/.retropacker_temp/game.cue");
		expect(writtenFiles[modifiedPath]).toContain(`FILE "new-name.bin" BINARY`);
	});

	it("repairs all FILE lines in a multi-track cue", async () => {
		const writtenFiles: Record<string, string> = {};
		const fs = createMockFileSystem({
			async readText() {
				return [
					`FILE "D:\\roms\\Tomb Raider (Track 1).bin" BINARY`,
					`  TRACK 01 MODE2/2352`,
					`    INDEX 01 00:00:00`,
					`FILE "D:\\roms\\Tomb Raider (Track 2).bin" BINARY`,
					`  TRACK 02 AUDIO`,
					`    INDEX 00 00:00:00`,
				].join("\n");
			},
			async exists(path) {
				return (
					path.endsWith("Tomb Raider (Track 1).bin") ||
					path.endsWith("Tomb Raider (Track 2).bin")
				);
			},
			async writeTextFile(path, content) {
				writtenFiles[path] = content;
			},
		});

		const result = await CueProcessorService.prepareInput(
			"/roms/Tomb Raider.cue",
			"/output/.retropacker_temp",
			fs,
		);

		expect(result.success).toBe(true);
		const modifiedPath = result.modifiedPath;
		if (!modifiedPath) {
			throw new Error("Expected a temp cue path for repaired multi-track cue");
		}
		expect(modifiedPath).toBe("/output/.retropacker_temp/Tomb Raider.cue");
		expect(writtenFiles[modifiedPath]).toContain(
			`FILE "Tomb Raider (Track 1).bin" BINARY`,
		);
		expect(writtenFiles[modifiedPath]).toContain(
			`FILE "Tomb Raider (Track 2).bin" BINARY`,
		);
		expect(writtenFiles[modifiedPath]).not.toContain("D:\\");
	});

	it("fails when referenced bin is missing from cue directory", async () => {
		const fs = createMockFileSystem({
			async readText() {
				return `FILE "missing.bin" BINARY\n${MODE2_CUE}`;
			},
			async readDirectory() {
				return [fileEntry("other.bin")];
			},
			async exists() {
				return false;
			},
		});

		const result = await CueProcessorService.prepareInput(
			"/roms/game.cue",
			"/output/.retropacker_temp",
			fs,
		);

		expect(result.success).toBe(false);
		expect(result.errorMessage).toBe(
			"Referenced .bin file not found in directory.",
		);
	});

	it("generates a cue for single-bin input without a companion cue", async () => {
		const writtenFiles: Record<string, string> = {};
		const fs = createMockFileSystem({
			async readDirectory() {
				return [fileEntry("game.bin")];
			},
			async exists() {
				return false;
			},
			async writeTextFile(path, content) {
				writtenFiles[path] = content;
			},
		});

		const result = await CueProcessorService.prepareInput(
			"/roms/game.bin",
			"/output/.retropacker_temp",
			fs,
		);

		expect(result.success).toBe(true);
		const modifiedPath = result.modifiedPath;
		if (!modifiedPath) {
			throw new Error("Expected a temp cue path for generated cue");
		}
		expect(modifiedPath).toBe("/output/.retropacker_temp/game.cue");
		expect(writtenFiles[modifiedPath]).toContain(`FILE "game.bin" BINARY`);
		expect(writtenFiles[modifiedPath]).toContain("MODE2/2352");
	});

	it("switches from .bin to companion .cue when it exists", async () => {
		const fs = createMockFileSystem({
			async readText() {
				return `FILE "game.bin" BINARY\n${MODE2_CUE}`;
			},
			async exists(path) {
				if (path.endsWith("/roms/game.cue")) return true;
				return path.endsWith("/roms/game.bin");
			},
			async readDirectory() {
				return [fileEntry("game.bin"), fileEntry("game.cue")];
			},
		});

		const result = await CueProcessorService.prepareInput(
			"/roms/game.bin",
			"/output/.retropacker_temp",
			fs,
		);

		expect(result.success).toBe(true);
		expect(result.modifiedPath).toBe("/roms/game.cue");
	});

	it("fails for multi-track bin input without cue", async () => {
		const fs = createMockFileSystem({
			async exists(path) {
				return path.endsWith("/roms/Game (Track 1).bin");
			},
			async readDirectory() {
				return [
					fileEntry("Game (Track 1).bin"),
					fileEntry("Game (Track 2).bin"),
				];
			},
		});

		const result = await CueProcessorService.prepareInput(
			"/roms/Game (Track 1).bin",
			"/output/.retropacker_temp",
			fs,
		);

		expect(result.success).toBe(false);
		expect(result.errorMessage).toBe(
			"Multi-track .bin detected without a .cue file. A valid .cue sheet is required.",
		);
	});

	it("passes through non cue/bin inputs", async () => {
		const fs = createMockFileSystem();
		const result = await CueProcessorService.prepareInput(
			"/roms/game.iso",
			"/output/.retropacker_temp",
			fs,
		);
		expect(result).toEqual({ success: true });
	});
});
