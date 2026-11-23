import { TestBed } from "@angular/core/testing";
import { FETCH } from "./fetch";

describe("FETCH", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("SC2: calls the global fetch bound to globalThis, also as a method of another object", () => {
		const receivers: unknown[] = [];
		vi.stubGlobal("fetch", function (this: unknown) {
			receivers.push(this);
		});

		const holder = { fetch: TestBed.inject(FETCH) };
		void holder.fetch("/");

		expect(receivers).toHaveLength(1);
		expect(receivers[0]).toBe(globalThis);
	});
});
