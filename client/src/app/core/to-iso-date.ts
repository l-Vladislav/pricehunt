import { formatDate } from "@angular/common";

// Not toISOString(): UTC can be a different calendar day. formatDate uses the local time zone.
export function toIsoDate(date: Date): string {
	return formatDate(date, "yyyy-MM-dd", "en-US");
}
