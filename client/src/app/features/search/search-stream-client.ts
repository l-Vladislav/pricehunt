import { inject, Injectable } from "@angular/core";
import { Observable, Subscriber } from "rxjs";
import { API_BASE_URL } from "../../core/api-base-url";
import { FETCH } from "../../core/fetch";
import { parseSse } from "./parse-sse";
import { SearchEvent, SearchRequest } from "./search-types";

// Not EventSource: it is GET-only and reconnects, which would restart the search.
@Injectable({ providedIn: "root" })
export class SearchStreamClient {
	private readonly baseUrl = inject(API_BASE_URL);
	private readonly fetch = inject(FETCH);

	search(request: SearchRequest): Observable<SearchEvent> {
		return new Observable((subscriber) => {
			const abortController = new AbortController();
			this.stream(request, subscriber, abortController.signal).then(
				() => subscriber.complete(),
				(error: unknown) => subscriber.error(error),
			);
			return () => abortController.abort();
		});
	}

	private async stream(
		request: SearchRequest,
		subscriber: Subscriber<SearchEvent>,
		signal: AbortSignal,
	): Promise<void> {
		const response = await this.send(request, signal);
		if (!response.ok || !response.body) {
			throw new Error(await errorMessage(response));
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		while (true) {
			const { done, value } = await reader.read().catch(() => {
				throw new Error("Connection lost");
			});
			if (done) {
				return;
			}
			// stream: true keeps the bytes of a character split across chunks for the next call.
			const { events, rest } = parseSse(buffer + decoder.decode(value, { stream: true }));
			buffer = rest;
			events.forEach((event) => subscriber.next(event));
		}
	}

	private async send(request: SearchRequest, signal: AbortSignal): Promise<Response> {
		try {
			return await this.fetch(`${this.baseUrl}/api/search`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(request),
				signal,
			});
		} catch {
			throw new Error("Server not reachable");
		}
	}
}

interface ProblemDetails {
	title?: string;
	errors?: Record<string, string[]>;
}

async function errorMessage(response: Response): Promise<string> {
	const problem: ProblemDetails | null = await response.json().catch(() => null);
	const firstError = Object.values(problem?.errors ?? {})[0]?.[0];
	return firstError ?? problem?.title ?? `HTTP ${response.status}`;
}
