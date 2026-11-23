export interface SearchRequest {
	searchId: string;
	fromLocation: string;
	toLocation: string;
	/** yyyy-MM-dd */
	fromDate: string;
	/** yyyy-MM-dd */
	toDate: string;
	supplierIds?: string[];
}

/** Tagged by the SSE event name. The payloads are the streaming contract in docs/plan.md. */
export type SearchEvent =
	| { type: "started"; data: { searchId: string; suppliers: { id: string; name: string }[] } }
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
