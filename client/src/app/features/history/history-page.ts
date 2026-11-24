import { CurrencyPipe, DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { takeUntilDestroyed, toObservable } from "@angular/core/rxjs-interop";
import {
	AbstractControl,
	FormControl,
	FormGroup,
	ReactiveFormsModule,
	ValidationErrors,
	Validators,
} from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
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
		MatButtonModule,
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

	private supplierIdsOnOpen: string[] = [];

	constructor() {
		inject(SuppliersApi)
			.getSuppliers()
			.pipe(takeUntilDestroyed())
			.subscribe({
				next: (suppliers) => this.showSuppliers(suppliers),
				error: () => this.suppliersFailed.set(true),
			});

		toObservable(this.view)
			.pipe(
				tap(() => this.loading.set(true)),
				switchMap((view) =>
					// Caught here, not on the outer stream: that would end it and later changes would do nothing.
					defer(() => this.historyApi.getHistory(this.query(view))).pipe(
						catchError(() => of(null)),
					),
				),
				takeUntilDestroyed(),
			)
			.subscribe((result) => {
				this.historyFailed.set(result === null);
				if (result) {
					this.total.set(result.total);
					// The total on screen was out of date, e.g. Next was clicked before a filter's response.
					// Still loading: the rows stay until the last page arrives.
					if (result.total > 0 && result.items.length === 0) {
						this.showPage(Math.ceil(result.total / this.pageSize) - 1);
						return;
					}
				}
				this.items.set(result?.items ?? []);
				this.loading.set(false);
			});
	}

	// Called by the template, not by valueChanges: that fires on every keystroke in a date field.
	protected applyFilters(): void {
		this.wrongDateOrder.set(this.form.hasError("dateOrder"));
		if (this.form.valid) {
			this.view.update((view) => ({ ...view, filters: this.form.getRawValue(), pageIndex: 0 }));
		}
	}

	protected suppliersOpened(): void {
		this.supplierIdsOnOpen = this.form.controls.supplierIds.value;
	}

	// Not per option: choosing one of many suppliers would send a request for each one deselected.
	protected suppliersClosed(): void {
		if (this.form.controls.supplierIds.value.join() !== this.supplierIdsOnOpen.join()) {
			this.applyFilters();
		}
	}

	protected resetFilters(): void {
		this.selectAllSuppliers();
		this.applyFilters();
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

	private showSuppliers(suppliers: Supplier[]): void {
		this.suppliers.set(suppliers);
		// Not required from the start: the date filters must work if the suppliers fail to load.
		this.form.controls.supplierIds.addValidators(Validators.required);
		this.selectAllSuppliers();
	}

	private selectAllSuppliers(): void {
		this.form.controls.supplierIds.setValue(this.suppliers().map(({ id }) => id));
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
