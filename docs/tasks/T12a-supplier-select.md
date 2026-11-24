# T12a: Supplier multi-select on the search page
**Reqs:** SC1

## Goal
Pick suppliers on the search page with the same multi-select as in the history filters (T10a), instead of a checkbox per supplier.

## Design
- One `mat-select multiple` labelled "Suppliers". Every supplier is selected once `SuppliersApi` answers.
- `Validators.required` keeps at least one supplier selected. The API treats an empty list as "all", which is not what the user chose.
- The request always lists the selected ids, also when all are selected.
- If the supplier list fails to load, "Server not reachable" is shown below the fields and Search stays disabled.
- The select takes a full row, so most of the selected names fit.

## Tests (Vitest, TestBed, `MatSelectHarness`)
- SC1: the select is multiple and lists every supplier, all selected.
- SC1: deselecting every supplier disables Search. Selecting one enables it again.
- SC1: deselecting one supplier sends the ids of the others.
- SC1: the default selection sends the ids of every supplier.
- SC1: the supplier list request fails → "Server not reachable", nothing selected, Search disabled.

Manual check with `npm start`: the select takes a full row, most of the selected names are readable, and the list opens.
