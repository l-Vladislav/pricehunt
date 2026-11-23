import { Routes } from "@angular/router";

export const routes: Routes = [
	{
		path: "",
		loadComponent: () => import("./features/search/search-page").then((m) => m.SearchPage),
	},
	{
		path: "history",
		loadComponent: () => import("./features/history/history-page").then((m) => m.HistoryPage),
	},
];
