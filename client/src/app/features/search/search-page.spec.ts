import { HarnessLoader } from "@angular/cdk/testing";
import { TestbedHarnessEnvironment } from "@angular/cdk/testing/testbed";
import {
	HttpTestingController,
	provideHttpClientTesting,
	TestRequest,
} from "@angular/common/http/testing";
import { ErrorHandler } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatButtonHarness } from "@angular/material/button/testing";
import {
	MatDatepickerInputHarness,
	MatDatepickerToggleHarness,
} from "@angular/material/datepicker/testing";
import { MatFormFieldHarness } from "@angular/material/form-field/testing";
import { MatInputHarness } from "@angular/material/input/testing";
import { MatProgressBarHarness } from "@angular/material/progress-bar/testing";
import { MatSelectHarness } from "@angular/material/select/testing";
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

function quote(searchId: string, supplierId: string, price: number): SearchEvent {
	return { type: "quote", data: { searchId, supplierId, price, responseTimeMs: 800 } };
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

	async function supplierSelect(): Promise<MatSelectHarness> {
		const select = await (await formField("Suppliers")).getControl(MatSelectHarness);
		if (!select) {
			throw new Error("No select in Suppliers");
		}
		return select;
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

	async function progressBars(): Promise<[string | null, number | null][]> {
		const bars = await loader.getAllHarnesses(MatProgressBarHarness);
		return Promise.all(
			bars.map(async (bar): Promise<[string | null, number | null]> => [
				await bar.getMode(),
				await bar.getValue(),
			]),
		);
	}

	it("SC1: is the default route", async () => {
		const harness = await RouterTestingHarness.create("/");

		expect(harness.routeDebugElement?.componentInstance).toBeInstanceOf(SearchPage);
	});

	it("SC1: shows the locations, the dates and every supplier selected", async () => {
		await openPage();

		for (const label of ["From location", "To location"]) {
			expect(await (await formField(label)).getControl(MatInputHarness)).not.toBeNull();
		}
		for (const label of ["From date", "To date"]) {
			expect(await (await dateInput(label)).getValue()).toBe("");
		}
		const select = await supplierSelect();
		expect(await select.isMultiple()).toBe(true);
		await select.open();
		const options = await select.getOptions();
		const shown = await Promise.all(
			options.map(async (option) => [await option.getText(), await option.isSelected()]),
		);
		expect(shown).toEqual(suppliers.map(({ name }) => [name, true]));
	});

	it("SC1: deselecting every supplier disables Search, one is enough to enable it", async () => {
		await openPage();
		await fillForm();
		const select = await supplierSelect();
		await select.open();
		const options = await select.getOptions();
		expect(options).toHaveLength(7);

		for (const option of options) {
			expect(await (await searchButton()).isDisabled()).toBe(false);
			await option.click();
		}
		expect(await (await searchButton()).isDisabled()).toBe(true);

		await options[3].click();
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
		const select = await supplierSelect();
		await select.open();
		await select.clickOptions({ text: "Supplier s2" });

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

	it("SC1: the default selection is sent as the ids of every supplier", async () => {
		await openPage();
		await fillForm();

		await submit();

		expect(client.calls[0].request.supplierIds).toEqual(ids);
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

		await push(quote(id, "s1", 1250));
		expect(rows()).toEqual([["Asked s1", "$1,250.00"]]);

		await push(quote(id, "s2", 99.5));
		expect(rows()).toEqual([
			["Asked s2", "$99.50"],
			["Asked s1", "$1,250.00"],
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
		let animated: { row: Element; keyframes: unknown; options: unknown }[];
		let listTop: number;
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
				animated.push({ row: this, keyframes, options });
				return { cancel: () => shifts.delete(this) } as unknown as Animation;
			};
		});

		afterEach(() => {
			Element.prototype.getBoundingClientRect = originalRect;
			Reflect.deleteProperty(Element.prototype, "animate");
			vi.unstubAllGlobals();
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
			expect(animated[0].options).toEqual({ duration: 250, easing: "ease-out" });
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

		it("SC4: rows move without animation under prefers-reduced-motion", async () => {
			vi.stubGlobal("matchMedia", (query: string) => ({
				matches: query === "(prefers-reduced-motion: reduce)",
				addListener: () => undefined,
				removeListener: () => undefined,
			}));
			const { id, push } = await startSearch();
			await push(quote(id, "s1", 30));

			await push(quote(id, "s2", 20));

			expect(rows().map(([name]) => name)).toEqual(["Asked s2", "Asked s1"]);
			expect(moves()).toEqual([]);
		});

		it("SC4: rows move without animation when Element.animate is missing", async () => {
			Reflect.deleteProperty(Element.prototype, "animate");
			const errors: unknown[] = [];
			// Angular reports an error thrown after a render only to the ErrorHandler.
			TestBed.inject(ErrorHandler).handleError = (error) => errors.push(error);
			const { id, push } = await startSearch();
			await push(quote(id, "s1", 30));

			await push(quote(id, "s2", 20));

			expect(rows().map(([name]) => name)).toEqual(["Asked s2", "Asked s1"]);
			expect(errors).toEqual([]);
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
		["timedOut", 5, "Timed out"],
		["completed", 6, "Completed"],
	] as const)(
		"SC5, I1: shows the progress without failures, and the final state for %s",
		async (status, responded, finalState) => {
			await openPage();
			await fillForm();
			expect(texts(".progress")).toEqual([]);
			const { id, push } = await submit();
			expect(texts(".progress")).toEqual([]);

			await push(started(id));
			expect(texts(".responded")).toEqual(["0 of 7 suppliers responded"]);
			expect(texts(".final-state")).toEqual([""]);
			expect(elements(".elapsed")).toHaveLength(1);
			expect(await progressBars()).toEqual([["determinate", 0]]);

			await push(quote(id, "s1", 10), failed(id, "s2"));
			expect(texts(".responded")).toEqual(["1 of 7 suppliers responded"]);
			expect(texts(".final-state")).toEqual([""]);
			const [[, value]] = await progressBars();
			expect(value).toBeCloseTo(100 / 7);

			const rest = ids.slice(2, responded + 1).map((supplierId) => quote(id, supplierId, 10));
			await push(...rest, ended(id, status, responded));
			expect(texts(".responded")).toEqual([`${responded} of 7 suppliers responded`]);
			expect(texts(".final-state")).toEqual([finalState]);
			expect(elements(".elapsed")).toHaveLength(0);
			const [[, finalValue]] = await progressBars();
			expect(finalValue).toBeCloseTo((responded * 100) / 7);
		},
	);

	it("SC5: the count and the final state are announced, the timer is not", async () => {
		await openPage();
		await fillForm();
		const { id, push } = await submit();

		await push(started(id));
		expect(elements(".responded[role=status], .final-state[role=status]")).toHaveLength(2);
		expect(elements(".elapsed[role=timer]")).toHaveLength(1);
		expect(elements("[role=status] .elapsed, .elapsed[aria-live]")).toHaveLength(0);
		expect(elements("mat-progress-bar[aria-label='Suppliers responded']")).toHaveLength(1);
		const [finalState] = elements(".final-state");

		// A live region is announced only if it was on the page before its text changed.
		await push(ended(id, "completed", 0));
		expect(elements(".final-state")[0]).toBe(finalState);
	});

	describe("SC5: elapsed time", () => {
		let now: number;

		beforeEach(() => {
			now = 1000;
			vi.spyOn(performance, "now").mockImplementation(() => now);
		});

		afterEach(() => {
			vi.useRealTimers();
			vi.restoreAllMocks();
		});

		async function startSearch() {
			await openPage();
			await fillForm();
			// Only the interval: the harnesses and Angular wait on the other timers.
			vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
			const search = await submit();
			await search.push(started(search.id));
			return search;
		}

		async function tickAt(ms: number): Promise<void> {
			now = ms;
			vi.advanceTimersByTime(100);
			await fixture.whenStable();
		}

		it("SC5: shows the time since the search started, also after a late tick", async () => {
			await startSearch();
			expect(texts(".elapsed")).toEqual(["0.0 s"]);

			await tickAt(1100);
			expect(texts(".elapsed")).toEqual(["0.1 s"]);

			await tickAt(5230);
			expect(texts(".elapsed")).toEqual(["4.2 s"]);
		});

		it("SC5: starts again at zero for a search that replaces another", async () => {
			await startSearch();
			await tickAt(4000);
			expect(texts(".elapsed")).toEqual(["3.0 s"]);

			const b = await submit();
			await b.push(started(b.id));
			expect(texts(".elapsed")).toEqual(["0.0 s"]);
			expect(vi.getTimerCount()).toBe(1);

			await tickAt(4500);
			expect(texts(".elapsed")).toEqual(["0.5 s"]);
		});

		it("SC5: counts from the click on Search, not from started", async () => {
			await startSearch();

			const b = await submit();
			await tickAt(1500);
			await b.push(started(b.id));

			expect(texts(".elapsed")).toEqual(["0.5 s"]);
		});

		it("SC5: passing 6 s does not end the search, only the ended event does", async () => {
			const { id, push } = await startSearch();

			await tickAt(7500);
			expect(texts(".elapsed")).toEqual(["6.5 s"]);
			expect(texts(".final-state")).toEqual([""]);

			await push(ended(id, "completed", 0));
			expect(texts(".final-state")).toEqual(["Completed"]);
			expect(vi.getTimerCount()).toBe(0);
		});

		it("SC5: stops on a stream error", async () => {
			const { events } = await startSearch();
			expect(vi.getTimerCount()).toBe(1);

			events.error(new Error("Connection lost"));
			await fixture.whenStable();

			expect(vi.getTimerCount()).toBe(0);
		});

		it("SC5: stops when the page is left", async () => {
			await startSearch();
			expect(vi.getTimerCount()).toBe(1);

			fixture.destroy();

			expect(vi.getTimerCount()).toBe(0);
		});
	});

	it("SC5, I1: when every supplier fails the list is empty and the search is completed", async () => {
		await openPage();
		await fillForm();
		const { id, push } = await submit();

		await push(started(id), ...ids.map((supplierId) => failed(id, supplierId)));
		expect(elements("li")).toHaveLength(0);
		await push(ended(id, "completed", 0));

		expect(texts(".responded")).toEqual(["0 of 7 suppliers responded"]);
		expect(texts(".final-state")).toEqual(["Completed"]);
		expect(elements("li")).toHaveLength(0);
	});

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

		await push(ended(id, "timedOut", 1));
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
		expect(elements(".progress")).toHaveLength(0);
		expect(await progressBars()).toEqual([]);
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
		expect(await (await supplierSelect()).isEmpty()).toBe(true);
		await fillForm();
		expect(await (await searchButton()).isDisabled()).toBe(true);
	});
});
