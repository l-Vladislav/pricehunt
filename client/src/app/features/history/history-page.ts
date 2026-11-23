import { CurrencyPipe, DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { takeUntilDestroyed, toObservable } from "@angular/core/rxjs-interop";
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
import { MatPaginatorModule } from "@angular/material/paginator";
import { MatSelectModule } from "@angular/material/select";
import { MatSortModule, Sort } from "@angular/material/sort";
import { MatTableModule } from "@angular/material/table";
import { RouterLink } from "@angular/router";
import { catchError, defer, of, switchMap, tap } from "rxjs";
import { HistoryApi, HistoryItem, HistoryQuery } from "../../core/history-api";
import { Supplier, SuppliersApi } from "../../core/suppliers-api";

interface HistoryView {
	filters: { startDate: Date | null; endDate: Date | null; supplierIds: string[] };
	sortBy: HistoryQuery["sortBy"];
	sortDir: HistoryQuery["sortDir"];
	pageIndex: number;
}

@Component({
	selector: "app-history-page",
	imports: [
		CurrencyPipe,
		DatePipe,
		MatDatepickerModule,
		MatFormFieldModule,
		MatInputModule,
		MatPaginatorModule,
		MatSelectModule,
		MatSortModule,
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
	protected readonly pageSize = 20;
	protected readonly skeletonRows = new Array<undefined>(this.pageSize);
	protected readonly suppliers = signal<Supplier[]>([]);
	protected readonly suppliersFailed = signal(false);
	protected readonly items = signal<HistoryItem[]>([]);
	protected readonly total = signal(0);
	protected readonly loading = signal(true);
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
	// Keeps the last valid filters, so sorting and paging work while the form is invalid.
	protected readonly view = signal<HistoryView>({
		filters: this.form.getRawValue(),
		sortBy: "date",
		sortDir: "desc",
		pageIndex: 0,
	});

	constructor() {
		inject(SuppliersApi)
			.getSuppliers()
			.pipe(takeUntilDestroyed())
			.subscribe({
				next: (suppliers) => this.suppliers.set(suppliers),
				error: () => this.suppliersFailed.set(true),
			});

		toObservable(this.view)
			.pipe(
				tap(() => {
					this.loading.set(true);
					this.items.set([]);
				}),
				switchMap((view) =>
					// Caught here, not on the outer stream: that would end it and later changes would do nothing.
					defer(() => this.historyApi.getHistory(this.query(view))).pipe(
						catchError(() => of(null)),
					),
				),
				takeUntilDestroyed(),
			)
			.subscribe((result) => {
				if (result) {
					this.items.set(result.items);
					this.total.set(result.total);
					// The total on screen was out of date, e.g. Next was clicked before a filter's response.
					if (result.total > 0 && result.items.length === 0) {
						this.showPage(Math.ceil(result.total / this.pageSize) - 1);
					}
				}
				this.loading.set(false);
				this.historyFailed.set(result === null);
			});
	}

	// Called by the template, not by valueChanges: that fires on every keystroke in a date field.
	protected applyFilters(): void {
		this.wrongDateOrder.set(this.form.hasError("dateOrder"));
		if (this.form.valid) {
			this.view.update((view) => ({ ...view, filters: this.form.getRawValue(), pageIndex: 0 }));
		}
	}

	protected sort({ active, direction }: Sort): void {
		this.view.update((view) => ({
			...view,
			sortBy: active as HistoryQuery["sortBy"],
			sortDir: direction as HistoryQuery["sortDir"],
			pageIndex: 0,
		}));
	}

	protected showPage(pageIndex: number): void {
		this.view.update((view) => ({ ...view, pageIndex }));
	}

	private query({ filters, sortBy, sortDir, pageIndex }: HistoryView): HistoryQuery {
		const { startDate, endDate, supplierIds } = filters;
		return {
			startDate: startDate ? localMidnight(startDate).toISOString() : undefined,
			endDate: endDate ? localMidnight(endDate, 1).toISOString() : undefined,
			supplierIds,
			sortBy,
			sortDir,
			page: pageIndex + 1,
			pageSize: this.pageSize,
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
