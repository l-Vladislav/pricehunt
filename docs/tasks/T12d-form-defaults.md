# T12d: Form defaults and the Clear button
**Reqs:** SC1, HC1

## Goal
Both forms start with every supplier selected, and a "Clear" button returns a form to its defaults.
The history applies a supplier selection once, when the list closes.
SC1 asks for the supplier default on the search page only. The default on the history page and both Clear buttons are the owner's choice.
The server doesn't change.

## Design
- History: every supplier is selected once `SuppliersApi` answers. This sends no request: the rows of the first one (T10a, without
  filters) already are of all suppliers. From then on a filter change sends the selected ids, also when all are selected.
- History: at least one supplier must stay selected, as on the search page (T12a). Deselecting all makes the form invalid, so nothing
  is sent by filter changes and the rows stay. The field shows "Select at least one supplier". Sorting and paging use the last
  valid filters (T10b). The rule applies only once the suppliers are loaded, so the dates work without them.
- History: the suppliers apply when the list closes, and only if the selection changed since it opened. With all selected by default,
  choosing one would otherwise send a request for each supplier deselected. The filtering stays on the server: the page has only 20 rows.
- Both pages: the closed select shows "All (7)" when every supplier is selected, otherwise the names.
- Both pages: "Clear" empties the fields and selects every supplier. It is always enabled: text that can't be parsed leaves a date's
  form value empty, and a button that disables itself loses the focus.
- It is a native `type="reset"` button. `FormGroupDirective` resets the form on the `reset` event, before the page's own handler.
  `form.reset()` alone would leave text that can't be parsed in the field: the datepicker rewrites it only if the value changes,
  and that one is already `null`.
- Clear on the history page applies at once, like any filter change: one request, for page 1, which cancels one still running (T10a).
  The sort stays. The "Start date is after end date" message goes away.
- Clear on the search page changes only the form. A running search goes on and the results stay.

## Tests (Vitest, TestBed, `MatButtonHarness`, `MatSelectHarness`)
- HC1: the history select has every supplier selected, and loading the suppliers sends no request.
- HC1: deselecting every supplier sends nothing, shows the message and keeps the rows, a sort sends the last valid suppliers. Selecting one applies.
- HC1: several options changed send one request, when the list closes. Closing it with the same selection sends none, replacing one supplier by
  another sends one.
- HC1: the dates and Clear work when the suppliers fail to load.
- SC1, HC1: the select shows "All (N)" when every supplier is selected, otherwise the names.
- HC1: Clear on page 3 with both dates, fewer suppliers and a sort restores the defaults and sends one request: page 1, no dates,
  every supplier, the same sort.
- HC1: Clear removes date text that can't be parsed. The next filter change applies.
- HC1: Clear removes the date order message and sends one request.
- HC1: Clear cancels the request before it.
- SC1: Clear restores the defaults on the search page, also after text that can't be parsed and with no supplier selected. Search is
  disabled and no field shows an error, also after a submitted search.
- SC1: Clear doesn't cancel a running search or remove its results.
- SC1, HC1: the button stays enabled after a click.

Manual check with `npm start`: both buttons and selects, also in a narrow window.
