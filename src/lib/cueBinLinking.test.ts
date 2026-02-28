import { describe, expect, it } from "vitest";
import {
	buildCueBinLinkMap,
	filterVisibleCueBinJobs,
} from "@/lib/cueBinLinking";

describe("cueBinLinking", () => {
	it("links one cue + one bin in same folder and keeps cue as default primary", () => {
		const links = buildCueBinLinkMap([
			{
				id: "cue-id",
				path: "/games/Oddworld.cue",
				filename: "Oddworld.cue",
				system: "Unknown",
			},
			{
				id: "bin-id",
				path: "/games/Oddworld.bin",
				filename: "Oddworld.bin",
				system: "Unknown",
			},
		]);

		const pair = links.byPrimary.get("cue-id");
		expect(pair).toBeDefined();
		expect(pair?.companionJobId).toBe("bin-id");
		expect(links.hiddenCompanionJobIds.has("bin-id")).toBe(true);
		expect(links.hiddenCompanionJobIds.has("cue-id")).toBe(false);
	});

	it("prefers the known-platform entry as primary when only one side is known", () => {
		const links = buildCueBinLinkMap([
			{
				id: "cue-id",
				path: "/games/Game.cue",
				filename: "Game.cue",
				system: "Unknown",
			},
			{
				id: "bin-id",
				path: "/games/Game.bin",
				filename: "Game.bin",
				system: "PS1",
			},
		]);

		const pair = links.byPrimary.get("bin-id");
		expect(pair).toBeDefined();
		expect(pair?.companionJobId).toBe("cue-id");
		expect(links.hiddenCompanionJobIds.has("cue-id")).toBe(true);
	});

	it("collapses cue/ccd/img triplets into one primary row", () => {
		const links = buildCueBinLinkMap([
			{
				id: "ccd-id",
				path: "/games/Silent Hill.ccd",
				filename: "Silent Hill.ccd",
				system: "Unknown",
			},
			{
				id: "cue-id",
				path: "/games/Silent Hill.cue",
				filename: "Silent Hill.cue",
				system: "PS1",
			},
			{
				id: "img-id",
				path: "/games/Silent Hill.img",
				filename: "Silent Hill.img",
				system: "Unknown",
			},
		]);

		const pair = links.byPrimary.get("cue-id");
		expect(pair).toBeDefined();
		expect(pair?.companionJobIds).toEqual(["ccd-id", "img-id"]);
		expect(links.hiddenCompanionJobIds.has("ccd-id")).toBe(true);
		expect(links.hiddenCompanionJobIds.has("img-id")).toBe(true);
		expect(links.hiddenCompanionJobIds.has("cue-id")).toBe(false);
	});

	it("does not link entries with different basenames", () => {
		const links = buildCueBinLinkMap([
			{ id: "cue-id", path: "/games/Game.cue", filename: "Game.cue" },
			{
				id: "bin-1",
				path: "/games/Game (Track 1).bin",
				filename: "Game (Track 1).bin",
			},
			{
				id: "bin-2",
				path: "/games/Game (Track 2).bin",
				filename: "Game (Track 2).bin",
			},
		]);

		expect(links.hiddenCompanionJobIds.size).toBe(0);
		expect(links.byPrimary.size).toBe(0);
	});

	it("filters out hidden companion jobs", () => {
		const visible = filterVisibleCueBinJobs([
			{ id: "cue-id", path: "/games/Oddworld.cue", filename: "Oddworld.cue" },
			{ id: "bin-id", path: "/games/Oddworld.bin", filename: "Oddworld.bin" },
			{ id: "ccd-id", path: "/games/Oddworld.ccd", filename: "Oddworld.ccd" },
			{ id: "iso-id", path: "/games/Other.iso", filename: "Other.iso" },
		]);

		expect(visible.map((job) => job.id)).toEqual(["cue-id", "iso-id"]);
	});
});
