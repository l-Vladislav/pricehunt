import { SearchEvent } from "./search-types";

/** Parses the finished events of the buffer. The caller prepends `rest` to the next chunk. */
export function parseSse(buffer: string): { events: SearchEvent[]; rest: string } {
	const frames = buffer.split(/\r?\n\r?\n/);
	const rest = frames.pop() ?? "";
	return { events: frames.map(parseFrame), rest };
}

// Reads only what the API sends: one event line and one data line per frame.
function parseFrame(frame: string): SearchEvent {
	const type = /^event: ?(.*)$/m.exec(frame)?.[1];
	const data = /^data: ?(.*)$/m.exec(frame)?.[1] ?? "";
	return { type, data: JSON.parse(data) } as SearchEvent;
}
