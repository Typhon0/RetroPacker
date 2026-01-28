/**
 * Tauri File System Repository
 * Implementation of IFileSystemRepository using Tauri's fs plugin.
 *
 * @module data/repositories/TauriFileSystemRepository
 */

import {
	stat,
	exists,
	readDir,
	mkdir,
	writeTextFile,
	open,
	SeekMode,
} from "@tauri-apps/plugin-fs";
import { join, dirname as pathDirname } from "@tauri-apps/api/path";
import { Command } from "@tauri-apps/plugin-shell";
import {
	IFileSystemRepository,
	FileInfo,
	DirectoryEntry,
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
	 * Get directory name from path.
	 */
	async dirname(path: string): Promise<string> {
		return pathDirname(path);
	}

	/**
	 * Read bytes from file.
	 */
	async readBytes(
		path: string,
		offset?: number,
		length?: number,
	): Promise<Uint8Array> {
		const file = await open(path, { read: true });

		try {
			if (offset !== undefined && offset > 0) {
				await file.seek(offset, SeekMode.Start);
			}

			const buffer = new Uint8Array(length ?? 2048);
			await file.read(buffer);
			return buffer;
		} finally {
			await file.close();
		}
	}

	/**
	 * Write text to file.
	 */
	async writeTextFile(path: string, content: string): Promise<void> {
		await writeTextFile(path, content);
	}

	/**
	 * Create directory.
	 */
	async createDirectory(path: string): Promise<void> {
		await mkdir(path, { recursive: true });
	}

	/**
	 * Move file to trash (Windows Recycle Bin).
	 */
	async moveToTrash(filePath: string): Promise<boolean> {
		try {
			// Windows: Use PowerShell to move to Recycle Bin
			const psScript = `
Add-Type -AssemblyName Microsoft.VisualBasic
[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
  '${filePath.replace(/'/g, "''")}',
  'OnlyErrorDialogs',
  'SendToRecycleBin'
)
`;

			const command = Command.create("powershell", [
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				psScript,
			]);

			const output = await command.execute();

			if (output.code === 0) {
				console.log(`Moved to Recycle Bin: ${filePath}`);
				return true;
			}

			console.error(`Failed to move to Recycle Bin: ${output.stderr}`);
			return false;
		} catch (e) {
			console.error("Trash operation failed:", e);
			return false;
		}
	}
}
