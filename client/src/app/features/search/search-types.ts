import { Supplier } from "../../core/suppliers-api";

export interface SearchRequest {
	searchId: string;
	fromLocation: string;
	toLocation: string;
	fromDate: string;
	toDate: string;
	supplierIds?: string[];
}

export type SearchEvent =
	| { type: "started"; data: { searchId: string; suppliers: Supplier[] } }
	| {
			type: "quote";
			data: { searchId: string; supplierId: string; price: number; responseTimeMs: number };
	  }
	| {
			type: "supplier-failed";
			data: { searchId: string; supplierId: string; responseTimeMs: number };
	  }
	| {
			type: "ended";
			data: {
				searchId: string;
				status: "completed" | "timedOut";
				responded: number;
				total: number;
			};
	  };
