import { HarnessLoader } from "@angular/cdk/testing";
import { TestbedHarnessEnvironment } from "@angular/cdk/testing/testbed";
import {
	HttpTestingController,
	provideHttpClientTesting,
	TestRequest,
} from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import {
	MatDatepickerInputHarness,
	MatDatepickerToggleHarness,
} from "@angular/material/datepicker/testing";
import { MatFormFieldHarness } from "@angular/material/form-field/testing";
import { MatPaginatorHarness } from "@angular/material/paginator/testing";
import { MatSelectHarness } from "@angular/material/select/testing";
import { MatSortHarness } from "@angular/material/sort/testing";
import { MatTableHarness } from "@angular/material/table/testing";
import { provideRouter, Router } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { routes } from "../../app.routes";
import { API_BASE_URL } from "../../core/api-base-url";
import { HistoryItem } from "../../core/history-api";
import { HistoryPage } from "./history-page";

const suppliers = ["s1", "s2", "s3"].map((id) => ({ id, name: `Supplier ${id}` }));
const suppliersUrl = "http://api.test/api/suppliers";
const historyUrl = "http://api.test/api/history";
const firstPage = "page=1&pageSize=20&sortBy=date&sortDir=desc";

const item: HistoryItem = {
	id: 1,
	date: "2026-11-23T22:30:00Z",
	fromLocation: "Haifa",
	toLocation: "Rotterdam",
	supplierName: "Supplier s1",
	price: 1250.5,
	responseTimeMs: 1234,
};

const failures: [string, (request: TestRequest) => void][] = [
	["a network error", (r) => r.error(new ProgressEvent("error"))],
	["a 500", (r) => r.flush(null, { status: 500, statusText: "Server Error" })],
];

function localTime(instant: string): string {
	const d = new Date(instant);
	const two = (value: number) => String(value).padStart(2, "0");
	const day = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
	return `${day} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

describe("HistoryPage", () => {
	let fixture: ComponentFixture<HistoryPage>;
	let loader: HarnessLoader;
	let http: HttpTestingController;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideHttpClientTesting(),
				provideRouter(routes),
				{ provide: API_BASE_URL, useValue: "http://api.test" },
			],
		});
		http = TestBed.inject(HttpTestingController);
	});

	async function createPage(): Promise<void> {
		fixture = TestBed.createComponent(HistoryPage);
		loader = TestbedHarnessEnvironment.loader(fixture);
		await fixture.whenStable();
	}

	function historyRequests(): TestRequest[] {
		return http.match((request) => request.url === historyUrl);
	}

	function historyRequest(): TestRequest {
		const requests = historyRequests();
		expect(requests).toHaveLength(1);
		return requests[0];
	}

	async function respond(request: TestRequest, ...items: HistoryItem[]): Promise<void> {
		await respondWithTotal(request, items.length, ...items);
	}

	async function respondWithTotal(
		request: TestRequest,
		total: number,
		...items: HistoryItem[]
	): Promise<void> {
		const page = Number(request.request.params.get("page"));
		request.flush({ items, total, page, pageSize: 20 });
		await fixture.whenStable();
	}

	async function openPage(...items: HistoryItem[]): Promise<void> {
		await createPage();
		http.expectOne(suppliersUrl).flush(suppliers);
		await respond(historyRequest(), ...items);
	}

	// Three pages.
	async function openPageOf45(): Promise<void> {
		await createPage();
		http.expectOne(suppliersUrl).flush(suppliers);
		await respondWithTotal(historyRequest(), 45, item);
	}

	async function paginator(): Promise<MatPaginatorHarness> {
		return loader.getHarness(MatPaginatorHarness);
	}

	async function rangeLabel(): Promise<string> {
		return (await paginator()).getRangeLabel();
	}

	async function goToLastOf3Pages(): Promise<void> {
		await (await paginator()).goToNextPage();
		await respondWithTotal(historyRequest(), 45, item);
		await (await paginator()).goToNextPage();
		await respondWithTotal(historyRequest(), 45, item);
		expect(await rangeLabel()).toBe("41 – 45 of 45");
	}

	async function clickHeader(label: string): Promise<void> {
		const sort = await loader.getHarness(MatSortHarness);
		const [header] = await sort.getSortHeaders({ label });
		await header.click();
	}

	async function activeSort(): Promise<string[]> {
		const header = await (await loader.getHarness(MatSortHarness)).getActiveHeader();
		return header ? [await header.getLabel(), await header.getSortDirection()] : [];
	}

	function params({ request }: TestRequest, ...names: string[]): (string | null)[] {
		return names.map((name) => request.params.get(name));
	}

	function emptyMessages(): HTMLElement[] {
		return elements("p").filter((p) => p.textContent.includes("No searches found"));
	}

	async function formField(label: string): Promise<MatFormFieldHarness> {
		return loader.getHarness(MatFormFieldHarness.with({ floatingLabelText: label }));
	}

	async function dateInput(label: string): Promise<MatDatepickerInputHarness> {
		const input = await (await formField(label)).getControl(MatDatepickerInputHarness);
		if (!input) {
			throw new Error(`No datepicker in ${label}`);
		}
		return input;
	}

	async function typeDate(label: string, text: string): Promise<void> {
		await (await dateInput(label)).setValue(text);
	}

	async function pickDay(label: string, day: string): Promise<void> {
		const [startToggle, endToggle] = await loader.getAllHarnesses(MatDatepickerToggleHarness);
		const toggle = label === "Start date" ? startToggle : endToggle;
		await toggle.openCalendar();
		await (await toggle.getCalendar()).selectCell({ text: day });
	}

	async function supplierSelect(): Promise<MatSelectHarness> {
		const select = await (await formField("Suppliers")).getControl(MatSelectHarness);
		if (!select) {
			throw new Error("No select in Suppliers");
		}
		return select;
	}

	async function toggleSupplier(name: string): Promise<void> {
		const select = await supplierSelect();
		await select.open();
		await (await select.getOptions({ text: name }))[0].click();
	}

	function elements(selector: string): HTMLElement[] {
		return [...fixture.nativeElement.querySelectorAll(selector)];
	}

	function errors(): string[] {
		return elements("[role=alert]").map((element) => element.textContent.trim());
	}

	async function rows(): Promise<string[][]> {
		return (await loader.getHarness(MatTableHarness)).getCellTextByIndex();
	}

	it("HC1: is a separate screen at /history", async () => {
		const harness = await RouterTestingHarness.create("/history");

		expect(harness.routeDebugElement?.componentInstance).toBeInstanceOf(HistoryPage);
	});

	it.each([
		["/", "/history"],
		["/history", "/"],
	])("HC1: the page at %s links to %s", async (from, to) => {
		const harness = await RouterTestingHarness.create(from);

		harness.routeNativeElement!.querySelector("a")!.click();
		await harness.fixture.whenStable();

		expect(TestBed.inject(Router).url).toBe(to);
	});

	it("HC1: has a start date, an end date and a supplier multi-select, all empty", async () => {
		await openPage();

		expect(await (await dateInput("Start date")).getValue()).toBe("");
		expect(await (await dateInput("End date")).getValue()).toBe("");
		const select = await supplierSelect();
		expect(await select.isMultiple()).toBe(true);
		expect(await select.isEmpty()).toBe(true);
		await select.open();
		const options = await select.getOptions();
		const names = await Promise.all(options.map((option) => option.getText()));
		expect(names).toEqual(suppliers.map(({ name }) => name));
	});

	it("HC1: opening the page requests the first page without filters", async () => {
		await createPage();

		const { request } = historyRequest();

		expect(request.method).toBe("GET");
		const [url, query] = request.urlWithParams.split("?");
		expect(url).toBe(historyUrl);
		expect(query.split("&").sort()).toEqual(firstPage.split("&").sort());
	});

	it("HC1, I4: days picked in the calendars are sent as local midnights, the end day included", async () => {
		await openPage();
		await typeDate("Start date", "11/1/2026");
		await respond(historyRequest());
		await typeDate("End date", "11/30/2026");
		await respond(historyRequest());

		await pickDay("Start date", "23");
		await respond(historyRequest());
		await pickDay("End date", "23");

		const { params } = historyRequest().request;
		expect(params.get("startDate")).toBe(new Date(2026, 10, 23).toISOString());
		expect(params.get("endDate")).toBe(new Date(2026, 10, 24).toISOString());
	});

	it.each([
		["a month end", "11/30/2026", new Date(2026, 10, 30), new Date(2026, 11, 1)],
		// This day is 25 hours long in CI's Asia/Jerusalem.
		["a clock change", "10/25/2026", new Date(2026, 9, 25), new Date(2026, 9, 26)],
		["a typed time", "11/23/2026 17:00", new Date(2026, 10, 23), new Date(2026, 10, 24)],
	])("I4: the bounds are local midnights for %s", async (_, text, start, end) => {
		await openPage();
		await typeDate("Start date", text);
		await respond(historyRequest());
		await typeDate("End date", text);

		const { params } = historyRequest().request;

		expect(params.get("startDate")).toBe(start.toISOString());
		expect(params.get("endDate")).toBe(end.toISOString());
	});

	it.each([
		["Start date", "startDate", new Date(2026, 10, 23), "endDate"],
		["End date", "endDate", new Date(2026, 10, 24), "startDate"],
	])("HC1: %s works alone and can be cleared", async (label, param, instant, other) => {
		await openPage();
		await typeDate(label, "11/23/2026");
		const request = historyRequest();
		expect(request.request.params.get(param)).toBe(instant.toISOString());
		expect(request.request.params.has(other)).toBe(false);
		await respond(request);

		await typeDate(label, "");

		expect(historyRequest().request.params.has(param)).toBe(false);
	});

	it("HC1: picked suppliers are sent as repeated supplierIds", async () => {
		await openPage();
		await toggleSupplier("Supplier s1");
		await respond(historyRequest());
		await toggleSupplier("Supplier s3");
		const request = historyRequest();
		expect(request.request.urlWithParams).toContain("supplierIds=s1&supplierIds=s3");
		await respond(request);

		await toggleSupplier("Supplier s1");

		expect(historyRequest().request.params.getAll("supplierIds")).toEqual(["s3"]);
	});

	it("HC1: the filters are combined", async () => {
		await openPage();
		await typeDate("Start date", "11/23/2026");
		await respond(historyRequest());

		await toggleSupplier("Supplier s2");

		const { params } = historyRequest().request;
		expect(params.get("startDate")).toBe(new Date(2026, 10, 23).toISOString());
		expect(params.getAll("supplierIds")).toEqual(["s2"]);
	});

	it("HC1: a typed date applies when the field is left, not per keystroke", async () => {
		await openPage();
		const host = await (await dateInput("Start date")).host();

		await host.sendKeys("11/23/2026");
		expect(historyRequests()).toHaveLength(0);

		await host.dispatchEvent("change");
		expect(historyRequest().request.params.get("startDate")).toBe(
			new Date(2026, 10, 23).toISOString(),
		);
	});

	it.each(["Start date", "End date"])(
		"HC1: a %s that can't be parsed sends nothing, also when another filter changes",
		async (label) => {
			await openPage();

			await typeDate(label, "abc");
			await toggleSupplier("Supplier s1");
			expect(historyRequests()).toHaveLength(0);

			await typeDate(label, "11/23/2026");
			expect(historyRequest().request.params.getAll("supplierIds")).toEqual(["s1"]);
		},
	);

	it("HC1: a start date after the end date sends nothing until it is fixed", async () => {
		await openPage();
		await typeDate("End date", "11/23/2026");
		await respond(historyRequest());

		await typeDate("Start date", "11/24/2026");
		await toggleSupplier("Supplier s1");
		expect(historyRequests()).toHaveLength(0);
		expect(errors()).toEqual(["Start date is after end date"]);

		await typeDate("Start date", "11/23/2026");
		expect(errors()).toEqual([]);
		expect(historyRequest().request.params.get("startDate")).toBe(
			new Date(2026, 10, 23).toISOString(),
		);
	});

	it("HC1: the date order is checked when the field is left, not per keystroke", async () => {
		await openPage();
		await typeDate("Start date", "11/22/2026");
		await respond(historyRequest());
		const host = await (await dateInput("End date")).host();

		// A complete date already before the start date.
		await host.sendKeys("11/2/2026");
		expect(errors()).toEqual([]);

		await host.dispatchEvent("change");
		await fixture.whenStable();
		expect(errors()).toEqual(["Start date is after end date"]);
	});

	it("HC1: a start time later on the end day is not after the end date", async () => {
		await openPage();
		await typeDate("End date", "11/23/2026");
		await respond(historyRequest());

		await typeDate("Start date", "11/23/2026 17:00");

		expect(historyRequests()).toHaveLength(1);
	});

	it("HC1: a filter change cancels the request before it", async () => {
		await openPage();
		await toggleSupplier("Supplier s1");
		const first = historyRequest();
		expect(first.cancelled).toBe(false);

		await toggleSupplier("Supplier s2");
		const second = historyRequest();

		expect(first.cancelled).toBe(true);
		expect(second.cancelled).toBe(false);
	});

	it.each(failures)("HC1: shows a message when the history fails with %s", async (_, fail) => {
		await openPage(item);
		expect(errors()).toEqual([]);
		await toggleSupplier("Supplier s1");
		fail(historyRequest());
		await fixture.whenStable();
		expect(errors()).toEqual(["History is unavailable, please try again later"]);
		expect(elements("td")).toEqual([]);

		await toggleSupplier("Supplier s2");
		await respond(historyRequest(), item);

		expect(errors()).toEqual([]);
		expect(await rows()).toHaveLength(1);
	});

	it("HC1: filters still work after a date with no next day", async () => {
		await openPage();
		await typeDate("End date", "9/13/275760");
		expect(historyRequests()).toHaveLength(0);
		expect(errors()).toEqual(["History is unavailable, please try again later"]);

		await typeDate("End date", "11/23/2026");

		expect(historyRequests()).toHaveLength(1);
	});

	it.each(failures)("HC1: shows a message when the suppliers fail with %s", async (_, fail) => {
		await createPage();
		const request = http.expectOne(suppliersUrl);
		await respond(historyRequest(), item);
		expect(errors()).toEqual([]);

		fail(request);
		await fixture.whenStable();

		expect(errors()).toEqual(["Suppliers not found"]);
		expect(await rows()).toHaveLength(1);
	});

	it("HC1: leaving the page cancels its requests", async () => {
		await createPage();
		const requests = [http.expectOne(suppliersUrl), historyRequest()];
		expect(requests.map((request) => request.cancelled)).toEqual([false, false]);

		fixture.destroy();

		expect(requests.map((request) => request.cancelled)).toEqual([true, true]);
	});

	it("HC2: the table shows the five columns, rows in the order of the response", async () => {
		await openPage(item, {
			...item,
			id: 2,
			fromLocation: "Ashdod",
			supplierName: "Supplier s2",
			price: 99,
			responseTimeMs: 800,
		});

		const table = await loader.getHarness(MatTableHarness);
		const [header] = await table.getHeaderRows();
		expect(await header.getCellTextByIndex()).toEqual([
			"Date",
			"Route",
			"Supplier",
			"Price",
			"Response time",
		]);
		expect((await rows()).map((cells) => cells.slice(1))).toEqual([
			["Haifa → Rotterdam", "Supplier s1", "$1,250.50", "1234 ms"],
			["Ashdod → Rotterdam", "Supplier s2", "$99.00", "800 ms"],
		]);
	});

	it("HC2: a filter change replaces the rows", async () => {
		await openPage(item);
		await toggleSupplier("Supplier s2");

		await respond(historyRequest(), { ...item, id: 2, supplierName: "Supplier s2" });

		expect((await rows()).map((cells) => cells[2])).toEqual(["Supplier s2"]);
	});

	it("HC2: the table opens sorted by date, newest first", async () => {
		await openPage();

		expect(await activeSort()).toEqual(["Date", "desc"]);
	});

	it.each([
		["Date", "date"],
		["Route", "route"],
		["Supplier", "supplier"],
		["Price", "price"],
		["Response time", "responseTime"],
	])("HC2: clicking %s sorts by it on the server, from page 1", async (label, sortBy) => {
		await openPageOf45();

		for (const direction of ["asc", "desc", "asc"]) {
			await goToLastOf3Pages();

			await clickHeader(label);

			const request = historyRequest();
			expect(params(request, "sortBy", "sortDir", "page")).toEqual([sortBy, direction, "1"]);
			expect(await activeSort()).toEqual([label, direction]);
			await respondWithTotal(request, 45, item);
			expect(await rangeLabel()).toBe("1 – 20 of 45");
		}
	});

	it("HC2: rows stay in the order of the response after a sort", async () => {
		await openPage();
		await clickHeader("Supplier");

		await respond(
			historyRequest(),
			{ ...item, supplierName: "B" },
			{ ...item, id: 2, supplierName: "A" },
		);

		expect((await rows()).map((cells) => cells[2])).toEqual(["B", "A"]);
	});

	it("HC2: next and previous load the page from the server, the total is shown", async () => {
		await openPageOf45();
		expect(await rangeLabel()).toBe("1 – 20 of 45");
		expect(await (await paginator()).isPreviousPageDisabled()).toBe(true);

		await (await paginator()).goToNextPage();
		const second = historyRequest();
		expect(params(second, "page", "pageSize")).toEqual(["2", "20"]);
		await respondWithTotal(second, 45, { ...item, id: 2, supplierName: "Second page" });
		expect((await rows()).map((cells) => cells[2])).toEqual(["Second page"]);
		expect(await rangeLabel()).toBe("21 – 40 of 45");

		await (await paginator()).goToNextPage();
		const third = historyRequest();
		expect(params(third, "page")).toEqual(["3"]);
		await respondWithTotal(third, 45, item);
		expect(await (await paginator()).isNextPageDisabled()).toBe(true);

		await (await paginator()).goToPreviousPage();
		const back = historyRequest();
		expect(params(back, "page")).toEqual(["2"]);
		await respondWithTotal(back, 45, item);

		await (await paginator()).goToPreviousPage();
		expect(params(historyRequest(), "page")).toEqual(["1"]);
	});

	it.each([
		["a supplier", () => toggleSupplier("Supplier s1")],
		["a date", () => typeDate("Start date", "11/23/2026")],
	])("HC2: changing %s on page 3 requests page 1", async (_, change) => {
		await openPageOf45();
		await goToLastOf3Pages();

		await change();

		const request = historyRequest();
		expect(params(request, "page")).toEqual(["1"]);
		await respondWithTotal(request, 21, item);
		expect(await rangeLabel()).toBe("1 – 20 of 21");
	});

	it("HC2: the page size is fixed", async () => {
		await openPage();
		await paginator();

		expect(elements(".mat-mdc-paginator-page-size")).toEqual([]);
	});

	it("HC2: a filter change keeps the sort, a page change keeps the sort and the filters", async () => {
		await openPageOf45();
		await clickHeader("Price");
		await respondWithTotal(historyRequest(), 45, item);

		await toggleSupplier("Supplier s1");
		const filtered = historyRequest();
		expect(params(filtered, "sortBy", "sortDir")).toEqual(["price", "asc"]);
		await respondWithTotal(filtered, 45, item);

		await (await paginator()).goToNextPage();
		expect(params(historyRequest(), "sortBy", "sortDir", "supplierIds", "page")).toEqual([
			"price",
			"asc",
			"s1",
			"2",
		]);
	});

	it.each([
		["can't be parsed", "abc"],
		["are in the wrong order", "11/24/2026"],
	])("HC2: while the dates %s, sorting and paging use the last valid filters", async (_, text) => {
		const names = ["startDate", "endDate", "supplierIds"];
		const lastValid = [null, new Date(2026, 10, 24).toISOString(), null];
		await openPageOf45();
		await typeDate("End date", "11/23/2026");
		await respondWithTotal(historyRequest(), 45, item);
		await typeDate("Start date", text);
		await toggleSupplier("Supplier s1");
		expect(historyRequests()).toHaveLength(0);

		await clickHeader("Price");
		const sorted = historyRequest();
		expect(params(sorted, ...names, "sortBy")).toEqual([...lastValid, "price"]);
		await respondWithTotal(sorted, 45, item);

		await (await paginator()).goToNextPage();
		expect(params(historyRequest(), ...names, "page")).toEqual([...lastValid, "2"]);
	});

	it.each([
		["a sort", () => clickHeader("Price")],
		["a page change", async () => (await paginator()).goToNextPage()],
	])("HC2: %s cancels the request before it", async (_, change) => {
		await openPageOf45();
		await toggleSupplier("Supplier s1");
		const first = historyRequest();

		await change();

		expect(first.cancelled).toBe(true);
		expect(historyRequest().cancelled).toBe(false);
	});

	it("HC2: skeleton rows stand in for the rows until the first response", async () => {
		await createPage();

		expect(elements(".skeleton-row")).toHaveLength(20);
		expect(emptyMessages()).toEqual([]);

		await respond(historyRequest(), item);
		expect(elements(".skeleton-row")).toEqual([]);
		expect(await rows()).toHaveLength(1);
		expect(emptyMessages()).toEqual([]);
	});

	it.each([
		["a sort", () => clickHeader("Price")],
		["a page change", async () => (await paginator()).goToNextPage()],
		["a filter change", () => toggleSupplier("Supplier s1")],
	])("HC2: skeleton rows replace the rows after %s", async (_, change) => {
		await openPageOf45();

		await change();
		expect(elements(".skeleton-row")).toHaveLength(20);
		expect(await rows()).toEqual([]);
		expect(await rangeLabel()).toContain("of 45");

		await respondWithTotal(historyRequest(), 45, item);
		expect(elements(".skeleton-row")).toEqual([]);
		expect(await rows()).toHaveLength(1);
	});

	it.each(failures)(
		"HC2: after %s the message replaces the skeleton, another page can be tried",
		async (_, fail) => {
			await openPageOf45();
			await (await paginator()).goToNextPage();

			fail(historyRequest());
			await fixture.whenStable();

			expect(errors()).toEqual(["History is unavailable, please try again later"]);
			expect(elements("td, .skeleton-row")).toEqual([]);
			expect(emptyMessages()).toEqual([]);
			expect(await rangeLabel()).toBe("21 – 40 of 45");

			await (await paginator()).goToNextPage();
			const request = historyRequest();
			expect(params(request, "page")).toEqual(["3"]);
			expect(errors()).toEqual([]);
			expect(elements(".skeleton-row")).toHaveLength(20);
			await respondWithTotal(request, 45, item);
			expect(await rows()).toHaveLength(1);
		},
	);

	it.each([
		[5, "1", "1 – 5 of 5"],
		[20, "1", "1 – 20 of 20"],
		[21, "2", "21 – 21 of 21"],
	])("HC2: a page past the last of %i rows loads the last one", async (total, lastPage, range) => {
		await openPageOf45();
		await goToLastOf3Pages();
		await (await paginator()).goToPreviousPage();
		await respondWithTotal(historyRequest(), 45, item);
		await (await paginator()).goToNextPage();

		await respondWithTotal(historyRequest(), total);

		const request = historyRequest();
		expect(params(request, "page")).toEqual([lastPage]);
		expect(elements(".skeleton-row")).toHaveLength(20);
		expect(emptyMessages()).toEqual([]);
		await respondWithTotal(request, total, item);
		expect(await rangeLabel()).toBe(range);
		expect(await rows()).toHaveLength(1);
	});

	it("HC2: an empty page shows a message", async () => {
		await openPage();

		expect(emptyMessages()).toHaveLength(1);
		expect(elements("td, .skeleton-row")).toEqual([]);
		expect(await rangeLabel()).toBe("0 of 0");

		await toggleSupplier("Supplier s1");
		expect(emptyMessages()).toEqual([]);
	});

	it("I5: a failed row shows Failed as its price", async () => {
		await openPage({ ...item, price: null }, { ...item, id: 2, price: 0 });

		expect((await rows()).map((cells) => cells[3])).toEqual(["Failed", "$0.00"]);
	});

	it("I4: dates are shown in local time", async () => {
		await openPage(item);

		expect((await rows())[0][0]).toBe(localTime(item.date));
	});
});
