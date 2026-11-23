import { TestBed } from "@angular/core/testing";
import { Subscription } from "rxjs";
import { FETCH } from "../../core/fetch";
import { SearchStreamClient } from "./search-stream-client";
import { SearchEvent, SearchRequest } from "./search-types";

const request: SearchRequest = {
	searchId: "a",
	fromLocation: "Haifa",
	toLocation: "Rotterdam",
	fromDate: "2026-11-23",
	toDate: "2026-11-30",
	supplierIds: ["s1"],
};
const started: SearchEvent = {
	type: "started",
	data: { searchId: "a", suppliers: [{ id: "s1", name: "Größe" }] },
};
const quote: SearchEvent = {
	type: "quote",
	data: { searchId: "a", supplierId: "s1", price: 120.5, responseTimeMs: 800 },
};

type Bytes = Uint8Array<ArrayBuffer>;

function bytes(event: SearchEvent): Bytes {
	return new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
}

class FakeFetch {
	readonly calls: { url: string; init: RequestInit }[] = [];
	respond: () => Promise<Response> = () => new Promise<Response>(() => undefined);

	readonly fetch: typeof fetch = (url, init) => {
		this.calls.push({ url: String(url), init: init ?? {} });
		return this.respond();
	};

	get aborted(): (boolean | undefined)[] {
		return this.calls.map((call) => call.init.signal?.aborted);
	}
}

class FakeBody {
	private controller!: ReadableStreamDefaultController<Bytes>;

	readonly stream = new ReadableStream<Bytes>({
		start: (controller) => {
			this.controller = controller;
		},
	});

	send(chunk: Bytes): void {
		this.controller.enqueue(chunk);
	}

	close(): void {
		this.controller.close();
	}

	fail(): void {
		this.controller.error(new TypeError("network error"));
	}
}

class Recording {
	private readonly notifications: unknown[] = [];
	private wake: () => void = () => undefined;
	readonly subscription: Subscription;

	constructor(client: SearchStreamClient) {
		this.subscription = client.search(request).subscribe({
			next: (event) => this.push(event),
			error: (error) => this.push(error),
			complete: () => this.push("complete"),
		});
	}

	async next(): Promise<unknown> {
		if (this.notifications.length === 0) {
			await new Promise<void>((resolve) => (this.wake = resolve));
		}
		return this.notifications.shift();
	}

	private push(notification: unknown): void {
		this.notifications.push(notification);
		this.wake();
	}
}

describe("SearchStreamClient", () => {
	let fakeFetch: FakeFetch;
	let client: SearchStreamClient;

	beforeEach(() => {
		fakeFetch = new FakeFetch();
		TestBed.configureTestingModule({
			providers: [{ provide: FETCH, useValue: fakeFetch.fetch }],
		});
		client = TestBed.inject(SearchStreamClient);
	});

	function respondWith(body: BodyInit, status = 200): void {
		fakeFetch.respond = () => Promise.resolve(new Response(body, { status }));
	}

	it("SC2: posts the request as JSON when subscribed", () => {
		const search = client.search(request);
		expect(fakeFetch.calls).toHaveLength(0);

		search.subscribe();

		expect(fakeFetch.calls).toHaveLength(1);
		const { url, init } = fakeFetch.calls[0];
		expect(url).toBe("http://localhost:5080/api/search");
		expect(init.method).toBe("POST");
		expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
		expect(JSON.parse(init.body as string)).toEqual(request);
	});

	it("SC2: emits each event as soon as its chunk is read, completes when the stream ends", async () => {
		const body = new FakeBody();
		respondWith(body.stream);
		const recording = new Recording(client);

		body.send(bytes(started));
		expect(await recording.next()).toEqual(started);
		body.send(bytes(quote));
		expect(await recording.next()).toEqual(quote);
		body.close();
		expect(await recording.next()).toBe("complete");
	});

	it("SC2: emits every event of one chunk", async () => {
		const body = new FakeBody();
		respondWith(body.stream);
		const recording = new Recording(client);

		body.send(Uint8Array.of(...bytes(started), ...bytes(quote)));

		expect(await recording.next()).toEqual(started);
		expect(await recording.next()).toEqual(quote);
	});

	it("SC2: emits events once when chunks split them, also inside a character", async () => {
		const body = new FakeBody();
		respondWith(body.stream);
		const recording = new Recording(client);

		for (const byte of [...bytes(started), ...bytes(quote)]) {
			body.send(Uint8Array.of(byte));
		}
		body.close();

		expect(await recording.next()).toEqual(started);
		expect(await recording.next()).toEqual(quote);
		expect(await recording.next()).toBe("complete");
	});

	it("SC6: unsubscribing before the response aborts the request", () => {
		const recording = new Recording(client);
		expect(fakeFetch.aborted).toEqual([false]);

		recording.subscription.unsubscribe();

		expect(fakeFetch.aborted).toEqual([true]);
	});

	it("SC6: unsubscribing while the stream is read aborts the request", async () => {
		const body = new FakeBody();
		respondWith(body.stream);
		const recording = new Recording(client);
		body.send(bytes(started));
		await recording.next();
		expect(fakeFetch.aborted).toEqual([false]);

		recording.subscription.unsubscribe();

		expect(fakeFetch.aborted).toEqual([true]);
	});

	it("SC6: unsubscribing from one search leaves another one running", () => {
		const first = new Recording(client);
		new Recording(client);

		first.subscription.unsubscribe();

		expect(fakeFetch.aborted).toEqual([true, false]);
	});

	it.each([
		[
			"the first message of the first field",
			400,
			'{"title":"Invalid","errors":{"FromDate":["First.","Second."],"ToDate":["Third."]}}',
			"First.",
		],
		["the title when there are no errors", 400, '{"title":"Bad request"}', "Bad request"],
		["the status when JSON has no message", 404, "{}", "HTTP 404"],
		["the status when the body is not JSON", 500, "<html>", "HTTP 500"],
	])("SC2: a non-2xx response errors with %s", async (_, status, body, message) => {
		respondWith(body, status);

		expect(await new Recording(client).next()).toEqual(new Error(message));
	});

	it("SC2: a rejected fetch errors with Server not reachable", async () => {
		fakeFetch.respond = () => Promise.reject(new TypeError("Failed to fetch"));

		expect(await new Recording(client).next()).toEqual(new Error("Server not reachable"));
	});

	it("SC2: a read that fails mid-stream errors with Connection lost", async () => {
		const body = new FakeBody();
		respondWith(body.stream);
		const recording = new Recording(client);

		body.send(bytes(started));
		expect(await recording.next()).toEqual(started);
		body.fail();
		expect(await recording.next()).toEqual(new Error("Connection lost"));
	});
});
