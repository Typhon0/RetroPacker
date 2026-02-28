import { describe, expect, it } from "vitest";
import { CueProcessorService } from "./CueProcessorService";
import type { IFileSystemRepository } from "@/domain/repositories/IFileSystemRepository";

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
		async removeDirectory() {
			return;
		},
		async computeFileHash() {
			return "";
		},
		...overrides,
	};
}

// ── repairCue ────────────────────────────────────────────────

describe("CueProcessorService.repairCue", () => {
	it("strips absolute Windows paths from FILE directive", () => {
		const input = `FILE "C:\\Users\\Name\\game.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n`;
		const result = CueProcessorService.repairCue(input);
		expect(result).toContain(`FILE "game.bin" BINARY`);
		expect(result).not.toContain("C:\\");
	});

	it("strips absolute Unix paths from FILE directive", () => {
		const input = `FILE "/home/user/roms/game.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n`;
		const result = CueProcessorService.repairCue(input);
		expect(result).toContain(`FILE "game.bin" BINARY`);
		expect(result).not.toContain("/home/");
	});

	it("leaves relative paths unchanged", () => {
		const input = `FILE "game.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n`;
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
	it("repairs a .cue file with absolute path and writes to temp", async () => {
		const writtenFiles: Record<string, string> = {};
		const fs = createMockFileSystem({
			async readTextFile() {
				return `FILE "D:\\ISOs\\PS1\\Crash Bandicoot.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n`;
			},
			async writeTextFile(path, content) {
				writtenFiles[path] = content;
			},
		});

		const result = await CueProcessorService.prepareInput(
			"/roms/Crash Bandicoot.cue",
			"/output",
			fs,
		);

		expect(result).toBe("/output/.retropacker_temp/Crash Bandicoot.cue");
		expect(writtenFiles[result!]).toContain(
			`FILE "Crash Bandicoot.bin" BINARY`,
		);
		expect(writtenFiles[result!]).not.toContain("D:\\");
	});

	it("generates a CUE for a naked .bin file without companion", async () => {
		const writtenFiles: Record<string, string> = {};
		const fs = createMockFileSystem({
			async exists() {
				return false;
			},
			async writeTextFile(path, content) {
				writtenFiles[path] = content;
			},
		});

		const result = await CueProcessorService.prepareInput(
			"/roms/game.bin",
			"/output",
			fs,
		);

		expect(result).toBe("/output/.retropacker_temp/game.cue");
		expect(writtenFiles[result!]).toContain(`FILE "game.bin" BINARY`);
		expect(writtenFiles[result!]).toContain("MODE2/2352");
	});

	it("preprocesses companion .cue when .bin has one", async () => {
		const writtenFiles: Record<string, string> = {};
		const fs = createMockFileSystem({
			async exists(path) {
				return path.endsWith(".cue");
			},
			async readTextFile() {
				return `FILE "C:\\old\\game.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n`;
			},
			async writeTextFile(path, content) {
				writtenFiles[path] = content;
			},
		});

		const result = await CueProcessorService.prepareInput(
			"/roms/game.bin",
			"/output",
			fs,
		);

		// Should have preprocessed the companion .cue, not generated a new one
		expect(result).toBe("/output/.retropacker_temp/game.cue");
		expect(writtenFiles[result!]).toContain(`FILE "game.bin" BINARY`);
		expect(writtenFiles[result!]).not.toContain("C:\\");
	});

	it("returns null for .iso files (no preprocessing needed)", async () => {
		const fs = createMockFileSystem();
		const result = await CueProcessorService.prepareInput(
			"/roms/game.iso",
			"/output",
			fs,
		);
		expect(result).toBeNull();
	});

	it("creates the temp directory before writing", async () => {
		const createdDirs: string[] = [];
		const fs = createMockFileSystem({
			async exists() {
				return false;
			},
			async createDirectory(path) {
				createdDirs.push(path);
			},
			async writeTextFile() {
				return;
			},
		});

		await CueProcessorService.prepareInput("/roms/game.bin", "/output", fs);
		expect(createdDirs).toContain("/output/.retropacker_temp");
	});
});
