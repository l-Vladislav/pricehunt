# T07b: Angular Material setup
**Reqs:** none directly (enables SC1, HC1, HC2) · ADR-0002

## Goal
Add Angular Material with a theme, ready for T08b and T10b. No feature code.

## Design
- `npx ng add @angular/material` (same major version as Angular) with the default azure palette. The schematic writes it as `mat.theme()` in `styles.scss`.
  Edited by hand: no web fonts (Roboto falls back to Arial, and no component we use needs the icon font), `color-scheme` on `html`, no `height: 100%`.
  Review what the schematic changed and keep only what is needed.
- The app stays zoneless. Recent Material versions don't need `@angular/animations`: if the schematic adds `provideAnimationsAsync()`
  or that package, remove them unless the build needs them.
- Set `<title>` in `src/index.html` to `PriceHunt` (the scaffold says `Client`).
- `provideNativeDateAdapter()` in `app.config.ts` and in the test providers file below (TestBed never loads `app.config.ts`).
  Without a `DateAdapter`, every datepicker throws.
- A `toIsoDate(date)` helper in `core/` turns a picked date into `yyyy-MM-dd` from its local year, month and day.
  `JSON.stringify(date)` would send UTC time instead, which shifts the day in UTC+ zones and fails `DateOnly` binding (400).
- Component tests turn off Material animations by providing `MATERIAL_ANIMATIONS` with `{ animationsDisabled: true }` once,
  in a test providers file set through the unit-test builder's `providersFile` option in `angular.json` (check the token and the
  option against the installed versions). jsdom never fires `animationend`, so overlay harnesses (select, datepicker)
  could otherwise wait. Write the rule in `AGENTS.md` "Testing rules".

## Acceptance criteria
- `npx ng test --watch=false`, `npx ng build`, `npx ng lint`, `npx prettier --check .` are green.
- `npm start` shows the app with the Material theme applied.

## Tests (Vitest)
- `toIsoDate` returns the local calendar day for `new Date(2026, 10, 23, 0, 30)` and `new Date(2026, 10, 23, 23, 30)`: both give
  `"2026-11-23"`. In any non-UTC time zone one of the two catches an implementation based on `toISOString()`. CI runs in
  `Asia/Jerusalem` since T04.
- `toIsoDate` keeps the local year and month for `new Date(2026, 0, 1, 0, 30)` and `new Date(2026, 11, 31, 23, 30)`.
- `toIsoDate` pads the year, the month and the day (a datepicker accepts a typed year like 202).

`ng build` proves the theme compiles. The first runtime check of Material components is T08b's harness tests.
No test covers the adapter in `app.config.ts`, because the test providers supply their own: check it by opening a datepicker under `npm start` (T08b does too).
