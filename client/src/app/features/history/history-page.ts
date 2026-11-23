import { CurrencyPipe, DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
	AbstractControl,
	FormControl,
	FormGroup,
	ReactiveFormsModule,
	ValidationErrors,
} from "@angular/forms";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatTableModule } from "@angular/material/table";
import { RouterLink } from "@angular/router";
import { catchError, defer, of, startWith, Subject, switchMap } from "rxjs";
import { HistoryApi, HistoryItem, HistoryQuery } from "../../core/history-api";
import { Supplier, SuppliersApi } from "../../core/suppliers-api";

@Component({
	selector: "app-history-page",
	imports: [
		CurrencyPipe,
		DatePipe,
		MatDatepickerModule,
		MatFormFieldModule,
		MatInputModule,
		MatSelectModule,
		MatTableModule,
		ReactiveFormsModule,
		RouterLink,
	],
	templateUrl: "./history-page.html",
	styleUrl: "./history-page.scss",
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryPage {
	private readonly historyApi = inject(HistoryApi);

	protected readonly columns = ["date", "route", "supplier", "price", "responseTime"];
	protected readonly suppliers = signal<Supplier[]>([]);
	protected readonly suppliersFailed = signal(false);
	protected readonly items = signal<HistoryItem[]>([]);
	protected readonly historyFailed = signal(false);
	protected readonly wrongDateOrder = signal(false);

	protected readonly form = new FormGroup(
		{
			startDate: new FormControl<Date | null>(null),
			endDate: new FormControl<Date | null>(null),
			supplierIds: new FormControl<string[]>([], { nonNullable: true }),
		},
		startNotAfterEnd,
	);
	private readonly filterChanges = new Subject<void>();

	constructor() {
		inject(SuppliersApi)
			.getSuppliers()
			.pipe(takeUntilDestroyed())
			.subscribe({
				next: (suppliers) => this.suppliers.set(suppliers),
				error: () => this.suppliersFailed.set(true),
			});

		this.filterChanges
			.pipe(
				startWith(undefined),
				switchMap(() =>
					// Caught here, not on the outer stream: that would end it and later filters would do nothing.
					// defer, so an error thrown by query() is caught too.
					defer(() => this.historyApi.getHistory(this.query())).pipe(catchError(() => of(null))),
				),
				takeUntilDestroyed(),
			)
			.subscribe((result) => {
				this.items.set(result?.items ?? []);
				this.historyFailed.set(result === null);
			});
	}

	// Called by the template, not by valueChanges: that fires on every keystroke in a date field.
	protected applyFilters(): void {
		this.wrongDateOrder.set(this.form.hasError("dateOrder"));
		if (this.form.valid) {
			this.filterChanges.next();
		}
	}

	private query(): HistoryQuery {
		const { startDate, endDate, supplierIds } = this.form.getRawValue();
		return {
			startDate: startDate ? localMidnight(startDate).toISOString() : undefined,
			endDate: endDate ? localMidnight(endDate, 1).toISOString() : undefined,
			supplierIds,
			sortBy: "date",
			sortDir: "desc",
			page: 1,
			pageSize: 20,
		};
	}
}

function localMidnight(date: Date, addDays = 0): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + addDays);
}

function startNotAfterEnd(control: AbstractControl): ValidationErrors | null {
	const { startDate, endDate } = control.value;
	return startDate && endDate && localMidnight(startDate) > localMidnight(endDate)
		? { dateOrder: true }
		: null;
}
