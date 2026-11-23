import { Observable, Subject } from "rxjs";
import { SearchEvent, SearchRequest } from "./search-types";

export class FakeSearchStreamClient {
	readonly calls: { request: SearchRequest; events: Subject<SearchEvent> }[] = [];

	search(request: SearchRequest): Observable<SearchEvent> {
		const events = new Subject<SearchEvent>();
		this.calls.push({ request, events });
		return events;
	}
}
