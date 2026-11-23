import { SearchEvent } from "./search-types";

export function parseSse(buffer: string): { events: SearchEvent[]; rest: string } {
	return { events: [], rest: buffer };
}
