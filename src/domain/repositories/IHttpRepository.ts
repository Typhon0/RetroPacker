export interface HttpRequestOptions {
	readonly method?: string;
	readonly headers?: Record<string, string>;
	readonly signal?: AbortSignal;
}

/**
 * HTTP Repository Interface
 *
 * Abstracts HTTP requests, allowing for:
 * - Different implementations (Tauri plugin, browser fetch, Mock)
 * - Easy testing with mock implementations
 * - Dependency inversion for clean architecture
 */
export interface IHttpRepository {
	/**
	 * Perform an HTTP request.
	 *
	 * @param input - Request URL
	 * @param init - Request options
	 * @returns Fetch-compatible response object
	 */
	fetch(input: string, init?: HttpRequestOptions): Promise<Response>;
}
