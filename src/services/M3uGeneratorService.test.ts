import { describe, expect, it } from "vitest";
import type { IFileSystemRepository } from "@/domain/repositories/IFileSystemRepository";
import { M3uGeneratorService } from "./M3uGeneratorService";

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
		async computeFileSha1() {
			return "";
		},
		...overrides,
	};
}

// ── groupByDisc ──────────────────────────────────────────────

describe("M3uGeneratorService.groupByDisc", () => {
	it("groups standard (Disc N) patterns", () => {
		const filenames = ["MGS (Disc 1).chd", "MGS (Disc 2).chd"];
		const groups = M3uGeneratorService.groupByDisc(filenames);

		expect(groups.size).toBe(1);
		const group = groups.get("MGS");
		expect(group).toBeDefined();
		expect(group?.entries).toHaveLength(2);
		expect(group?.entries[0].discNumber).toBe(1);
		expect(group?.entries[1].discNumber).toBe(2);
	});

	it("groups [Disc N] bracket variants", () => {
		const filenames = ["Game [Disc 1].chd", "Game [Disc 2].chd"];
		const groups = M3uGeneratorService.groupByDisc(filenames);
		expect(groups.size).toBe(1);
		expect(groups.has("Game")).toBe(true);
	});

	it("groups (Pt N) variants", () => {
		const filenames = ["My Game (Pt 1).chd", "My Game (Pt 2).chd"];
		const groups = M3uGeneratorService.groupByDisc(filenames);
		expect(groups.size).toBe(1);
		expect(groups.has("My Game")).toBe(true);
	});

	it("groups (Part N) variants", () => {
		const filenames = [
			"RPG (Part 1).chd",
			"RPG (Part 2).chd",
			"RPG (Part 3).chd",
		];
		const groups = M3uGeneratorService.groupByDisc(filenames);
		expect(groups.size).toBe(1);
		expect(groups.get("RPG")?.entries).toHaveLength(3);
	});

	it("groups (Disk N) variants", () => {
		const filenames = ["Game (Disk 1).chd", "Game (Disk 2).chd"];
		const groups = M3uGeneratorService.groupByDisc(filenames);
		expect(groups.size).toBe(1);
		expect(groups.has("Game")).toBe(true);
	});

	it("does not group single-disc games", () => {
		const filenames = ["Single Game.chd"];
		const groups = M3uGeneratorService.groupByDisc(filenames);
		expect(groups.size).toBe(0);
	});

	it("separates different base names into different groups", () => {
		const filenames = [
			"MGS (Disc 1).chd",
			"MGS (Disc 2).chd",
			"FF7 (Disc 1).chd",
			"FF7 (Disc 2).chd",
			"FF7 (Disc 3).chd",
		];
		const groups = M3uGeneratorService.groupByDisc(filenames);
		expect(groups.size).toBe(2);
		expect(groups.get("MGS")?.entries).toHaveLength(2);
		expect(groups.get("FF7")?.entries).toHaveLength(3);
	});

	it("sorts entries by disc number", () => {
		const filenames = [
			"Game (Disc 3).chd",
			"Game (Disc 1).chd",
			"Game (Disc 2).chd",
		];
		const groups = M3uGeneratorService.groupByDisc(filenames);
		const entries = groups.get("Game")?.entries ?? [];
		expect(entries[0].discNumber).toBe(1);
		expect(entries[1].discNumber).toBe(2);
		expect(entries[2].discNumber).toBe(3);
	});
});

// ── generateM3uFiles ────────────────────────────────────────

describe("M3uGeneratorService.generateM3uFiles", () => {
	it("generates M3U for multi-disc group with correct content", async () => {
		const writtenFiles: Record<string, string> = {};
		const fs = createMockFileSystem({
			async writeTextFile(path, content) {
				writtenFiles[path] = content;
			},
		});

		const paths = ["/output/MGS (Disc 1).chd", "/output/MGS (Disc 2).chd"];

		const result = await M3uGeneratorService.generateM3uFiles(
			"/output",
			paths,
			fs,
		);

		expect(result).toHaveLength(1);
		expect(result[0]).toBe("/output/MGS.m3u");

		const content = writtenFiles["/output/MGS.m3u"];
		expect(content).toBe("MGS (Disc 1).chd\nMGS (Disc 2).chd");
	});

	it("does not generate M3U for single-disc games", async () => {
		const writtenFiles: Record<string, string> = {};
		const fs = createMockFileSystem({
			async writeTextFile(path, content) {
				writtenFiles[path] = content;
			},
		});

		const paths = ["/output/Single Game.chd"];
		const result = await M3uGeneratorService.generateM3uFiles(
			"/output",
			paths,
			fs,
		);

		expect(result).toHaveLength(0);
		expect(Object.keys(writtenFiles)).toHaveLength(0);
	});

	it("generates separate M3U files for different games", async () => {
		const writtenFiles: Record<string, string> = {};
		const fs = createMockFileSystem({
			async writeTextFile(path, content) {
				writtenFiles[path] = content;
			},
		});

		const paths = [
			"/output/MGS (Disc 1).chd",
			"/output/MGS (Disc 2).chd",
			"/output/FF7 (Disc 1).chd",
			"/output/FF7 (Disc 2).chd",
			"/output/FF7 (Disc 3).chd",
		];

		const result = await M3uGeneratorService.generateM3uFiles(
			"/output",
			paths,
			fs,
		);

		expect(result).toHaveLength(2);
		expect(writtenFiles["/output/MGS.m3u"]).toBe(
			"MGS (Disc 1).chd\nMGS (Disc 2).chd",
		);
		expect(writtenFiles["/output/FF7.m3u"]).toBe(
			"FF7 (Disc 1).chd\nFF7 (Disc 2).chd\nFF7 (Disc 3).chd",
		);
	});

	it("respects disc ordering in generated content", async () => {
		const writtenFiles: Record<string, string> = {};
		const fs = createMockFileSystem({
			async writeTextFile(path, content) {
				writtenFiles[path] = content;
			},
		});

		const paths = [
			"/output/Game (Disc 3).chd",
			"/output/Game (Disc 1).chd",
			"/output/Game (Disc 2).chd",
		];

		await M3uGeneratorService.generateM3uFiles("/output", paths, fs);
		const lines = writtenFiles["/output/Game.m3u"].split("\n");
		expect(lines[0]).toBe("Game (Disc 1).chd");
		expect(lines[1]).toBe("Game (Disc 2).chd");
		expect(lines[2]).toBe("Game (Disc 3).chd");
	});
});
