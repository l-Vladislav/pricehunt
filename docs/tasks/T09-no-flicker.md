# T09: Smooth re-ordering
**Reqs:** SC4

## Goal
Rows that move animate to their new position instead of jumping. A new row takes the place of a skeleton row, so it needs no
entering animation.

## Design
- FLIP via a small directive on the rows T08b renders with `track r.supplierId`: measure `getBoundingClientRect()` before and after the update, then animate `transform` with the Web Animations API.
- Result rows and skeleton rows (T08b) have the same fixed height. A result replaces a skeleton row, so the list keeps its
  height. A failed supplier only removes one skeleton row from the bottom, so nothing above it moves.
- The directive takes the row's `$index` and runs after a render in which it changed. It keeps the row's last top relative to the list,
  so scrolling the page doesn't count as a move. A row that moves again during its animation continues from where it is shown.
- Result rows have an opaque background, so the text of rows that cross doesn't mix.
- The directive skips the animation when the position didn't change, `Element.animate` is missing or `prefers-reduced-motion` is set.
  jsdom has no `animate` and returns zero-size rects, so the T08b component tests keep passing.

## Verification
- SC4 (manual): run a search and watch it. State in the PR how it was checked.
- SC4 (unit): stub `Element.prototype.animate`, and stub `getBoundingClientRect` to return `top = index among sibling rows × row height`.
  A re-order calls `animate` on each moved row with a `translateY` equal to its old top minus its new top; a row that didn't move
  gets no call.
- SC4 (unit): each row slides by its own distance when several events arrive in one render.
- SC4 (unit): a row that moves again during its animation starts from its shown position, and the old animation is cancelled.
- SC4 (unit): an event that moves no row leaves a running animation alone.
- SC4 (unit): the list moving on screen (scrolling) between events does not change the offsets.
- SC4 (unit): no `animate` call when a row's measured position is unchanged or under `prefers-reduced-motion`.
- SC4 (unit): without `Element.animate` the rows still re-order and no error is reported.
