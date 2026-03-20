/**
 * Tauri File System Repository
 * Implementation of IFileSystemRepository using Tauri's fs plugin.
 *
 * @module data/repositories/TauriFileSystemRepository
 */

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import {
	appDataDir,
	join,
	dirname as pathDirname,
	tempDir,
} from "@tauri-apps/api/path";
import {
	exists,
	mkdir,
	readDir,
	readTextFile,
	remove,
	stat,
	writeFile,
	writeTextFile,
} from "@tauri-apps/plugin-fs";
import {
	openPath as openWithSystem,
	revealItemInDir,
} from "@tauri-apps/plugin-opener";
import type {
	DirectoryEntry,
	FileInfo,
	IFileSystemRepository,
} from "../../domain/repositories/IFileSystemRepository";

/**
 * Tauri implementation of file system operations.
 */
export class TauriFileSystemRepository implements IFileSystemRepository {
	/**
	 * Get file information.
	 */
	async getFileInfo(path: string): Promise<FileInfo> {
		const fileStat = await stat(path);
		const name = path.split(/[\\/]/).pop() ?? "";
		const extension = name.includes(".") ? (name.split(".").pop() ?? "") : "";

		return {
			path,
			name,
			size: fileStat.size,
			isDirectory: fileStat.isDirectory,
			extension,
		};
	}

	/**
	 * Check if path exists.
	 */
	async exists(path: string): Promise<boolean> {
		return exists(path);
	}

	/**
	 * Read directory contents.
	 */
	async readDirectory(path: string): Promise<DirectoryEntry[]> {
		const entries = await readDir(path);
		return entries.map((entry) => ({
			name: entry.name,
			isFile: entry.isFile,
			isDirectory: entry.isDirectory,
		}));
	}

	/**
	 * Join path segments.
	 */
	async joinPath(...segments: string[]): Promise<string> {
		if (segments.length === 0) return "";
		if (segments.length === 1) return segments[0];

		let result = segments[0];
		for (let i = 1; i < segments.length; i++) {
			result = await join(result, segments[i]);
		}
		return result;
	}

	/**
	 * Get application data directory path.
	 */
	async getAppDataDir(): Promise<string> {
		return appDataDir();
	}

	/**
	 * Get operating system temp directory path.
	 */
	async getTempDir(): Promise<string> {
		return tempDir();
	}

	/**
	 * Get directory name from path.
	 */
	async dirname(path: string): Promise<string> {
		return pathDirname(path);
	}

	/**
	 * Read bytes from file via Rust backend command.
	 */
	async readBytes(
		path: string,
		offset?: number,
		length?: number,
	): Promise<Uint8Array> {
		const data = await invoke<ArrayBuffer>("read_file_bytes", {
			path,
			offset: offset ?? null,
			length: length ?? null,
		});
		return new Uint8Array(data);
	}

	/**
	 * Convert local file path to file source URL.
	 */
	convertFileSource(path: string): string {
		return convertFileSrc(path);
	}

	/**
	 * Write text to file.
	 */
	async writeTextFile(path: string, content: string): Promise<void> {
		await writeTextFile(path, content);
	}

	/**
	 * Write bytes to file.
	 */
	async writeBytesFile(path: string, content: Uint8Array): Promise<void> {
		await writeFile(path, content);
	}

	/**
	 * Create directory.
	 */
	async createDirectory(path: string): Promise<void> {
		await mkdir(path, { recursive: true });
	}

	/**
	 * Move file to the system trash/recycle bin via Rust backend.
	 * Uses the `trash` crate for safe, cross-platform support.
	 */
	async moveToTrash(filePath: string): Promise<boolean> {
		try {
			await invoke("move_to_trash", { path: filePath });
			console.log(`Moved to trash: ${filePath}`);
			return true;
		} catch (e) {
			console.error("Trash operation failed:", e);
			return false;
		}
	}

	/**
	 * Open file or folder with system default application.
	 */
	async openPath(path: string): Promise<void> {
		await openWithSystem(path);
	}

	/**
	 * Reveal file in containing directory.
	 */
	async revealInDirectory(path: string): Promise<void> {
		await revealItemInDir(path);
	}

	/**
	 * Read file contents as UTF-8 text.
	 */
	async readTextFile(path: string): Promise<string> {
		return readTextFile(path);
	}

	/**
	 * Read UTF-8 text with optional byte cap through Rust IPC.
	 */
	async readText(path: string, maxBytes?: number): Promise<string> {
		return invoke<string>("read_file_text", {
			path,
			maxBytes: maxBytes ?? null,
		});
	}

	/**
	 * Recursively remove a directory and all its contents.
	 */
	async removeDirectory(path: string): Promise<void> {
		await remove(path, { recursive: true });
	}

	/**
	 * Compute SHA-256 hash of a file via Rust backend command.
	 */
	async computeFileHash(path: string): Promise<string> {
		return invoke<string>("compute_file_hash", { path });
	}

	/**
	 * Compute SHA-1 hash of a file via Rust backend command.
	 */
	async computeFileSha1(path: string): Promise<string> {
		return invoke<string>("compute_file_sha1", { path });
	}
}
