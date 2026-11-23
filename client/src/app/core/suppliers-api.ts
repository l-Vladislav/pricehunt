import { Injectable } from "@angular/core";
import { EMPTY, Observable } from "rxjs";

export interface Supplier {
	id: string;
	name: string;
}

@Injectable({ providedIn: "root" })
export class SuppliersApi {
	getSuppliers(): Observable<Supplier[]> {
		return EMPTY;
	}
}
