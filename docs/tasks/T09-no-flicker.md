# T09: Smooth re-ordering
**Reqs:** SC4

## Goal
New results slide into place. Existing rows animate to their new position instead of jumping.

## Design
- `@for (r of results(); track r.supplierId)` so DOM nodes are reused, never recreated.
- FLIP via a small directive: measure `getBoundingClientRect()` before and after the update, then animate `transform` with the Web Animations API.
- Rows have a fixed height. The list container reserves space for M rows, so the layout below doesn't jump.
- The directive skips the animation when the position didn't change or `Element.animate` is missing. jsdom has no `animate` and
  returns zero-size rects, so the T08 component tests keep passing.

## Verification
- Manual: run a search and watch it. State in the PR how it was checked.
- Unit: DOM node identity is preserved after a re-order (track by id works).
