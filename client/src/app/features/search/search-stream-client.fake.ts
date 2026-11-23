import { Observable, Subject, defer } from "rxjs";
import { SearchStreamClient } from "./search-stream-client";
import { SearchEvent, SearchRequest } from "./search-types";

// Like the real client, it sends a request per subscription, not per search() call.
export class FakeSearchStreamClient implements Pick<SearchStreamClient, "search"> {
	readonly calls: { request: SearchRequest; events: Subject<SearchEvent> }[] = [];

	search(request: SearchRequest): Observable<SearchEvent> {
		return defer(() => {
			const events = new Subject<SearchEvent>();
			this.calls.push({ request, events });
			return events;
		});
	}
}
