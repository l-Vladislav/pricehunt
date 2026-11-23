# T09: Smooth re-ordering
**Reqs:** SC4

## Goal
New results slide into place. Existing rows animate to their new position instead of jumping.

## Design
- FLIP via a small directive on the rows T08b renders with `track r.supplierId`: measure `getBoundingClientRect()` before and after the update, then animate `transform` with the Web Animations API.
- Result rows and skeleton rows (T08b) have the same fixed height. A result replaces a skeleton row, so the list keeps its
  height. A failed supplier only removes one skeleton row from the bottom, so nothing above it moves.
- The directive skips the animation when the position didn't change or `Element.animate` is missing. jsdom has no `animate` and
  returns zero-size rects, so the T08b component tests keep passing.

## Verification
- Manual: run a search and watch it. State in the PR how it was checked.
- Unit: with `Element.prototype.animate` and `getBoundingClientRect` stubbed, a re-order calls `animate` on the moved row with
  a `translateY` equal to its old top minus its new top; a row that didn't move gets no call.
