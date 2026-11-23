import { EnvironmentProviders, Provider } from "@angular/core";
import { MATERIAL_ANIMATIONS, provideNativeDateAdapter } from "@angular/material/core";

const testProviders: (Provider | EnvironmentProviders)[] = [
	provideNativeDateAdapter(),
	{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
];

export default testProviders;
