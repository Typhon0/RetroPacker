/**
 * Mock File System Repository
 * Mock implementation of IFileSystemRepository for testing/development.
 *
 * @module data/repositories/MockFileSystemRepository
 */

import type {
	DirectoryEntry,
	FileInfo,
	IFileSystemRepository,
} from "../../domain/repositories/IFileSystemRepository";

/**
 * Mock implementation of file system operations.
 * Returns simulated data for testing without actual file I/O.
 */
export class MockFileSystemRepository implements IFileSystemRepository {
	/**
	 * Get mock file information.
	 */
	async getFileInfo(path: string): Promise<FileInfo> {
		const name = path.split(/[\\/]/).pop() ?? "";
		const extension = name.includes(".") ? (name.split(".").pop() ?? "") : "";

		return {
			path,
			name,
			size: Math.floor(Math.random() * 1024 * 1024 * 1000), // Random size up to 1GB
			isDirectory: false,
			extension,
		};
	}

	/**
	 * Always return true for mock.
	 */
	async exists(_path: string): Promise<boolean> {
		return true;
	}

	/**
	 * Return empty directory.
	 */
	async readDirectory(_path: string): Promise<DirectoryEntry[]> {
		return [];
	}

	/**
	 * Simple path joining.
	 */
	async joinPath(...segments: string[]): Promise<string> {
		return segments.join("/").replace(/\/+/g, "/");
	}

	/**
	 * Return a mock app data directory path.
	 */
	async getAppDataDir(): Promise<string> {
		return "/mock/app-data";
	}

	/**
	 * Get parent directory.
	 */
	async dirname(path: string): Promise<string> {
		const parts = path.replace(/\\/g, "/").split("/");
		parts.pop();
		return parts.join("/");
	}

	/**
	 * Return empty buffer.
	 */
	async readBytes(
		_path: string,
		_offset?: number,
		length?: number,
	): Promise<Uint8Array> {
		return new Uint8Array(length ?? 32);
	}

	/**
	 * Convert a file path to a pseudo URL.
	 */
	convertFileSource(path: string): string {
		const normalized = path.replace(/\\/g, "/");
		return `mock://file/${normalized}`;
	}

	/**
	 * No-op for mock.
	 */
	async writeTextFile(_path: string, _content: string): Promise<void> {
		console.log("[MOCK] writeTextFile called");
	}

	/**
	 * No-op for mock.
	 */
	async writeBytesFile(_path: string, _content: Uint8Array): Promise<void> {
		console.log("[MOCK] writeBytesFile called");
	}

	/**
	 * No-op for mock.
	 */
	async createDirectory(_path: string): Promise<void> {
		console.log("[MOCK] createDirectory called");
	}

	/**
	 * Return success for mock.
	 */
	async moveToTrash(_filePath: string): Promise<boolean> {
		console.log("[MOCK] moveToTrash called");
		return true;
	}

	/**
	 * No-op for mock.
	 */
	async openPath(_path: string): Promise<void> {
		console.log("[MOCK] openPath called");
	}

	/**
	 * No-op for mock.
	 */
	async revealInDirectory(_path: string): Promise<void> {
		console.log("[MOCK] revealInDirectory called");
	}

	/**
	 * Return empty string for mock.
	 */
	async readTextFile(_path: string): Promise<string> {
		console.log("[MOCK] readTextFile called");
		return "";
	}

	/**
	 * Return empty string for mock.
	 */
	async readText(_path: string, _maxBytes?: number): Promise<string> {
		console.log("[MOCK] readText called");
		return "";
	}

	/**
	 * No-op for mock.
	 */
	async removeDirectory(_path: string): Promise<void> {
		console.log("[MOCK] removeDirectory called");
	}

	/**
	 * Return a mock hash.
	 */
	async computeFileHash(_path: string): Promise<string> {
		return `mock_sha256_${Math.random().toString(36).substring(2, 18)}`;
	}

	/**
	 * Return a mock SHA-1 hash.
	 */
	async computeFileSha1(_path: string): Promise<string> {
		return `mock_sha1_${Math.random().toString(36).substring(2, 18)}`;
	}
}
