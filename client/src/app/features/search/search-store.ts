import { Injectable, signal } from "@angular/core";
import { Supplier } from "../../core/suppliers-api";
import { SearchEvent, SearchRequest } from "./search-types";

type Quote = Extract<SearchEvent, { type: "quote" }>["data"];
type SearchStatus = "idle" | "running" | "completed" | "timedOut" | "error";

@Injectable()
export class SearchStore {
	readonly searchId = signal<string | null>(null);
	readonly suppliers = signal<Supplier[]>([]);
	readonly results = signal<Quote[]>([]);
	readonly responded = signal(0);
	readonly total = signal(0);
	readonly status = signal<SearchStatus>("idle");
	readonly errorMessage = signal<string | null>(null);

	search(request: Omit<SearchRequest, "searchId">): void {
		void request;
	}
}
