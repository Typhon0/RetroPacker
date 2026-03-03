import { describe, expect, it, vi } from "vitest";
import type { DetectSystemDependencies } from "./DetectSystemUseCase";
import { DetectSystemUseCase } from "./DetectSystemUseCase";

/**
 * Creates a DetectSystemUseCase with mock dependencies.
 * readBytes returns an empty 65536-byte buffer by default.
 */
function createUseCase(overrides?: {
	fileSystem?: Partial<DetectSystemDependencies["fileSystem"]>;
	commandExecutor?: DetectSystemDependencies["commandExecutor"];
}) {
	const defaultFileSystem = {
		readBytes: vi.fn().mockResolvedValue(new Uint8Array(65536)),
		readTextFile: vi.fn().mockResolvedValue(""),
		readText: vi.fn().mockResolvedValue(""),
		exists: vi.fn().mockResolvedValue(true),
		dirname: vi.fn().mockImplementation(async (p: string) => {
			const parts = p.replace(/\\/g, "/").split("/");
			parts.pop();
			return parts.join("/");
		}),
		joinPath: vi
			.fn()
			.mockImplementation(async (...segments: string[]) => segments.join("/")),
	};

	const defaultCommandExecutor = {
		execute: vi.fn().mockResolvedValue({
			code: 0,
			signal: null,
			stdout: "",
			stderr: "",
		}),
	};

	return {
		useCase: new DetectSystemUseCase({
			fileSystem: { ...defaultFileSystem, ...overrides?.fileSystem },
			commandExecutor: overrides?.commandExecutor ?? defaultCommandExecutor,
		}),
		mocks: {
			fileSystem: { ...defaultFileSystem, ...overrides?.fileSystem },
			commandExecutor: overrides?.commandExecutor ?? defaultCommandExecutor,
		},
	};
}

/**
 * Helper: build a buffer with specific bytes at given offsets.
 */
function buildHeaderBuffer(
	patches: Array<{ offset: number; bytes: number[] | string }>,
	size = 65536,
): Uint8Array {
	const buf = new Uint8Array(size);
	for (const { offset, bytes } of patches) {
		if (typeof bytes === "string") {
			for (let i = 0; i < bytes.length; i++) {
				buf[offset + i] = bytes.charCodeAt(i);
			}
		} else {
			for (let i = 0; i < bytes.length; i++) {
				buf[offset + i] = bytes[i];
			}
		}
	}
	return buf;
}

describe("DetectSystemUseCase — V3 Omni-Detection Pipeline", () => {
	// ─── Step 1: Reject archives ──────────────────────────────────

	describe("Step 1: Archive rejection", () => {
		it.each(["zip", "7z", "rar"])("rejects .%s as Unknown", async (ext) => {
			const { useCase } = createUseCase();
			const result = await useCase.execute(`/roms/game.${ext}`);
			expect(result).toBe("Unknown");
		});
	});

	describe("Strict PS3 executable rejection", () => {
		it("returns Unsupported only for PS3_GAME/USRDIR/EBOOT.BIN with executable header", async () => {
			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi
						.fn()
						.mockResolvedValue(new Uint8Array([0x53, 0x43, 0x45, 0x00])),
				},
			});

			const result = await useCase.execute("/roms/PS3_GAME/USRDIR/EBOOT.BIN");
			expect(result).toBe("Unsupported");
		});

		it("does not reject if path does not match PS3 executable layout", async () => {
			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi
						.fn()
						.mockResolvedValue(new Uint8Array([0x53, 0x43, 0x45, 0x00])),
				},
			});

			const result = await useCase.execute("/roms/EBOOT.BIN");
			expect(result).toBe("Unknown");
		});
	});

	// ─── Step 2: Compressed emulator format detection ─────────────

	describe("Step 2: CHD metadata (chdman info)", () => {
		it("detects PS2 (DVD) when Logical size is multiple of 2048", async () => {
			const { useCase } = createUseCase({
				commandExecutor: {
					execute: vi.fn().mockResolvedValue({
						code: 0,
						signal: null,
						// 4700372992 % 2048 === 0 but 4700372992 % 2352 !== 0
						stdout: "Logical size: 4,700,372,992\nHunk size: 2048",
						stderr: "",
					}),
				},
			});
			const result = await useCase.execute("/roms/game.chd");
			expect(result).toBe("PS2");
		});

		it("detects PS1 (CD) when Logical size is multiple of 2352", async () => {
			const { useCase } = createUseCase({
				commandExecutor: {
					execute: vi.fn().mockResolvedValue({
						code: 0,
						signal: null,
						stdout: "Logical size: 682,080,000\nHunk size: 2352",
						stderr: "",
					}),
				},
			});
			// 682080000 % 2352 === 0
			const result = await useCase.execute("/roms/game.chd");
			expect(result).toBe("PS1");
		});

		it("falls back to Unknown when chdman info fails", async () => {
			const { useCase } = createUseCase({
				commandExecutor: {
					execute: vi.fn().mockResolvedValue({
						code: 1,
						signal: null,
						stdout: "",
						stderr: "error",
					}),
				},
			});
			const result = await useCase.execute("/roms/game.chd");
			expect(result).toBe("Unknown");
		});

		it("falls back to Unknown when no commandExecutor", async () => {
			const uc = new DetectSystemUseCase({
				fileSystem: {
					readBytes: vi.fn().mockResolvedValue(new Uint8Array(65536)),
					readTextFile: vi.fn().mockResolvedValue(""),
					readText: vi.fn().mockResolvedValue(""),
					exists: vi.fn().mockResolvedValue(true),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});
			const result = await uc.execute("/roms/game.chd");
			expect(result).toBe("Unknown");
		});
	});

	describe("Step 2: DolphinTool header (Nintendo formats)", () => {
		it("detects Wii from Game ID starting with R", async () => {
			const { useCase } = createUseCase({
				commandExecutor: {
					execute: vi.fn().mockResolvedValue({
						code: 0,
						signal: null,
						stdout: "Game ID: RMGE01\nInternal Name: Mario Galaxy",
						stderr: "",
					}),
				},
			});
			const result = await useCase.execute("/roms/game.rvz");
			expect(result).toBe("Wii");
		});

		it("detects GameCube from Game ID starting with G", async () => {
			const { useCase } = createUseCase({
				commandExecutor: {
					execute: vi.fn().mockResolvedValue({
						code: 0,
						signal: null,
						stdout: "Game ID: GALE01\nInternal Name: Smash Bros Melee",
						stderr: "",
					}),
				},
			});
			const result = await useCase.execute("/roms/game.gcz");
			expect(result).toBe("GameCube");
		});

		it("detects Wii from Game ID starting with S", async () => {
			const { useCase } = createUseCase({
				commandExecutor: {
					execute: vi.fn().mockResolvedValue({
						code: 0,
						signal: null,
						stdout: "Game ID: SMNE01",
						stderr: "",
					}),
				},
			});
			const result = await useCase.execute("/roms/game.wia");
			expect(result).toBe("Wii");
		});

		it("detects GameCube from Game ID starting with D", async () => {
			const { useCase } = createUseCase({
				commandExecutor: {
					execute: vi.fn().mockResolvedValue({
						code: 0,
						signal: null,
						stdout: "Game ID: DALE01",
						stderr: "",
					}),
				},
			});
			const result = await useCase.execute("/roms/game.rvz");
			expect(result).toBe("GameCube");
		});

		it("falls back to Unknown when DolphinTool fails on .wbfs", async () => {
			const { useCase } = createUseCase({
				commandExecutor: {
					execute: vi.fn().mockRejectedValue(new Error("tool not found")),
				},
			});
			const result = await useCase.execute("/roms/game.wbfs");
			expect(result).toBe("Unknown");
		});

		it("falls back to Unknown when DolphinTool fails on .rvz", async () => {
			const { useCase } = createUseCase({
				commandExecutor: {
					execute: vi.fn().mockRejectedValue(new Error("tool not found")),
				},
			});
			const result = await useCase.execute("/roms/game.rvz");
			expect(result).toBe("Unknown");
		});
	});

	describe("Step 2: Non-CLI emulator formats", () => {
		it.each(["cso", "ciso"])("detects .%s as PSP", async (ext) => {
			const { useCase } = createUseCase();
			const result = await useCase.execute(`/roms/game.${ext}`);
			expect(result).toBe("PSP");
		});

		it.each(["nsp", "nsz", "xci"])("detects .%s as Switch", async (ext) => {
			const { useCase } = createUseCase();
			const result = await useCase.execute(`/roms/game.${ext}`);
			expect(result).toBe("Switch");
		});
	});

	// ─── Step 3: Pointer file resolution ──────────────────────────

	describe("Step 3: CUE file resolution", () => {
		it("resolves .cue to its binary and detects PS1 from headers", async () => {
			const ps1Buffer = buildHeaderBuffer([
				{ offset: 0x9310, bytes: "PLAYSTATION " },
			]);

			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi.fn().mockResolvedValue(ps1Buffer),
					readTextFile: vi
						.fn()
						.mockResolvedValue(
							'FILE "game.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00',
						),
					exists: vi.fn().mockResolvedValue(true),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});

			const result = await useCase.execute("/roms/game.cue");
			expect(result).toBe("PS1");
		});

		it("resolves absolute CUE FILE path by basename and detects PS1", async () => {
			const ps1Buffer = buildHeaderBuffer([
				{ offset: 0x9310, bytes: "PLAYSTATION " },
			]);

			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi.fn().mockResolvedValue(ps1Buffer),
					readTextFile: vi
						.fn()
						.mockResolvedValue(
							'FILE "D:\\Rips\\Oddworld - Abe\'s Oddysee.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00',
						),
					exists: vi
						.fn()
						.mockImplementation(
							async (path: string) =>
								path === "/roms/Oddworld - Abe's Oddysee.bin",
						),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});

			const result = await useCase.execute(
				"/roms/Oddworld - Abe's Oddysee.cue",
			);
			expect(result).toBe("PS1");
		});

		it("returns Unknown when CUE binary is missing", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi.fn().mockResolvedValue(new Uint8Array(65536)),
					readTextFile: vi
						.fn()
						.mockResolvedValue(
							'FILE "missing.bin" BINARY\n  TRACK 01 MODE1/2048',
						),
					exists: vi.fn().mockResolvedValue(false),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});

			const result = await useCase.execute("/roms/game.cue");
			expect(result).toBe("Unknown");
			warnSpy.mockRestore();
		});

		it("falls back to PS1 from cue metadata when referenced binary is missing", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi.fn().mockResolvedValue(new Uint8Array(65536)),
					readTextFile: vi
						.fn()
						.mockResolvedValue(
							'FILE "missing.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00',
						),
					exists: vi.fn().mockResolvedValue(false),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});

			const result = await useCase.execute("/roms/game.cue");
			expect(result).toBe("PS1");
			warnSpy.mockRestore();
		});
	});

	describe("Companion cue fallback", () => {
		it("detects PS1 from companion cue metadata when BIN header is unknown", async () => {
			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi.fn().mockResolvedValue(new Uint8Array(65536)),
					readTextFile: vi
						.fn()
						.mockResolvedValue(
							'FILE "game.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00',
						),
					exists: vi
						.fn()
						.mockImplementation(
							async (path: string) =>
								path === "/roms/game.bin" || path === "/roms/game.cue",
						),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});

			const result = await useCase.execute("/roms/game.bin");
			expect(result).toBe("PS1");
		});

		it("detects PS1 from companion cue metadata when IMG header is unknown", async () => {
			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi.fn().mockResolvedValue(new Uint8Array(65536)),
					readTextFile: vi
						.fn()
						.mockResolvedValue(
							'FILE "game.img" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00',
						),
					exists: vi
						.fn()
						.mockImplementation(
							async (path: string) =>
								path === "/roms/game.img" || path === "/roms/game.cue",
						),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});

			const result = await useCase.execute("/roms/game.img");
			expect(result).toBe("PS1");
		});

		it("detects PS1 from companion cue metadata when CCD+IMG header is unknown", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi.fn().mockResolvedValue(new Uint8Array(65536)),
					readTextFile: vi
						.fn()
						.mockResolvedValue(
							'FILE "game.img" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00',
						),
					exists: vi
						.fn()
						.mockImplementation(
							async (path: string) =>
								path === "/roms/game.img" || path === "/roms/game.cue",
						),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});

			const result = await useCase.execute("/roms/game.ccd");
			expect(result).toBe("PS1");
			warnSpy.mockRestore();
		});
	});

	describe("Step 3: GDI file resolution", () => {
		it("resolves .gdi to data track and detects Dreamcast", async () => {
			const dcBuffer = buildHeaderBuffer([
				{ offset: 0x10, bytes: "SEGA SEGAKATANA" },
			]);

			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi.fn().mockResolvedValue(dcBuffer),
					readTextFile: vi
						.fn()
						.mockResolvedValue(
							"3\n1 0 4 2352 track01.raw 0\n2 449 0 2352 track02.raw 0\n3 45000 4 2048 track03.bin 0",
						),
					exists: vi.fn().mockResolvedValue(true),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});

			const result = await useCase.execute("/roms/game.gdi");
			expect(result).toBe("Dreamcast");
		});
	});

	describe("Step 3: CCD file resolution", () => {
		it("resolves .ccd to companion .img file", async () => {
			const saturnBuffer = buildHeaderBuffer([
				{ offset: 0x10, bytes: "SEGA SEGASATURN" },
			]);

			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi.fn().mockResolvedValue(saturnBuffer),
					readTextFile: vi.fn().mockResolvedValue(""),
					exists: vi.fn().mockResolvedValue(true),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});

			const result = await useCase.execute("/roms/game.ccd");
			expect(result).toBe("Saturn");
		});
	});

	// ─── Step 4: Binary magic headers ─────────────────────────────

	describe("Step 4: Tier A — DVD formats (2048 bytes/sector)", () => {
		it("detects Wii via magic at offset 0x18", async () => {
			const buf = buildHeaderBuffer([
				{ offset: 0x18, bytes: [0x5d, 0x1c, 0x9e, 0xa3] },
			]);
			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi.fn().mockResolvedValue(buf),
					readTextFile: vi.fn().mockResolvedValue(""),
					exists: vi.fn().mockResolvedValue(true),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});
			expect(await useCase.execute("/roms/game.iso")).toBe("Wii");
		});

		it("detects GameCube via magic at offset 0x1C", async () => {
			const buf = buildHeaderBuffer([
				{ offset: 0x1c, bytes: [0xc2, 0x33, 0x9f, 0x3d] },
			]);
			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi.fn().mockResolvedValue(buf),
					readTextFile: vi.fn().mockResolvedValue(""),
					exists: vi.fn().mockResolvedValue(true),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});
			expect(await useCase.execute("/roms/game.iso")).toBe("GameCube");
		});

		it("detects PSP via ISO descriptor scan when PSP marker is shifted", async () => {
			const buf = buildHeaderBuffer([
				{ offset: 0x8001, bytes: "CD001" },
				{ offset: 0x8060, bytes: "PSP_GAME" },
			]);
			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi.fn().mockResolvedValue(buf),
					readTextFile: vi.fn().mockResolvedValue(""),
					exists: vi.fn().mockResolvedValue(true),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});
			expect(await useCase.execute("/roms/game.iso")).toBe("PSP");
		});

		it("detects PSP by scanning ISO root directory when marker is outside header window", async () => {
			const rootLba = 120;
			const rootSize = 2048;
			const rootOffset = rootLba * 2048;
			const header = new Uint8Array(65536);

			// ISO9660 standard identifier at sector 16 + 1.
			const cd001 = "CD001";
			for (let i = 0; i < cd001.length; i++) {
				header[0x8001 + i] = cd001.charCodeAt(i);
			}

			// Root directory record at PVD + 156.
			const rootRecordOffset = 0x8000 + 156;
			header[rootRecordOffset] = 34;
			header[rootRecordOffset + 2] = rootLba & 0xff;
			header[rootRecordOffset + 3] = (rootLba >> 8) & 0xff;
			header[rootRecordOffset + 4] = (rootLba >> 16) & 0xff;
			header[rootRecordOffset + 5] = (rootLba >> 24) & 0xff;
			header[rootRecordOffset + 10] = rootSize & 0xff;
			header[rootRecordOffset + 11] = (rootSize >> 8) & 0xff;
			header[rootRecordOffset + 12] = (rootSize >> 16) & 0xff;
			header[rootRecordOffset + 13] = (rootSize >> 24) & 0xff;

			const rootDir = new Uint8Array(rootSize);
			const marker = "PSP_GAME";
			for (let i = 0; i < marker.length; i++) {
				rootDir[128 + i] = marker.charCodeAt(i);
			}

			const readBytes = vi
				.fn()
				.mockImplementation(async (_path: string, offset = 0) => {
					if (offset === 0) {
						return header;
					}
					if (offset === rootOffset) {
						return rootDir;
					}
					return new Uint8Array(65536);
				});

			const { useCase } = createUseCase({
				fileSystem: {
					readBytes,
				},
			});
			expect(await useCase.execute("/roms/game.iso")).toBe("PSP");
			expect(readBytes).toHaveBeenCalledWith(
				"/roms/game.iso",
				rootOffset,
				rootSize,
			);
		});

		it("detects PS2 via 'PLAYSTATION ' at offset 0x8010", async () => {
			const buf = buildHeaderBuffer([
				{ offset: 0x8010, bytes: "PLAYSTATION " },
			]);
			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi.fn().mockResolvedValue(buf),
					readTextFile: vi.fn().mockResolvedValue(""),
					exists: vi.fn().mockResolvedValue(true),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});
			expect(await useCase.execute("/roms/game.iso")).toBe("PS2");
		});

		it("detects PS2 via ISO descriptor scan when marker is shifted", async () => {
			const buf = buildHeaderBuffer([
				{ offset: 0x8001, bytes: "CD001" },
				{ offset: 0x8120, bytes: "PLAYSTATION " },
			]);
			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi.fn().mockResolvedValue(buf),
					readTextFile: vi.fn().mockResolvedValue(""),
					exists: vi.fn().mockResolvedValue(true),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});
			expect(await useCase.execute("/roms/game.iso")).toBe("PS2");
		});

		it("detects Wii from shifted Nintendo header via deep scan fallback", async () => {
			const file = new Uint8Array(2 * 1024 * 1024);
			const shiftedHeaderOffset = 98304;
			const gameId = "RZDE01";

			for (let i = 0; i < gameId.length; i++) {
				file[shiftedHeaderOffset + i] = gameId.charCodeAt(i);
			}

			file.set([0x5d, 0x1c, 0x9e, 0xa3], shiftedHeaderOffset + 0x18);

			const readBytes = vi
				.fn()
				.mockImplementation(
					async (
						_path: string,
						offset = 0,
						length = 65536,
					): Promise<Uint8Array> => {
						if (offset >= file.length) {
							return new Uint8Array(0);
						}

						const end = Math.min(file.length, offset + length);
						return file.slice(offset, end);
					},
				);

			const { useCase } = createUseCase({
				fileSystem: { readBytes },
			});

			expect(await useCase.execute("/roms/game.iso")).toBe("Wii");
			expect(
				readBytes.mock.calls.some(([, , length]) =>
					typeof length === "number" ? length > 65536 : false,
				),
			).toBe(true);
		});

		it("does not deep-scan match shifted magic without Nintendo-style game ID", async () => {
			const file = new Uint8Array(2 * 1024 * 1024);
			const shiftedHeaderOffset = 98304;

			for (let i = 0; i < 6; i++) {
				file[shiftedHeaderOffset + i] = "_".charCodeAt(0);
			}

			file.set([0x5d, 0x1c, 0x9e, 0xa3], shiftedHeaderOffset + 0x18);

			const readBytes = vi
				.fn()
				.mockImplementation(
					async (
						_path: string,
						offset = 0,
						length = 65536,
					): Promise<Uint8Array> => {
						if (offset >= file.length) {
							return new Uint8Array(0);
						}

						const end = Math.min(file.length, offset + length);
						return file.slice(offset, end);
					},
				);

			const { useCase } = createUseCase({
				fileSystem: { readBytes },
			});

			expect(await useCase.execute("/roms/game.iso")).toBe("Unknown");
		});

		it("uses DolphinTool fallback for .iso when binary scans fail", async () => {
			const execute = vi.fn().mockResolvedValue({
				code: 0,
				signal: null,
				stdout: "Game ID: RZDE01",
				stderr: "",
			});

			const { useCase } = createUseCase({
				commandExecutor: { execute },
			});

			expect(await useCase.execute("/roms/game.iso")).toBe("Wii");
			expect(execute).toHaveBeenCalledWith("DolphinTool", [
				"header",
				"-i",
				"/roms/game.iso",
			]);
		});
	});

	describe("Step 4: Tier B — CD-ROM formats (2352 bytes/sector)", () => {
		it("detects Saturn via 'SEGA SEGASATURN' at offset 0x10", async () => {
			const buf = buildHeaderBuffer([
				{ offset: 0x10, bytes: "SEGA SEGASATURN" },
			]);
			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi.fn().mockResolvedValue(buf),
					readTextFile: vi.fn().mockResolvedValue(""),
					exists: vi.fn().mockResolvedValue(true),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});
			expect(await useCase.execute("/roms/game.bin")).toBe("Saturn");
		});

		it("detects Dreamcast via 'SEGA SEGAKATANA' at offset 0x10", async () => {
			const buf = buildHeaderBuffer([
				{ offset: 0x10, bytes: "SEGA SEGAKATANA" },
			]);
			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi.fn().mockResolvedValue(buf),
					readTextFile: vi.fn().mockResolvedValue(""),
					exists: vi.fn().mockResolvedValue(true),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});
			expect(await useCase.execute("/roms/game.bin")).toBe("Dreamcast");
		});

		it("detects PS1 via 'PLAYSTATION ' at offset 0x9310", async () => {
			const buf = buildHeaderBuffer([
				{ offset: 0x9310, bytes: "PLAYSTATION " },
			]);
			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi.fn().mockResolvedValue(buf),
					readTextFile: vi.fn().mockResolvedValue(""),
					exists: vi.fn().mockResolvedValue(true),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});
			expect(await useCase.execute("/roms/game.bin")).toBe("PS1");
		});
	});

	// ─── Step 6: Regex fallback ───────────────────────────────────

	describe("Step 6: Path regex fallback", () => {
		it.each([
			["/roms/Wii/game.iso", "Wii"],
			["/roms/GameCube/game.iso", "GameCube"],
			["/roms/GCN/game.iso", "GameCube"],
			["/roms/PS2/game.iso", "PS2"],
			["/roms/Playstation 2/game.iso", "PS2"],
		])("detects %s via path regex as %s", async (path, expected) => {
			const { useCase } = createUseCase();
			const result = await useCase.execute(path);
			expect(result).toBe(expected);
		});
	});

	// ─── Unknown fallback ─────────────────────────────────────────

	describe("Absolute Unknown fallback", () => {
		it("returns Unknown for .iso with no header match and neutral path", async () => {
			const { useCase } = createUseCase();
			const result = await useCase.execute("/roms/game.iso");
			expect(result).toBe("Unknown");
		});

		it("NEVER returns PS2 as a default for unmatched ISOs", async () => {
			const { useCase } = createUseCase();
			const result = await useCase.execute("/roms/game.iso");
			expect(result).not.toBe("PS2");
			expect(result).toBe("Unknown");
		});

		it("returns Unknown for completely unsupported extensions", async () => {
			const { useCase } = createUseCase();
			const result = await useCase.execute("/roms/readme.txt");
			expect(result).toBe("Unknown");
		});

		it("handles readBytes errors gracefully", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi.fn().mockRejectedValue(new Error("file not found")),
					readTextFile: vi.fn().mockResolvedValue(""),
					exists: vi.fn().mockResolvedValue(true),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});
			const result = await useCase.execute("/roms/game.iso");
			expect(result).toBe("Unknown");
			warnSpy.mockRestore();
		});
	});

	// ─── .img and .mdf support ────────────────────────────────────

	describe("Additional binary formats", () => {
		it("scans .img files for headers", async () => {
			const buf = buildHeaderBuffer([
				{ offset: 0x8010, bytes: "PLAYSTATION " },
			]);
			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi.fn().mockResolvedValue(buf),
					readTextFile: vi.fn().mockResolvedValue(""),
					exists: vi.fn().mockResolvedValue(true),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});
			expect(await useCase.execute("/roms/game.img")).toBe("PS2");
		});

		it("scans .mdf files for headers", async () => {
			const buf = buildHeaderBuffer([
				{ offset: 0x10, bytes: "SEGA SEGASATURN" },
			]);
			const { useCase } = createUseCase({
				fileSystem: {
					readBytes: vi.fn().mockResolvedValue(buf),
					readTextFile: vi.fn().mockResolvedValue(""),
					exists: vi.fn().mockResolvedValue(true),
					dirname: vi.fn().mockResolvedValue("/roms"),
					joinPath: vi
						.fn()
						.mockImplementation(async (...s: string[]) => s.join("/")),
				},
			});
			expect(await useCase.execute("/roms/game.mdf")).toBe("Saturn");
		});
	});
});
