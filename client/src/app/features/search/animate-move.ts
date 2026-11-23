import { MediaMatcher } from "@angular/cdk/layout";
import { Directive, ElementRef, afterRenderEffect, inject, input } from "@angular/core";

/** Slides a list row from its old position to the new one when its index changes (FLIP). */
@Directive({ selector: "[appAnimateMove]" })
export class AnimateMove {
	readonly index = input.required<number>({ alias: "appAnimateMove" });

	private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
	private readonly mediaMatcher = inject(MediaMatcher);
	private top: number | undefined;
	private animation: Animation | undefined;

	constructor() {
		afterRenderEffect(() => {
			this.index();
			this.move();
		});
	}

	private move(): void {
		const oldTop = this.top;
		// A running animation shifts the row, so the next one has to start from that shift.
		const shownTop = this.measureTop();
		this.animation?.cancel();
		this.top = this.measureTop();
		if (oldTop === undefined) {
			return;
		}

		const offset = oldTop - this.top + (shownTop - this.top);
		if (offset === 0 || !this.element.animate || this.prefersReducedMotion()) {
			return;
		}
		this.animation = this.element.animate(
			[{ transform: `translateY(${offset}px)` }, { transform: "none" }],
			{ duration: 250, easing: "ease-out" },
		);
	}

	// Relative to the list, so scrolling the page between two events doesn't look like a move.
	private measureTop(): number {
		const listTop = this.element.parentElement?.getBoundingClientRect().top ?? 0;
		return this.element.getBoundingClientRect().top - listTop;
	}

	private prefersReducedMotion(): boolean {
		return this.mediaMatcher.matchMedia("(prefers-reduced-motion: reduce)").matches;
	}
}
