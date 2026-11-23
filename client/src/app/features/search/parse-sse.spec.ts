import { parseSse } from "./parse-sse";
import { SearchEvent } from "./search-types";

const failed: SearchEvent = {
	type: "supplier-failed",
	data: { searchId: "a", supplierId: "s1", responseTimeMs: 700 },
};
const ended: SearchEvent = {
	type: "ended",
	data: { searchId: "a", status: "timedOut", responded: 6, total: 7 },
};

function frame(event: SearchEvent, newline = "\n"): string {
	return `event: ${event.type}${newline}data: ${JSON.stringify(event.data)}${newline}${newline}`;
}

describe("parseSse", () => {
	it("SC2: returns every event of one chunk and keeps the unfinished tail", () => {
		const tail = 'event: quote\ndata: {"searchId"';

		expect(parseSse(frame(failed) + frame(ended) + tail)).toEqual({
			events: [failed, ended],
			rest: tail,
		});
	});

	it.each(["\n", "\r\n"])(
		"SC2: parses an event split at any point once (newline %j)",
		(newline) => {
			const text = frame(failed, newline) + frame(ended, newline);

			for (let split = 0; split <= text.length; split++) {
				const first = parseSse(text.slice(0, split));
				const second = parseSse(first.rest + text.slice(split));
				expect([...first.events, ...second.events]).toEqual([failed, ended]);
				expect(second.rest).toBe("");
			}
		},
	);

	it("SC2: an event ends only at an empty line", () => {
		const unfinished = frame(failed).slice(0, -1);

		expect(parseSse(unfinished)).toEqual({ events: [], rest: unfinished });
	});
});
