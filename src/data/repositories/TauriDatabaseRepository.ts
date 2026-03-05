import { invoke } from "@tauri-apps/api/core";
import type {
	DatabaseStats,
	IDatabaseRepository,
} from "@/domain/repositories/IDatabaseRepository";

export class TauriDatabaseRepository implements IDatabaseRepository {
	async getStats(): Promise<DatabaseStats> {
		return invoke<DatabaseStats>("get_db_stats");
	}

	async syncOnlineDatabases(): Promise<void> {
		await invoke("sync_online_databases");
	}

	async importDatFile(path: string): Promise<void> {
		await invoke("import_dat_file", { path });
	}

	async checkHash(sha1: string): Promise<string | null> {
		return invoke<string | null>("check_hash", { sha1 });
	}
}
