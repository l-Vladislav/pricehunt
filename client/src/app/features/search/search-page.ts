import { CurrencyPipe, DecimalPipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed, toObservable, toSignal } from "@angular/core/rxjs-interop";
import {
	AbstractControl,
	FormControl,
	FormGroup,
	ReactiveFormsModule,
	ValidationErrors,
	Validators,
} from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { DateAdapter } from "@angular/material/core";
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

// Words of letters, or letters with digits, and the punctuation of place names. At least one letter.
const locationPattern = /^(?=.*\p{L})[\p{L}\p{M}\p{N}\s.,'’-]+$/u;

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

	private readonly dateAdapter = inject<DateAdapter<Date>>(DateAdapter);
	protected readonly today = this.dateAdapter.today();
	protected readonly tomorrow = this.dateAdapter.addCalendarDays(this.today, 1);

	protected readonly form = new FormGroup(
		{
			fromLocation: locationControl(),
			toLocation: locationControl(),
			fromDate: new FormControl<Date | null>(null, Validators.required),
			toDate: new FormControl<Date | null>(null, Validators.required),
			// The API treats an empty list as "all", so at least one supplier must stay selected.
			supplierIds: new FormControl<string[]>([], {
				nonNullable: true,
				validators: Validators.required,
			}),
		},
		differentLocations,
	);
	private readonly formStatus = toSignal(this.form.statusChanges, {
		initialValue: this.form.status,
	});
	protected readonly canSearch = computed(() => this.formStatus() === "VALID");

	protected readonly sameLocations = toSignal(
		this.form.valueChanges.pipe(map(() => this.form.hasError("sameLocations"))),
		{ initialValue: false },
	);

	private readonly supplierNames = computed(
		() => new Map(this.store.suppliers().map(({ id, name }) => [id, name])),
	);

	protected readonly skeletonRows = computed(() => {
		const length = this.store.pending();
		return this.store.status() === "running" ? Array.from({ length }) : [];
	});

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

	protected selectAllSuppliers(): void {
		this.form.controls.supplierIds.setValue(this.suppliers().map(({ id }) => id));
	}

	private showSuppliers(suppliers: Supplier[]): void {
		this.suppliers.set(suppliers);
		this.selectAllSuppliers();
	}
}

function locationControl() {
	return new FormControl("", {
		nonNullable: true,
		validators: [Validators.required, Validators.pattern(locationPattern)],
	});
}

function differentLocations(form: AbstractControl): ValidationErrors | null {
	const [from, to] = ["fromLocation", "toLocation"].map((name) =>
		form.get(name)?.value.trim().toLowerCase(),
	);
	return from && from === to ? { sameLocations: true } : null;
}

// Reads the clock instead of counting ticks: a background tab delays them.
function secondsFromNow() {
	const startedAt = performance.now();
	return interval(tickMs).pipe(
		map(() => (performance.now() - startedAt) / 1000),
		startWith(0),
	);
}
