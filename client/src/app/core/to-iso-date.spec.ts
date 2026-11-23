import { toIsoDate } from "./to-iso-date";

describe("toIsoDate", () => {
	// In any non-UTC zone toISOString() gets one of the two wrong.
	it.each([
		["just after midnight", new Date(2026, 10, 23, 0, 30)],
		["just before midnight", new Date(2026, 10, 23, 23, 30)],
	])("SC1: returns the local calendar day %s", (_, date) => {
		expect(toIsoDate(date)).toBe("2026-11-23");
	});

	// A UTC year or month gives the previous year east of UTC, and the next one west of it.
	it.each([
		["first", new Date(2026, 0, 1, 0, 30), "2026-01-01"],
		["last", new Date(2026, 11, 31, 23, 30), "2026-12-31"],
	])("SC1: keeps the local year and month on the %s day of the year", (_, date, expected) => {
		expect(toIsoDate(date)).toBe(expected);
	});

	it("SC1: pads the year, the month and the day", () => {
		expect(toIsoDate(new Date(202, 0, 5))).toBe("0202-01-05");
	});
});
