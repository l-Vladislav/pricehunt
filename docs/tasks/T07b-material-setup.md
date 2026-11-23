# T07b: Angular Material setup
**Reqs:** none directly (enables SC1, HC1, HC2) · ADR-0002

## Goal
Add Angular Material with a theme, ready for T08b and T10b. No feature code.

## Design
- `npx ng add @angular/material` (same major version as Angular) with a prebuilt theme.
  Review what the schematic changed and keep only what is needed.
- The app stays zoneless. Recent Material versions don't need `@angular/animations`: if the schematic adds `provideAnimationsAsync()`
  or that package, remove them unless the build needs them.
- `provideNativeDateAdapter()` in `app.config.ts`. Without a `DateAdapter`, every datepicker throws at runtime and in tests.
- A `toIsoDate(date)` helper in `core/` turns a picked date into `yyyy-MM-dd` from its local year, month and day.
  `JSON.stringify(date)` would send UTC time instead, which shifts the day in UTC+ zones and fails `DateOnly` binding (400).
- Decide how component tests turn off Material animations (the `MATERIAL_ANIMATIONS` token with `animationsDisabled: true` in
  recent versions; check it for the installed version) and write it in `AGENTS.md` "Testing rules". jsdom never fires
  `animationend`, so overlay harnesses (select, datepicker) could otherwise wait.

## Acceptance criteria
- `npx ng test --watch=false`, `npx ng build`, `npx ng lint`, `npx prettier --check .` are green.
- `npm start` shows the app with the Material theme applied.

## Tests (Vitest)
- `toIsoDate` returns the local calendar day for `new Date(2026, 10, 23, 0, 30)` and `new Date(2026, 10, 23, 23, 30)`: both give
  `"2026-11-23"`. In any non-UTC time zone one of the two catches an implementation based on `toISOString()`.
`ng build` proves the theme compiles. The first runtime check of Material components is T08b's harness tests.
