import { CurrencyPipe, DecimalPipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed, toObservable, toSignal } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import { RouterLink } from "@angular/router";
import { interval, map, of, startWith, switchMap } from "rxjs";
import { Supplier, SuppliersApi } from "../../core/suppliers-api";
import { toIsoDate } from "../../core/to-iso-date";
import { AnimateMove } from "./animate-move";
import { SearchStore } from "./search-store";

const tickMs = 100;

@Component({
	selector: "app-search-page",
	imports: [
		AnimateMove,
		CurrencyPipe,
		DecimalPipe,
		MatButtonModule,
		MatDatepickerModule,
		MatFormFieldModule,
		MatInputModule,
		MatProgressBarModule,
		MatSelectModule,
		ReactiveFormsModule,
		RouterLink,
	],
	providers: [SearchStore],
	templateUrl: "./search-page.html",
	styleUrl: "./search-page.scss",
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPage {
	protected readonly store = inject(SearchStore);

	protected readonly suppliers = signal<Supplier[]>([]);
	protected readonly suppliersFailed = signal(false);

	protected readonly form = new FormGroup({
		fromLocation: new FormControl("", { nonNullable: true, validators: Validators.required }),
		toLocation: new FormControl("", { nonNullable: true, validators: Validators.required }),
		fromDate: new FormControl<Date | null>(null, Validators.required),
		toDate: new FormControl<Date | null>(null, Validators.required),
		// The API treats an empty list as "all", so at least one supplier must stay selected.
		supplierIds: new FormControl<string[]>([], {
			nonNullable: true,
			validators: Validators.required,
		}),
	});
	private readonly formStatus = toSignal(this.form.statusChanges, {
		initialValue: this.form.status,
	});
	protected readonly canSearch = computed(() => this.formStatus() === "VALID");

	private readonly supplierNames = computed(
		() => new Map(this.store.suppliers().map(({ id, name }) => [id, name])),
	);

	protected readonly skeletonRows = computed(() => {
		const length = this.store.pending();
		return this.store.status() === "running" ? Array.from({ length }) : [];
	});

	// The total is known once "started" arrives.
	protected readonly showProgress = computed(
		() => this.store.total() > 0 && this.store.status() !== "error",
	);
	protected readonly progressPercent = computed(
		() => (this.store.responded() / this.store.total()) * 100,
	);
	protected readonly finalState = computed(() => {
		switch (this.store.status()) {
			case "completed":
				return "Completed";
			case "timedOut":
				return "Timed out";
			default:
				return null;
		}
	});

	// The id, not the status: a search that replaces a running one must restart the timer.
	private readonly runningSearchId = computed(() =>
		this.store.status() === "running" ? this.store.searchId() : null,
	);
	protected readonly elapsedSeconds = toSignal(
		toObservable(this.runningSearchId).pipe(
			switchMap((searchId) => (searchId === null ? of(0) : secondsFromNow())),
		),
		{ initialValue: 0 },
	);

	constructor() {
		inject(SuppliersApi)
			.getSuppliers()
			.pipe(takeUntilDestroyed())
			.subscribe({
				next: (suppliers) => this.showSuppliers(suppliers),
				error: () => this.suppliersFailed.set(true),
			});
	}

	protected supplierName(supplierId: string): string | undefined {
		return this.supplierNames().get(supplierId);
	}

	protected search(): void {
		const { fromLocation, toLocation, fromDate, toDate, supplierIds } = this.form.getRawValue();
		if (!fromDate || !toDate) {
			return;
		}
		this.store.search({
			fromLocation,
			toLocation,
			fromDate: toIsoDate(fromDate),
			toDate: toIsoDate(toDate),
			supplierIds,
		});
	}

	private showSuppliers(suppliers: Supplier[]): void {
		this.suppliers.set(suppliers);
		this.form.controls.supplierIds.setValue(suppliers.map(({ id }) => id));
	}
}

// Reads the clock instead of counting ticks: a background tab delays them.
function secondsFromNow() {
	const startedAt = performance.now();
	return interval(tickMs).pipe(
		map(() => (performance.now() - startedAt) / 1000),
		startWith(0),
	);
}
