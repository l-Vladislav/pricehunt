import { ApplicationConfig, provideBrowserGlobalErrorListeners } from "@angular/core";
import { provideNativeDateAdapter } from "@angular/material/core";
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from "@angular/material/form-field";
import { provideRouter } from "@angular/router";
import { routes } from "./app.routes";

export const appConfig: ApplicationConfig = {
	providers: [
		provideBrowserGlobalErrorListeners(),
		provideRouter(routes),
		provideNativeDateAdapter(),
		// The filled field hides its label at the density of the theme.
		{ provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: "outline" } },
	],
};
