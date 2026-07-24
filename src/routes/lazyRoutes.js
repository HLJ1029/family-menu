import { lazy } from "react";

function lazyNamed(importer, exportName) {
  return lazy(() => importer().then((module) => ({ default: module[exportName] })));
}

export const lazyRoutes = {
  stats: lazyNamed(() => import("../components/StatsPage.jsx"), "StatsPage"),
  familyActivity: lazyNamed(() => import("../components/FamilyActivityPage.jsx"), "FamilyActivityPage"),
  householdSettings: lazyNamed(() => import("../components/HouseholdSettingsPage.jsx"), "HouseholdSettingsPage"),
  recipeDetail: lazyNamed(() => import("../components/RecipeDetailDrawer.jsx"), "RecipeDetailDrawer"),
};
