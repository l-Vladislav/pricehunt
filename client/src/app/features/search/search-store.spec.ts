import { TestBed } from "@angular/core/testing";
import { Subject } from "rxjs";
import { SearchStore } from "./search-store";
import { SearchStreamClient } from "./search-stream-client";
import { FakeSearchStreamClient } from "./search-stream-client.fake";
import { SearchEvent } from "./search-types";

const form = {
	fromLocation: "Haifa",
	toLocation: "Rotterdam",
	fromDate: "2026-11-23",
	toDate: "2026-11-30",
	supplierIds: ["s1", "s2", "s3"],
};
const suppliers = [
	{ id: "s1", name: "Supplier 1" },
	{ id: "s2", name: "Supplier 2" },
	{ id: "s3", name: "Supplier 3" },
];

function started(searchId: string): SearchEvent {
	return { type: "started", data: { searchId, suppliers } };
}

function quote(searchId: string, supplierId: string, price: number): SearchEvent {
	return { type: "quote", data: { searchId, supplierId, price, responseTimeMs: 800 } };
}

function failed(searchId: string, supplierId: string): SearchEvent {
	return { type: "supplier-failed", data: { searchId, supplierId, responseTimeMs: 900 } };
}

function ended(searchId: string, status: "completed" | "timedOut"): SearchEvent {
	return { type: "ended", data: { searchId, status, responded: 3, total: 3 } };
}

describe("SearchStore", () => {
	let client: FakeSearchStreamClient;
	let store: SearchStore;

	beforeEach(() => {
		client = new FakeSearchStreamClient();
		TestBed.configureTestingModule({
			providers: [SearchStore, { provide: SearchStreamClient, useValue: client }],
		});
		store = TestBed.inject(SearchStore);
	});

	function startSearch(): { id: string; events: Subject<SearchEvent> } {
		store.search(form);
		const call = client.calls.at(-1);
		if (!call) {
			throw new Error("No request was sent");
		}
		return { id: call.request.searchId, events: call.events };
	}

	function state(): object {
		return {
			searchId: store.searchId(),
			suppliers: store.suppliers(),
			results: store.results(),
			responded: store.responded(),
			total: store.total(),
			status: store.status(),
			errorMessage: store.errorMessage(),
		};
	}

	function running(searchId: string): object {
		return {
			searchId,
			suppliers: [],
			results: [],
			responded: 0,
			total: 0,
			status: "running",
			errorMessage: null,
		};
	}

	function resultIds(): string[] {
		return store.results().map((result) => result.supplierId);
	}

	it("SC5: is idle before the first search", () => {
		expect(state()).toEqual({ ...running(""), searchId: null, status: "idle" });
		expect(client.calls).toHaveLength(0);
	});

	it("SC2: sends the request with the new searchId and takes suppliers and total from started", () => {
		const { id, events } = startSearch();
		expect(client.calls.map((call) => call.request)).toEqual([{ ...form, searchId: id }]);
		expect(id).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);

		events.next(started(id));

		expect(state()).toEqual({ ...running(id), suppliers, total: 3 });
	});

	it.each([
		[[10, 20, 30]],
		[[10, 30, 20]],
		[[20, 10, 30]],
		[[20, 30, 10]],
		[[30, 10, 20]],
		[[30, 20, 10]],
	])("SC2, SC3: results appear one by one, sorted by price, for arrival order %j", (prices) => {
		const { id, events } = startSearch();
		events.next(started(id));

		prices.forEach((price, index) => {
			events.next(quote(id, `s${index + 1}`, price));
			const arrived = prices.slice(0, index + 1).sort((a, b) => a - b);
			expect(store.results().map((result) => result.price)).toEqual(arrived);
		});
	});

	it("SC3, SC4: quotes with the same price keep their arrival order", () => {
		const { id, events } = startSearch();
		events.next(started(id));

		events.next(quote(id, "s2", 10));
		events.next(quote(id, "s1", 10));

		expect(resultIds()).toEqual(["s2", "s1"]);
	});

	it("SC6: a new search aborts the running one and ignores its late events", () => {
		const a = startSearch();
		a.events.next(started(a.id));
		expect(a.events.observed).toBe(true);

		const b = startSearch();
		expect(a.events.observed).toBe(false);
		expect(b.events.observed).toBe(true);
		expect(b.id).not.toBe(a.id);

		a.events.next(quote(a.id, "s1", 10));
		a.events.next(ended(a.id, "completed"));
		expect(state()).toEqual(running(b.id));
	});

	it("SC6: a new search resets results and progress before any of its events arrives", () => {
		const a = startSearch();
		a.events.next(started(a.id));
		a.events.next(quote(a.id, "s1", 10));
		expect(store.responded()).toBe(1);

		const b = startSearch();

		expect(state()).toEqual(running(b.id));
	});

	it("SC6: the state is reset before the request is sent", () => {
		const statesWhenSent: object[] = [];
		const search = client.search.bind(client);
		client.search = (request) => {
			statesWhenSent.push(state());
			return search(request);
		};

		const { id } = startSearch();

		expect(statesWhenSent).toEqual([running(id)]);
	});

	it.each([
		["started", started],
		["quote", (id: string) => quote(id, "s1", 10)],
		["supplier-failed", (id: string) => failed(id, "s1")],
		["ended", (id: string) => ended(id, "completed")],
	])("SC6: %s with an old searchId is ignored in the stream of the new search", (_, event) => {
		const a = startSearch();
		const b = startSearch();

		b.events.next(event(a.id));
		expect(state()).toEqual(running(b.id));

		b.events.next(started(b.id));
		expect(store.total()).toBe(3);
	});

	it("SC5, I1: responded counts quotes and failures, results holds only quotes", () => {
		const { id, events } = startSearch();
		events.next(started(id));

		events.next(quote(id, "s1", 10));
		expect(store.responded()).toBe(1);
		events.next(failed(id, "s2"));
		expect(store.responded()).toBe(2);

		expect(store.total()).toBe(3);
		expect(resultIds()).toEqual(["s1"]);
	});

	it.each(["completed", "timedOut"] as const)(
		"SC5: ended sets the status %s, which stays after the stream completes",
		(status) => {
			const { id, events } = startSearch();
			events.next(started(id));
			events.next(quote(id, "s1", 10));
			expect(store.status()).toBe("running");

			events.next(ended(id, status));
			expect(store.status()).toBe(status);
			events.complete();

			expect(store.status()).toBe(status);
			expect(store.errorMessage()).toBeNull();
			expect(resultIds()).toEqual(["s1"]);
		},
	);

	it("SC5: a stream error sets the error state and keeps the results", () => {
		const { id, events } = startSearch();
		events.next(started(id));
		events.next(quote(id, "s1", 10));

		events.error(new Error("Connection lost"));

		expect(store.status()).toBe("error");
		expect(store.errorMessage()).toBe("Connection lost");
		expect(resultIds()).toEqual(["s1"]);
	});

	it("SC5: a stream that completes without ended sets the error state", () => {
		const { id, events } = startSearch();
		events.next(started(id));

		events.complete();

		expect(store.status()).toBe("error");
		expect(store.errorMessage()).toBe("Search ended unexpectedly");
	});

	it("SC5: a search after a stream error clears the error, runs and updates the state", () => {
		startSearch().events.error(new Error("Connection lost"));

		const b = startSearch();
		expect(state()).toEqual(running(b.id));

		b.events.next(started(b.id));
		b.events.next(quote(b.id, "s1", 10));
		b.events.next(ended(b.id, "completed"));
		expect(resultIds()).toEqual(["s1"]);
		expect(store.status()).toBe("completed");
	});

	it("SS5: destroying the store aborts the running search", () => {
		const { events } = startSearch();
		expect(events.observed).toBe(true);

		TestBed.resetTestingModule();

		expect(events.observed).toBe(false);
	});
});
