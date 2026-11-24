import { CurrencyPipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { RouterLink } from "@angular/router";
import { Supplier, SuppliersApi } from "../../core/suppliers-api";
import { toIsoDate } from "../../core/to-iso-date";
import { AnimateMove } from "./animate-move";
import { SearchStore } from "./search-store";

@Component({
	selector: "app-search-page",
	imports: [
		AnimateMove,
		CurrencyPipe,
		MatButtonModule,
		MatDatepickerModule,
		MatFormFieldModule,
		MatInputModule,
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

	protected readonly progress = computed(() => {
		const total = this.store.total();
		const text = `${this.store.responded()} of ${total} suppliers responded`;
		switch (this.store.status()) {
			case "running":
				// The total is known once "started" arrives.
				return total > 0 ? text : null;
			case "completed":
				return `Completed: ${text}`;
			case "timedOut":
				return `Timed out: ${text}`;
			default:
				return null;
		}
	});

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
