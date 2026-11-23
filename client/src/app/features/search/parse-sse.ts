import { SearchEvent } from "./search-types";

export function parseSse(buffer: string): { events: SearchEvent[]; rest: string } {
	const frames = buffer.split(/\r?\n\r?\n/);
	const rest = frames.pop() ?? "";
	return { events: frames.map(parseFrame), rest };
}

function parseFrame(frame: string): SearchEvent {
	const type = /^event: ?(.*)$/m.exec(frame)?.[1];
	const data = /^data: ?(.*)$/m.exec(frame)?.[1] ?? "";
	return { type, data: JSON.parse(data) } as SearchEvent;
}
