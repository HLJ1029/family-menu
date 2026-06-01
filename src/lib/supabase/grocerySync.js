import { getSupabase } from "./client";

const MANUAL_SOURCE = "manual";
const CHECKED_SOURCE = "checked";
const EXCLUDED_SOURCE = "excluded";

export async function loadGrocerySync(familyId) {
  const supabase = await getSupabase();
  const [{ data: shoppingRows, error: shoppingError }, { data: pantryRows, error: pantryError }] =
    await Promise.all([
      supabase
        .from("shopping_items")
        .select("id, name, amount, source, checked")
        .eq("family_id", familyId),
      supabase
        .from("pantry_items")
        .select("id, name, amount")
        .eq("family_id", familyId),
    ]);

  if (shoppingError) throw shoppingError;
  if (pantryError) throw pantryError;

  return {
    customItems: rowsToCustomItems(shoppingRows ?? []),
    checkedItems: rowsToCheckedItems(shoppingRows ?? []),
    excludedGroceryKeys: rowsToExcludedKeys(shoppingRows ?? []),
    pantryItems: rowsToPantryItems(pantryRows ?? []),
  };
}

export async function saveGrocerySync({
  familyId,
  customItems,
  checkedItems,
  excludedGroceryKeys,
  pantryItems,
}) {
  const supabase = await getSupabase();
  await Promise.all([
    replacePantryItems({ supabase, familyId, pantryItems }),
    replaceShoppingItems({
      supabase,
      familyId,
      customItems,
      checkedItems,
      excludedGroceryKeys,
    }),
  ]);
}

export async function migrateLocalGroceryToCloud(groceryState) {
  await saveGrocerySync(groceryState);
}

async function replacePantryItems({ supabase, familyId, pantryItems }) {
  const { error: deleteError } = await supabase
    .from("pantry_items")
    .delete()
    .eq("family_id", familyId);

  if (deleteError) throw deleteError;

  const rows = pantryItems.map((item) => ({
    family_id: familyId,
    name: item.name,
    amount: item.amount ?? null,
  }));

  if (rows.length === 0) return;
  const { error: insertError } = await supabase.from("pantry_items").insert(rows);
  if (insertError) throw insertError;
}

async function replaceShoppingItems({
  supabase,
  familyId,
  customItems,
  checkedItems,
  excludedGroceryKeys,
}) {
  const { error: deleteError } = await supabase
    .from("shopping_items")
    .delete()
    .eq("family_id", familyId);

  if (deleteError) throw deleteError;

  const rows = [
    ...customItems.map((item) => ({
      family_id: familyId,
      name: item.name,
      amount: item.amount ?? "自定义",
      source: MANUAL_SOURCE,
      checked: false,
    })),
    ...Object.entries(checkedItems)
      .filter(([, checked]) => Boolean(checked))
      .map(([key]) => ({
        family_id: familyId,
        name: key,
        source: CHECKED_SOURCE,
        checked: true,
      })),
    ...excludedGroceryKeys.map((key) => ({
      family_id: familyId,
      name: key,
      source: EXCLUDED_SOURCE,
      checked: false,
    })),
  ];

  if (rows.length === 0) return;
  const { error: insertError } = await supabase.from("shopping_items").insert(rows);
  if (insertError) throw insertError;
}

function rowsToCustomItems(rows) {
  return rows
    .filter((row) => row.source === MANUAL_SOURCE)
    .map((row) => ({
      key: `cloud:${row.id}`,
      name: row.name,
      amount: row.amount ?? "自定义",
      source: "手动添加",
    }));
}

function rowsToCheckedItems(rows) {
  return rows
    .filter((row) => row.source === CHECKED_SOURCE && row.checked)
    .reduce((items, row) => ({ ...items, [row.name]: true }), {});
}

function rowsToExcludedKeys(rows) {
  return rows
    .filter((row) => row.source === EXCLUDED_SOURCE)
    .map((row) => row.name);
}

function rowsToPantryItems(rows) {
  return rows.map((row) => ({
    key: `cloud:${row.id}`,
    name: row.name,
    amount: row.amount ?? undefined,
  }));
}
