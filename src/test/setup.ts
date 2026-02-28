import { vi } from "vitest";

// Minimal window mock for Tauri plugins (like @tauri-apps/plugin-store)
// that expect a browser-like environment even in Node testing
if (typeof window === "undefined") {
	Object.defineProperty(globalThis, "window", {
		value: {
			__TAURI_INTERNALS__: {
				invoke: vi.fn(),
			},
		},
		writable: true,
		configurable: true,
	});
}
