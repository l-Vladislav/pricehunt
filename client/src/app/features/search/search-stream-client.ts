import { Injectable } from "@angular/core";
import { EMPTY, Observable } from "rxjs";
import { SearchEvent, SearchRequest } from "./search-types";

@Injectable({ providedIn: "root" })
export class SearchStreamClient {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	search(request: SearchRequest): Observable<SearchEvent> {
		return EMPTY;
	}
}
