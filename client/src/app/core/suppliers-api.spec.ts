import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { API_BASE_URL } from "./api-base-url";
import { Supplier, SuppliersApi } from "./suppliers-api";

describe("SuppliersApi", () => {
	it("loads the suppliers from /api/suppliers under API_BASE_URL", () => {
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: API_BASE_URL, useValue: "http://api.test" },
			],
		});
		const http = TestBed.inject(HttpTestingController);
		const suppliers: Supplier[] = [{ id: "s1", name: "Supplier 1" }];
		const received: Supplier[][] = [];

		TestBed.inject(SuppliersApi)
			.getSuppliers()
			.subscribe((value) => received.push(value));
		http.expectOne({ method: "GET", url: "http://api.test/api/suppliers" }).flush(suppliers);

		expect(received).toEqual([suppliers]);
		http.verify();
	});
});
