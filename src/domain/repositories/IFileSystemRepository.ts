/**
 * Repository Interface - File System
 * Contract for file system operations.
 *
 * Follows Interface Segregation Principle - focused on file operations only.
 *
 * @module domain/repositories/IFileSystemRepository
 */

/**
 * File metadata information.
 */
export interface FileInfo {
	/** Full path to the file. */
	readonly path: string;
	/** File name (basename). */
	readonly name: string;
	/** File size in bytes. */
	readonly size: number;
	/** Whether this is a directory. */
	readonly isDirectory: boolean;
	/** File extension (without dot). */
	readonly extension: string;
}

/**
 * Directory entry for listing.
 */
export interface DirectoryEntry {
	/** Entry name. */
	readonly name: string;
	/** Whether this is a file. */
	readonly isFile: boolean;
	/** Whether this is a directory. */
	readonly isDirectory: boolean;
}

/**
 * File System Repository Interface
 *
 * Abstracts file system operations, allowing for:
 * - Different implementations (Tauri, Node.js, Mock)
 * - Easy testing with mock implementations
 * - Dependency inversion for clean architecture
 */
export interface IFileSystemRepository {
	/**
	 * Get file information/stats.
	 *
	 * @param path - Path to the file
	 * @returns File information
	 */
	getFileInfo(path: string): Promise<FileInfo>;

	/**
	 * Check if a path exists.
	 *
	 * @param path - Path to check
	 * @returns True if exists
	 */
	exists(path: string): Promise<boolean>;

	/**
	 * Read a directory's contents.
	 *
	 * @param path - Directory path
	 * @returns Array of directory entries
	 */
	readDirectory(path: string): Promise<DirectoryEntry[]>;

	/**
	 * Join path segments.
	 *
	 * @param segments - Path segments to join
	 * @returns Joined path string
	 */
	joinPath(...segments: string[]): Promise<string>;

	/**
	 * Get the directory name from a path.
	 *
	 * @param path - Full path
	 * @returns Directory portion of the path
	 */
	dirname(path: string): Promise<string>;

	/**
	 * Read file contents as bytes.
	 *
	 * @param path - Path to the file
	 * @param offset - Optional byte offset to start reading
	 * @param length - Optional number of bytes to read
	 * @returns File contents as Uint8Array
	 */
	readBytes(
		path: string,
		offset?: number,
		length?: number,
	): Promise<Uint8Array>;

	/**
	 * Write text to a file.
	 *
	 * @param path - Path to the file
	 * @param content - Text content to write
	 */
	writeTextFile(path: string, content: string): Promise<void>;

	/**
	 * Create a directory (including parent directories if needed).
	 *
	 * @param path - Directory path to create
	 */
	createDirectory(path: string): Promise<void>;

	/**
	 * Move a file to the system trash/recycle bin.
	 *
	 * @param path - Path to the file
	 * @returns True if successful
	 */
	moveToTrash(path: string): Promise<boolean>;
}
