/**
 * Mock File System Repository
 * Mock implementation of IFileSystemRepository for testing/development.
 *
 * @module data/repositories/MockFileSystemRepository
 */

import {
	IFileSystemRepository,
	FileInfo,
	DirectoryEntry,
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
	 * No-op for mock.
	 */
	async writeTextFile(_path: string, _content: string): Promise<void> {
		console.log("[MOCK] writeTextFile called");
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
}
