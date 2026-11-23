import { HarnessLoader } from "@angular/cdk/testing";
import { TestbedHarnessEnvironment } from "@angular/cdk/testing/testbed";
import {
	HttpTestingController,
	provideHttpClientTesting,
	TestRequest,
} from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatButtonHarness } from "@angular/material/button/testing";
import { MatCheckboxHarness } from "@angular/material/checkbox/testing";
import {
	MatDatepickerInputHarness,
	MatDatepickerToggleHarness,
} from "@angular/material/datepicker/testing";
import { MatFormFieldHarness } from "@angular/material/form-field/testing";
import { MatInputHarness } from "@angular/material/input/testing";
import { provideRouter } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { Subject } from "rxjs";
import { routes } from "../../app.routes";
import { API_BASE_URL } from "../../core/api-base-url";
import { SearchPage } from "./search-page";
import { SearchStreamClient } from "./search-stream-client";
import { FakeSearchStreamClient } from "./search-stream-client.fake";
import { SearchEvent } from "./search-types";

const ids = ["s1", "s2", "s3", "s4", "s5", "s6", "s7"];
const suppliers = ids.map((id) => ({ id, name: `Supplier ${id}` }));
// Named differently from the form's suppliers, so a test sees where a row takes the name from.
const askedSuppliers = ids.map((id) => ({ id, name: `Asked ${id}` }));
const suppliersUrl = "http://api.test/api/suppliers";

function started(searchId: string): SearchEvent {
	return { type: "started", data: { searchId, suppliers: askedSuppliers } };
}

function quote(id: string, supplierId: string, price: number, responseTimeMs = 800): SearchEvent {
	return { type: "quote", data: { searchId: id, supplierId, price, responseTimeMs } };
}

function failed(searchId: string, supplierId: string): SearchEvent {
	return { type: "supplier-failed", data: { searchId, supplierId, responseTimeMs: 900 } };
}

function ended(searchId: string, status: "completed" | "timedOut", responded: number): SearchEvent {
	return { type: "ended", data: { searchId, status, responded, total: 7 } };
}

describe("SearchPage", () => {
	let client: FakeSearchStreamClient;
	let fixture: ComponentFixture<SearchPage>;
	let loader: HarnessLoader;
	let http: HttpTestingController;

	beforeEach(() => {
		client = new FakeSearchStreamClient();
		TestBed.configureTestingModule({
			providers: [
				provideHttpClientTesting(),
				provideRouter(routes),
				{ provide: API_BASE_URL, useValue: "http://api.test" },
				{ provide: SearchStreamClient, useValue: client },
			],
		});
		http = TestBed.inject(HttpTestingController);
	});

	async function createPage(): Promise<void> {
		fixture = TestBed.createComponent(SearchPage);
		loader = TestbedHarnessEnvironment.loader(fixture);
		await fixture.whenStable();
	}

	async function openPage(): Promise<void> {
		await createPage();
		http.expectOne(suppliersUrl).flush(suppliers);
		await fixture.whenStable();
	}

	async function formField(label: string): Promise<MatFormFieldHarness> {
		return loader.getHarness(MatFormFieldHarness.with({ floatingLabelText: label }));
	}

	async function setText(label: string, value: string): Promise<void> {
		const input = await (await formField(label)).getControl(MatInputHarness);
		await input?.setValue(value);
	}

	async function dateInput(label: string): Promise<MatDatepickerInputHarness> {
		const input = await (await formField(label)).getControl(MatDatepickerInputHarness);
		if (!input) {
			throw new Error(`No datepicker in ${label}`);
		}
		return input;
	}

	async function pickDay(label: string, day: string): Promise<void> {
		// Makes the calendar open on November 2026.
		await (await dateInput(label)).setValue("11/1/2026");
		const [fromToggle, toToggle] = await loader.getAllHarnesses(MatDatepickerToggleHarness);
		const toggle = label === "From date" ? fromToggle : toToggle;
		await toggle.openCalendar();
		await (await toggle.getCalendar()).selectCell({ text: day });
	}

	async function fillForm(): Promise<void> {
		await setText("From location", "Haifa");
		await setText("To location", "Rotterdam");
		await pickDay("From date", "23");
		await pickDay("To date", "30");
	}

	function searchButton(): Promise<MatButtonHarness> {
		return loader.getHarness(MatButtonHarness.with({ text: "Search" }));
	}

	async function submit(): Promise<{
		id: string;
		events: Subject<SearchEvent>;
		push: (...events: SearchEvent[]) => Promise<void>;
	}> {
		const callsBefore = client.calls.length;
		await (await searchButton()).click();
		expect(client.calls).toHaveLength(callsBefore + 1);
		const { request, events } = client.calls[callsBefore];
		const push = async (...pushed: SearchEvent[]) => {
			pushed.forEach((event) => events.next(event));
			await fixture.whenStable();
		};
		return { id: request.searchId, events, push };
	}

	function elements(selector: string): HTMLElement[] {
		return [...fixture.nativeElement.querySelectorAll(selector)];
	}

	function texts(selector: string): string[] {
		return elements(selector).map((element) => element.textContent.trim());
	}

	function rows(): string[][] {
		return elements(".result-row").map((row) =>
			[...row.children].map((cell) => cell.textContent.trim()),
		);
	}

	it("SC1: is the default route", async () => {
		const harness = await RouterTestingHarness.create("/");

		expect(harness.routeDebugElement?.componentInstance).toBeInstanceOf(SearchPage);
	});

	it("SC1: shows the locations, the dates and every supplier checked", async () => {
		await openPage();

		for (const label of ["From location", "To location"]) {
			expect(await (await formField(label)).getControl(MatInputHarness)).not.toBeNull();
		}
		for (const label of ["From date", "To date"]) {
			expect(await (await dateInput(label)).getValue()).toBe("");
		}
		const checkboxes = await loader.getAllHarnesses(MatCheckboxHarness);
		const shown = await Promise.all(
			checkboxes.map(async (box) => [await box.getLabelText(), await box.isChecked()]),
		);
		expect(shown).toEqual(suppliers.map(({ name }) => [name, true]));
	});

	it("SC1: unchecking every supplier disables Search, one is enough to enable it", async () => {
		await openPage();
		await fillForm();
		const checkboxes = await loader.getAllHarnesses(MatCheckboxHarness);
		expect(checkboxes).toHaveLength(7);

		for (const checkbox of checkboxes) {
			expect(await (await searchButton()).isDisabled()).toBe(false);
			await checkbox.uncheck();
		}
		expect(await (await searchButton()).isDisabled()).toBe(true);

		await checkboxes[3].check();
		expect(await (await searchButton()).isDisabled()).toBe(false);
	});

	it.each(["From location", "To location", "From date", "To date"])(
		"SC1: an empty %s disables Search",
		async (label) => {
			await openPage();
			await fillForm();
			expect(await (await searchButton()).isDisabled()).toBe(false);

			if (label.endsWith("date")) {
				await (await dateInput(label)).setValue("");
			} else {
				await setText(label, "");
			}

			expect(await (await searchButton()).isDisabled()).toBe(true);
		},
	);

	it("SC1: submitting starts a search with the form values", async () => {
		await openPage();
		await fillForm();
		const unchecked = MatCheckboxHarness.with({ label: "Supplier s2" });
		await (await loader.getHarness(unchecked)).uncheck();

		const { id } = await submit();

		expect(client.calls.map((call) => call.request)).toEqual([
			{
				searchId: id,
				fromLocation: "Haifa",
				toLocation: "Rotterdam",
				fromDate: "2026-11-23",
				toDate: "2026-11-30",
				supplierIds: ["s1", "s3", "s4", "s5", "s6", "s7"],
			},
		]);
	});

	it("SC1: leaves the blank location and date order rules to the server", async () => {
		await openPage();
		await setText("From location", " ");
		await setText("To location", " ");
		await pickDay("From date", "30");
		await pickDay("To date", "23");

		await submit();

		expect(client.calls[0].request).toMatchObject({
			fromLocation: " ",
			toLocation: " ",
			fromDate: "2026-11-30",
			toDate: "2026-11-23",
		});
	});

	it("SC2: rows appear in price order as events arrive", async () => {
		await openPage();
		await fillForm();
		const { id, push } = await submit();
		await push(started(id));
		expect(rows()).toEqual([]);

		await push(quote(id, "s1", 1250, 800));
		expect(rows()).toEqual([["Asked s1", "$1,250.00", "800 ms"]]);

		await push(quote(id, "s2", 99.5, 1234));
		expect(rows()).toEqual([
			["Asked s2", "$99.50", "1234 ms"],
			["Asked s1", "$1,250.00", "800 ms"],
		]);
	});

	it("SC4: a re-order keeps the DOM node of every row", async () => {
		await openPage();
		await fillForm();
		const { id, push } = await submit();
		await push(started(id), quote(id, "s1", 20), quote(id, "s2", 30));
		const [first, second] = elements(".result-row");

		await push(quote(id, "s3", 10));

		const after = elements(".result-row");
		expect(after).toHaveLength(3);
		expect(after[1]).toBe(first);
		expect(after[2]).toBe(second);
	});

	describe("SC4: row animation", () => {
		const rowHeight = 48;
		const originalRect = Element.prototype.getBoundingClientRect;
		let animated: { row: Element; keyframes: unknown; duration: unknown }[];
		let listTop: number;
		// How far a running animation currently shifts a row from its place in the list.
		let shifts: Map<Element, number>;

		beforeEach(() => {
			animated = [];
			listTop = 300;
			shifts = new Map();
			Element.prototype.getBoundingClientRect = function (this: Element) {
				if (this.matches("ul")) {
					return new DOMRect(0, listTop);
				}
				if (!this.matches(".result-row")) {
					return originalRect.call(this);
				}
				const siblings = [...this.parentElement!.children];
				const top = listTop + siblings.indexOf(this) * rowHeight + (shifts.get(this) ?? 0);
				return new DOMRect(0, top, 800, rowHeight);
			};
			Element.prototype.animate = function (this: Element, keyframes, options) {
				const duration = typeof options === "object" ? options.duration : options;
				animated.push({ row: this, keyframes, duration });
				return { cancel: () => shifts.delete(this) } as unknown as Animation;
			};
		});

		afterEach(() => {
			Element.prototype.getBoundingClientRect = originalRect;
			// jsdom has no animate, so there is nothing to put back.
			Reflect.deleteProperty(Element.prototype, "animate");
		});

		async function startSearch() {
			await openPage();
			await fillForm();
			const { id, push } = await submit();
			await push(started(id));
			return { id, push };
		}

		function moves(): [string, unknown][] {
			return animated.map(({ row, keyframes }) => [
				row.querySelector(".name")!.textContent.trim(),
				keyframes,
			]);
		}

		function slideFrom(offset: number) {
			return [{ transform: `translateY(${offset}px)` }, { transform: "none" }];
		}

		it("SC4: only rows that move slide from their old position", async () => {
			const { id, push } = await startSearch();
			await push(quote(id, "s1", 10), quote(id, "s2", 30));
			expect(moves()).toEqual([]);

			await push(quote(id, "s3", 20));

			expect(moves()).toEqual([["Asked s2", slideFrom(-rowHeight)]]);
			expect(animated[0].duration).toBeGreaterThan(0);
		});

		it("SC4: each row slides by its own distance", async () => {
			const { id, push } = await startSearch();
			await push(quote(id, "s1", 10), quote(id, "s2", 30));

			await push(quote(id, "s3", 20), quote(id, "s4", 5));

			expect(moves()).toEqual([
				["Asked s1", slideFrom(-rowHeight)],
				["Asked s2", slideFrom(-2 * rowHeight)],
			]);
		});

		it("SC4: a row that moves again during its animation continues from where it is shown", async () => {
			const { id, push } = await startSearch();
			await push(quote(id, "s1", 30));
			await push(quote(id, "s2", 20));
			expect(moves()).toEqual([["Asked s1", slideFrom(-rowHeight)]]);
			const [{ row }] = animated;
			animated = [];
			shifts.set(row, -20);

			await push(quote(id, "s3", 25));

			expect(moves()).toEqual([["Asked s1", slideFrom(-rowHeight - 20)]]);
			expect(shifts.has(row)).toBe(false);
		});

		it("SC4: an event that moves no row leaves a running animation alone", async () => {
			const { id, push } = await startSearch();
			await push(quote(id, "s1", 30));
			await push(quote(id, "s2", 20));
			expect(moves()).toEqual([["Asked s1", slideFrom(-rowHeight)]]);
			const [{ row }] = animated;
			animated = [];
			shifts.set(row, -20);

			await push(failed(id, "s3"), quote(id, "s4", 40));

			expect(moves()).toEqual([]);
			expect(shifts.get(row)).toBe(-20);
		});

		it("SC4: scrolling the page between events does not count as a move", async () => {
			const { id, push } = await startSearch();
			await push(quote(id, "s1", 10), quote(id, "s2", 30));
			listTop = 50;

			await push(quote(id, "s3", 20));

			expect(moves()).toEqual([["Asked s2", slideFrom(-rowHeight)]]);
		});

		it("SC4: a re-order that leaves a row at the same place on screen is not animated", async () => {
			Element.prototype.getBoundingClientRect = () => new DOMRect();
			const { id, push } = await startSearch();
			await push(quote(id, "s1", 30));

			await push(quote(id, "s2", 20));

			expect(moves()).toEqual([]);
		});
	});

	it.each([
		["timedOut", 6, "Timed out: 6 of 7 suppliers responded"],
		["completed", 7, "Completed: 7 of 7 suppliers responded"],
	] as const)(
		"SC5: shows the progress, and the final state for %s",
		async (status, responded, text) => {
			await openPage();
			await fillForm();
			expect(texts(".progress")).toEqual([]);
			const { id, push } = await submit();
			expect(texts(".progress")).toEqual([]);

			await push(started(id));
			expect(texts(".progress")).toEqual(["0 of 7 suppliers responded"]);
			await push(quote(id, "s1", 10), failed(id, "s2"));
			expect(texts(".progress")).toEqual(["2 of 7 suppliers responded"]);

			const rest = ids.slice(2, responded).map((supplierId) => quote(id, supplierId, 10));
			await push(...rest, ended(id, status, responded));
			expect(texts(".progress")).toEqual([text]);
		},
	);

	it("SC5: a skeleton row stands in for each pending supplier while the search runs", async () => {
		await openPage();
		await fillForm();
		const { id, push } = await submit();
		expect(elements(".skeleton-row")).toHaveLength(0);

		await push(started(id));
		expect(elements(".skeleton-row")).toHaveLength(7);
		await push(quote(id, "s1", 10), failed(id, "s2"));
		expect(elements(".skeleton-row")).toHaveLength(5);
		const [firstRow] = elements(".result-row, .skeleton-row");
		expect(firstRow.classList).toContain("result-row");

		await push(ended(id, "timedOut", 2));
		expect(elements(".skeleton-row")).toHaveLength(0);
		expect(rows()).toHaveLength(1);
	});

	it("SC5: a stream error shows its message instead of the progress and keeps the results", async () => {
		await openPage();
		await fillForm();
		const { id, events, push } = await submit();
		await push(started(id), quote(id, "s1", 10));
		expect(texts(".error")).toEqual([]);

		events.error(new Error("Connection lost"));
		await fixture.whenStable();

		expect(texts(".error")).toEqual(["Connection lost"]);
		expect(texts(".progress")).toEqual([]);
		expect(elements(".skeleton-row")).toHaveLength(0);
		expect(rows()).toHaveLength(1);
	});

	it("SC6: searching again while a search runs aborts it", async () => {
		await openPage();
		await fillForm();
		const a = await submit();
		await a.push(started(a.id), quote(a.id, "s1", 10));
		expect(a.events.observed).toBe(true);

		const b = await submit();

		expect(client.calls).toHaveLength(2);
		expect(a.events.observed).toBe(false);
		expect(b.events.observed).toBe(true);
		expect(rows()).toEqual([]);
	});

	it("SS5: leaving the page aborts the running search", async () => {
		await openPage();
		await fillForm();
		const { events } = await submit();
		expect(events.observed).toBe(true);

		fixture.destroy();

		expect(events.observed).toBe(false);
	});

	it("leaving the page cancels the supplier list request", async () => {
		await createPage();
		const request = http.expectOne(suppliersUrl);
		expect(request.cancelled).toBe(false);

		fixture.destroy();

		expect(request.cancelled).toBe(true);
	});

	it.each([
		["a network error", (r: TestRequest) => r.error(new ProgressEvent("error"))],
		["a 500", (r: TestRequest) => r.flush(null, { status: 500, statusText: "Server Error" })],
	])("SC1: shows 'Server not reachable' when the supplier list fails with %s", async (_, fail) => {
		await createPage();
		const request = http.expectOne(suppliersUrl);
		expect(texts(".error")).toEqual([]);

		fail(request);
		await fixture.whenStable();

		expect(texts(".error")).toEqual(["Server not reachable"]);
		expect(await loader.getAllHarnesses(MatCheckboxHarness)).toHaveLength(0);
		await fillForm();
		expect(await (await searchButton()).isDisabled()).toBe(true);
	});
});
