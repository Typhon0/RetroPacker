export interface DatabaseStats {
	readonly row_count: number;
	readonly last_updated: string;
}

/**
 * Database Repository Interface
 *
 * Abstracts backend database operations, allowing for:
 * - Different implementations (Tauri, Mock)
 * - Easy testing with mock implementations
 * - Dependency inversion for clean architecture
 */
export interface IDatabaseRepository {
	/**
	 * Get current database statistics.
	 */
	getStats(): Promise<DatabaseStats>;

	/**
	 * Trigger synchronization of online signature databases.
	 */
	syncOnlineDatabases(): Promise<void>;

	/**
	 * Import a DAT/XML file into the signature database.
	 *
	 * @param path - Path to DAT/XML file
	 */
	importDatFile(path: string): Promise<void>;

	/**
	 * Check if a SHA-1 exists in the signature database.
	 *
	 * @param sha1 - SHA-1 checksum
	 * @returns Verified entry name, or null if not found
	 */
	checkHash(sha1: string): Promise<string | null>;
}
