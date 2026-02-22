import { describe, it, expect, vi } from "vitest";
import { DetectSystemUseCase } from "./DetectSystemUseCase";

/**
 * Creates a DetectSystemUseCase with a mock readBytes that returns
 * an empty buffer by default (header detection will find nothing).
 */
function createUseCase(
    readBytesMock?: (
        path: string,
        offset?: number,
        length?: number,
    ) => Promise<Uint8Array>,
) {
    const defaultMock = vi.fn().mockResolvedValue(new Uint8Array(32832));
    return new DetectSystemUseCase({
        fileSystem: { readBytes: readBytesMock ?? defaultMock },
    });
}

/**
 * Helper: build a buffer with specific bytes at given offsets.
 * Used to simulate ISO headers for GameCube/Wii/PSP.
 */
function buildHeaderBuffer(
    patches: Array<{ offset: number; bytes: number[] }>,
): Uint8Array {
    const buf = new Uint8Array(32832);
    for (const { offset, bytes } of patches) {
        for (let i = 0; i < bytes.length; i++) {
            buf[offset + i] = bytes[i];
        }
    }
    return buf;
}

describe("DetectSystemUseCase", () => {
    // ─── Extension-based detection ────────────────────────────────

    describe("detectByExtension (via execute)", () => {
        it.each([
            ["game.chd", "CHD"],
            ["game.cso", "PSP"],
            ["game.ciso", "PSP"],
            ["game.gdi", "Dreamcast"],
            ["game.gcm", "GameCube"],
            ["game.wbfs", "Wii"],
            ["game.rvz", "GameCube"],
            ["game.gcz", "GameCube"],
            ["game.cue", "PS1"],
            ["game.bin", "PS1"],
            ["game.nsp", "Switch"],
            ["game.xci", "Switch"],
        ])("detects %s as %s", async (filename, expected) => {
            const uc = createUseCase();
            const result = await uc.execute(`/roms/${filename}`);
            expect(result).toBe(expected);
        });
    });

    // ─── Path-based detection ─────────────────────────────────────

    describe("detectByPath (via execute with .iso)", () => {
        it.each([
            ["/roms/GameCube/game.iso", "GameCube"],
            ["/roms/GCN/game.iso", "GameCube"],
            ["/roms/Wii/game.iso", "Wii"],
            ["/roms/dreamcast/game.iso", "Dreamcast"],
            ["/roms/saturn/game.iso", "Saturn"],
            ["/roms/PSP/game.iso", "PSP"],
            ["/roms/PS2/game.iso", "PS2"],
            ["/roms/Playstation 2/game.iso", "PS2"],
            ["/roms/PSX/game.iso", "PS1"],
            ["/roms/PlayStation/game.iso", "PS1"],
        ])("detects %s via path as %s", async (path, expected) => {
            const uc = createUseCase();
            const result = await uc.execute(path);
            expect(result).toBe(expected);
        });

        it("Wii path detection ignores 'switch' in path", async () => {
            const uc = createUseCase();
            // 'switch' in path should NOT match Wii
            const result = await uc.execute("/roms/switch/game.iso");
            // No extension or path match for Switch + .iso, falls through to header
            expect(result).not.toBe("Wii");
        });
    });

    // ─── Header-based detection (ISO files) ──────────────────────

    describe("detectByHeader", () => {
        it("detects PSP via 'PSP' at offset 0x8000", async () => {
            const buf = buildHeaderBuffer([
                {
                    offset: 0x8000,
                    bytes: [0x50, 0x53, 0x50], // 'PSP'
                },
            ]);
            const uc = createUseCase(vi.fn().mockResolvedValue(buf));
            const result = await uc.execute("/roms/game.iso");
            expect(result).toBe("PSP");
        });

        it("detects Wii via magic at offset 24", async () => {
            const buf = buildHeaderBuffer([
                {
                    offset: 24,
                    bytes: [0x5d, 0x1c, 0x9e, 0xa3],
                },
            ]);
            const uc = createUseCase(vi.fn().mockResolvedValue(buf));
            const result = await uc.execute("/roms/game.iso");
            expect(result).toBe("Wii");
        });

        it("detects GameCube via magic at offset 28", async () => {
            const buf = buildHeaderBuffer([
                {
                    offset: 28,
                    bytes: [0xc2, 0x33, 0x9f, 0x3d],
                },
            ]);
            const uc = createUseCase(vi.fn().mockResolvedValue(buf));
            const result = await uc.execute("/roms/game.iso");
            expect(result).toBe("GameCube");
        });

        it("detects GameCube via 6-char alphanumeric ID at offset 0", async () => {
            const buf = new Uint8Array(32832);
            const id = "GALE01"; // Super Smash Bros. Melee
            for (let i = 0; i < id.length; i++) {
                buf[i] = id.charCodeAt(i);
            }
            const uc = createUseCase(vi.fn().mockResolvedValue(buf));
            const result = await uc.execute("/roms/game.iso");
            expect(result).toBe("GameCube");
        });

        it("defaults to PS2 when no header matches for .iso", async () => {
            const uc = createUseCase();
            const result = await uc.execute("/roms/game.iso");
            expect(result).toBe("PS2");
        });

        it("returns PS2 from filename if 'ps2' is in the filename", async () => {
            const uc = createUseCase();
            const result = await uc.execute("/roms/game_ps2_backup.iso");
            expect(result).toBe("PS2");
        });

        it("handles readBytes error gracefully, falls back to PS2 for ISO", async () => {
            const spy = vi.spyOn(console, "warn").mockImplementation(() => { });
            const failingRead = vi
                .fn()
                .mockRejectedValue(new Error("File not found"));
            const uc = createUseCase(failingRead);
            const result = await uc.execute("/roms/game.iso");
            expect(result).toBe("PS2");
            spy.mockRestore();
        });
    });

    // ─── detectSync ──────────────────────────────────────────────

    describe("detectSync", () => {
        it("detects by extension", () => {
            const uc = createUseCase();
            expect(uc.detectSync("game.chd", "chd")).toBe("CHD");
            expect(uc.detectSync("game.rvz", "rvz")).toBe("GameCube");
        });

        it("detects by filename patterns when no extension match", () => {
            const uc = createUseCase();
            expect(uc.detectSync("my_gamecube_game")).toBe("GameCube");
            expect(uc.detectSync("My_GCN_Backup")).toBe("GameCube");
            expect(uc.detectSync("wii_game")).toBe("Wii");
            expect(uc.detectSync("ps2_game")).toBe("PS2");
            expect(uc.detectSync("psp_backup")).toBe("PSP");
            expect(uc.detectSync("psx_classic")).toBe("PS1");
            expect(uc.detectSync("ps1_game")).toBe("PS1");
        });

        it("returns Unknown when nothing matches", () => {
            const uc = createUseCase();
            expect(uc.detectSync("random_file")).toBe("Unknown");
        });
    });

    // ─── Unknown file types ──────────────────────────────────────

    describe("unknown files", () => {
        it("returns Unknown for unsupported extensions", async () => {
            const uc = createUseCase();
            const result = await uc.execute("/roms/readme.txt");
            expect(result).toBe("Unknown");
        });

        it("returns Unknown for extensionless files", async () => {
            const uc = createUseCase();
            const result = await uc.execute("/roms/Makefile");
            expect(result).toBe("Unknown");
        });
    });
});
