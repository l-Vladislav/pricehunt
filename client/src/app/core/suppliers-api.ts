import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { API_BASE_URL } from "./api-base-url";

export interface Supplier {
	id: string;
	name: string;
}

@Injectable({ providedIn: "root" })
export class SuppliersApi {
	private readonly http = inject(HttpClient);
	private readonly baseUrl = inject(API_BASE_URL);

	getSuppliers(): Observable<Supplier[]> {
		return this.http.get<Supplier[]>(`${this.baseUrl}/api/suppliers`);
	}
}
