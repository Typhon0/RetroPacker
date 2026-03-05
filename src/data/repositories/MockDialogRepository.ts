import type {
	IDialogRepository,
	OpenDialogOptions,
	SaveDialogOptions,
} from "@/domain/repositories/IDialogRepository";

export class MockDialogRepository implements IDialogRepository {
	async open(_options: OpenDialogOptions): Promise<string | string[] | null> {
		return null;
	}

	async save(_options: SaveDialogOptions): Promise<string | null> {
		return null;
	}
}
