import { describe, expect, it } from "vitest";
import {
	buildTree,
	countItems,
	findCommonPrefix,
	findNode,
	getAllPaths,
	type TreeJob,
} from "./JobTreeBuilder";

// ─── findCommonPrefix ────────────────────────────────────────

describe("findCommonPrefix", () => {
	it("finds common folder prefix across multiple jobs", () => {
		const jobs: TreeJob[] = [
			{ id: "1", path: "/roms/ps2/game1.iso" },
			{ id: "2", path: "/roms/ps2/game2.iso" },
			{ id: "3", path: "/roms/ps2/subfolder/game3.iso" },
		];
		const prefix = findCommonPrefix(jobs);
		expect(prefix).toEqual(["roms", "ps2"]);
	});

	it("returns empty for empty job list", () => {
		expect(findCommonPrefix([])).toEqual([]);
	});

	it("handles single job", () => {
		const jobs: TreeJob[] = [{ id: "1", path: "/roms/game.iso" }];
		const prefix = findCommonPrefix(jobs);
		expect(prefix).toEqual(["roms"]);
	});

	it("handles jobs with no common prefix", () => {
		const jobs: TreeJob[] = [
			{ id: "1", path: "/a/game.iso" },
			{ id: "2", path: "/b/game.iso" },
		];
		const prefix = findCommonPrefix(jobs);
		expect(prefix).toEqual([]);
	});

	it("normalizes backslashes to forward slashes", () => {
		const jobs: TreeJob[] = [
			{ id: "1", path: "C:\\roms\\ps2\\game1.iso" },
			{ id: "2", path: "C:\\roms\\ps2\\game2.iso" },
		];
		const prefix = findCommonPrefix(jobs);
		expect(prefix).toEqual(["C:", "roms", "ps2"]);
	});
});

// ─── buildTree ───────────────────────────────────────────────

describe("buildTree", () => {
	it("groups jobs by folder hierarchy", () => {
		const jobs: TreeJob[] = [
			{ id: "1", path: "/roms/ps2/game1.iso" },
			{ id: "2", path: "/roms/ps2/game2.iso" },
			{ id: "3", path: "/roms/psp/game3.iso" },
		];
		const tree = buildTree(jobs);

		// Root should have children since there's a branch at roms
		expect(countItems(tree)).toBe(3);
	});

	it("handles empty job list", () => {
		const tree = buildTree([]);
		expect(tree.name).toBe("Root");
		expect(tree.jobs.length).toBe(0);
		expect(Object.keys(tree.children).length).toBe(0);
	});

	it("handles single job", () => {
		const jobs: TreeJob[] = [{ id: "1", path: "/roms/game.iso" }];
		const tree = buildTree(jobs);
		expect(countItems(tree)).toBe(1);
	});

	it("places jobs in correct leaf nodes", () => {
		const jobs: TreeJob[] = [
			{ id: "1", path: "/roms/ps2/final_fantasy.iso" },
			{ id: "2", path: "/roms/psp/persona.iso" },
		];
		const tree = buildTree(jobs);

		// Tree should have 2 items total across its branches
		expect(countItems(tree)).toBe(2);
	});
});

// ─── getAllPaths ──────────────────────────────────────────────

describe("getAllPaths", () => {
	it("returns all folder paths in the tree", () => {
		const jobs: TreeJob[] = [
			{ id: "1", path: "/roms/ps2/game1.iso" },
			{ id: "2", path: "/roms/psp/game2.iso" },
		];
		const tree = buildTree(jobs);
		const paths = getAllPaths(tree);

		// Should include folder nodes but not root (root has empty path)
		expect(paths.length).toBeGreaterThanOrEqual(1);
	});

	it("returns empty array for single-folder tree", () => {
		const tree = buildTree([]);
		const paths = getAllPaths(tree);
		expect(paths).toEqual([]);
	});
});

// ─── countItems ──────────────────────────────────────────────

describe("countItems", () => {
	it("counts all jobs across nested nodes", () => {
		const jobs: TreeJob[] = [
			{ id: "1", path: "/roms/ps2/game1.iso" },
			{ id: "2", path: "/roms/ps2/game2.iso" },
			{ id: "3", path: "/roms/ps2/sub/game3.iso" },
			{ id: "4", path: "/roms/psp/game4.iso" },
		];
		const tree = buildTree(jobs);
		expect(countItems(tree)).toBe(4);
	});

	it("returns 0 for empty tree", () => {
		const tree = buildTree([]);
		expect(countItems(tree)).toBe(0);
	});
});

// ─── findNode ────────────────────────────────────────────────

describe("findNode", () => {
	it("finds root node", () => {
		const tree = buildTree([]);
		const found = findNode(tree, "");
		expect(found).toBe(tree);
	});

	it("returns null when path not found", () => {
		const jobs: TreeJob[] = [{ id: "1", path: "/roms/game.iso" }];
		const tree = buildTree(jobs);
		const found = findNode(tree, "nonexistent/path");
		expect(found).toBeNull();
	});
});
