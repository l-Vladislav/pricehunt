import { Routes } from "@angular/router";

export const routes: Routes = [
	{
		path: "",
		loadComponent: () => import("./features/search/search-page").then((m) => m.SearchPage),
	},
];
