import { fetch } from "@tauri-apps/plugin-http";
import type {
	HttpRequestOptions,
	IHttpRepository,
} from "@/domain/repositories/IHttpRepository";

export class TauriHttpRepository implements IHttpRepository {
	async fetch(input: string, init?: HttpRequestOptions): Promise<Response> {
		return fetch(input, {
			method: init?.method,
			headers: init?.headers,
			signal: init?.signal,
		});
	}
}
