export interface DialogFilter {
	readonly name: string;
	readonly extensions: string[];
}

export interface OpenDialogOptions {
	readonly title?: string;
	readonly multiple?: boolean;
	readonly directory?: boolean;
	readonly filters?: DialogFilter[];
}

export interface SaveDialogOptions {
	readonly title?: string;
	readonly defaultPath?: string;
	readonly filters?: DialogFilter[];
}

/**
 * Dialog Repository Interface
 *
 * Abstracts native file dialogs, allowing for:
 * - Different implementations (Tauri, Mock)
 * - Easy testing with mock implementations
 * - Dependency inversion for clean architecture
 */
export interface IDialogRepository {
	/**
	 * Open a native file/folder picker.
	 *
	 * @param options - Open dialog options
	 * @returns Selected path(s), or null if cancelled
	 */
	open(options: OpenDialogOptions): Promise<string | string[] | null>;

	/**
	 * Open a native save dialog.
	 *
	 * @param options - Save dialog options
	 * @returns Selected save path, or null if cancelled
	 */
	save(options: SaveDialogOptions): Promise<string | null>;
}
