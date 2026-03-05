import { open, save } from "@tauri-apps/plugin-dialog";
import type {
	IDialogRepository,
	OpenDialogOptions,
	SaveDialogOptions,
} from "@/domain/repositories/IDialogRepository";

export class TauriDialogRepository implements IDialogRepository {
	async open(options: OpenDialogOptions): Promise<string | string[] | null> {
		const selected = await open({
			title: options.title,
			multiple: options.multiple,
			directory: options.directory,
			filters: options.filters,
		});

		if (!selected) {
			return null;
		}

		if (typeof selected === "string") {
			return selected;
		}

		return [...selected];
	}

	async save(options: SaveDialogOptions): Promise<string | null> {
		const selected = await save({
			title: options.title,
			defaultPath: options.defaultPath,
			filters: options.filters,
		});

		return selected ?? null;
	}
}
