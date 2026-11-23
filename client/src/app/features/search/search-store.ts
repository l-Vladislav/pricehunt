import { computed, inject, Injectable, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { EMPTY, Subject, catchError, switchMap, tap } from "rxjs";
import { Supplier } from "../../core/suppliers-api";
import { SearchStreamClient } from "./search-stream-client";
import { SearchEvent, SearchRequest } from "./search-types";

type Quote = Extract<SearchEvent, { type: "quote" }>["data"];

interface SearchState {
	searchId: string | null;
	suppliers: Supplier[];
	results: Quote[];
	responded: number;
	total: number;
	status: "idle" | "running" | "completed" | "timedOut" | "error";
	errorMessage: string | null;
}

const initialState: SearchState = {
	searchId: null,
	suppliers: [],
	results: [],
	responded: 0,
	total: 0,
	status: "idle",
	errorMessage: null,
};

// Provided by SearchPage, not in root: leaving the page destroys the store, which aborts the request.
@Injectable()
export class SearchStore {
	private readonly client = inject(SearchStreamClient);
	private readonly requests = new Subject<SearchRequest>();
	private readonly state = signal(initialState);

	readonly searchId = computed(() => this.state().searchId);
	readonly suppliers = computed(() => this.state().suppliers);
	readonly results = computed(() => this.state().results);
	readonly responded = computed(() => this.state().responded);
	readonly total = computed(() => this.state().total);
	readonly status = computed(() => this.state().status);
	readonly errorMessage = computed(() => this.state().errorMessage);

	constructor() {
		this.requests
			.pipe(
				switchMap((request) =>
					this.client.search(request).pipe(
						tap({
							next: (event) => this.apply(event),
							complete: () => this.fail("Search ended unexpectedly"),
						}),
						// Caught here, not on the outer stream: that would end it and later searches would do nothing.
						catchError((error: Error) => {
							this.fail(error.message);
							return EMPTY;
						}),
					),
				),
				takeUntilDestroyed(),
			)
			.subscribe();
	}

	search(request: Omit<SearchRequest, "searchId">): void {
		const searchId = crypto.randomUUID();
		this.state.set({ ...initialState, searchId, status: "running" });
		this.requests.next({ ...request, searchId });
	}

	private apply(event: SearchEvent): void {
		// Second line of defence on top of switchMap (SC6).
		if (event.data.searchId !== this.state().searchId) {
			return;
		}
		switch (event.type) {
			case "started": {
				const { suppliers } = event.data;
				this.state.update((state) => ({ ...state, suppliers, total: suppliers.length }));
				break;
			}
			case "quote": {
				const quote = event.data;
				this.state.update((state) => ({
					...state,
					// A full sort is fine for at most 7 rows, and it is stable: ties keep their arrival order.
					results: [...state.results, quote].sort((a, b) => a.price - b.price),
					responded: state.responded + 1,
				}));
				break;
			}
			case "supplier-failed":
				this.state.update((state) => ({ ...state, responded: state.responded + 1 }));
				break;
			case "ended": {
				const { status } = event.data;
				this.state.update((state) => ({ ...state, status }));
				break;
			}
		}
	}

	private fail(errorMessage: string): void {
		// The status from ended is final, whatever the connection does after it.
		if (this.state().status === "running") {
			this.state.update((state) => ({ ...state, status: "error", errorMessage }));
		}
	}
}
