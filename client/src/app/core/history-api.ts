import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { API_BASE_URL } from "./api-base-url";

export interface HistoryQuery {
	startDate?: string;
	endDate?: string;
	supplierIds: string[];
	sortBy: "date" | "route" | "supplier" | "price" | "responseTime";
	sortDir: "asc" | "desc";
	page: number;
	pageSize: number;
}

export interface HistoryItem {
	id: number;
	date: string;
	fromLocation: string;
	toLocation: string;
	supplierName: string;
	price: number;
	responseTimeMs: number;
}

export interface HistoryResult {
	items: HistoryItem[];
	total: number;
	page: number;
	pageSize: number;
}

@Injectable({ providedIn: "root" })
export class HistoryApi {
	private readonly http = inject(HttpClient);
	private readonly baseUrl = inject(API_BASE_URL);

	getHistory({ startDate, endDate, ...rest }: HistoryQuery): Observable<HistoryResult> {
		return this.http.get<HistoryResult>(`${this.baseUrl}/api/history`, {
			// HttpParams would send a missing date as the text "undefined".
			params: { ...(startDate && { startDate }), ...(endDate && { endDate }), ...rest },
		});
	}
}
