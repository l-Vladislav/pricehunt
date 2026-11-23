import { InjectionToken } from "@angular/core";

// Bound, because browsers throw "Illegal invocation" when fetch is called as a method of another object.
export const FETCH = new InjectionToken<typeof fetch>("FETCH", {
	providedIn: "root",
	factory: () => globalThis.fetch.bind(globalThis),
});
