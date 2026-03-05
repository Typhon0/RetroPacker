import type {
	DatabaseStats,
	IDatabaseRepository,
} from "@/domain/repositories/IDatabaseRepository";

export class MockDatabaseRepository implements IDatabaseRepository {
	async getStats(): Promise<DatabaseStats> {
		return {
			row_count: 0,
			last_updated: "",
		};
	}

	async syncOnlineDatabases(): Promise<void> {
		return;
	}

	async importDatFile(_path: string): Promise<void> {
		return;
	}

	async checkHash(_sha1: string): Promise<string | null> {
		return null;
	}
}
