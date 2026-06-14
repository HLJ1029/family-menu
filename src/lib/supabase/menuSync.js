import { getSupabase } from "./client";
import { getWeekKey } from "../date";

const TODAY_SLOT = "today";
const WEEK_PREFIX = "week:";

export async function loadMenuSync(familyId) {
  const supabase = await getSupabase();
  const currentWeekKey = getWeekKey();
  const { data, error } = await supabase
    .from("meal_plans")
    .select("meal_slot, recipe_id, quantity")
    .eq("family_id", familyId)
    .eq("plan_date", currentWeekKey)
    .in("meal_slot", [TODAY_SLOT, ...weekSlots()]);

  if (error) throw error;
  return {
    todayMenu: rowsToTodayMenu(data ?? []),
    weekPlan: rowsToWeekPlan(data ?? []),
  };
}

export async function saveTodayMenu(familyId, todayMenu) {
  const supabase = await getSupabase();
  const currentWeekKey = getWeekKey();
  await replaceSlotRows({
    supabase,
    familyId,
    planDate: currentWeekKey,
    slots: [TODAY_SLOT],
    rows: todayMenu.map((item) => ({
      family_id: familyId,
      plan_date: currentWeekKey,
      meal_slot: TODAY_SLOT,
      recipe_id: item.recipeId,
      quantity: item.quantity,
    })),
  });
}

export async function saveWeekPlan(familyId, weekPlan) {
  const supabase = await getSupabase();
  const currentWeekKey = getWeekKey();
  const rows = Object.entries(weekPlan).flatMap(([day, recipeIds]) =>
    recipeIds.map((recipeId) => ({
      family_id: familyId,
      plan_date: currentWeekKey,
      meal_slot: `${WEEK_PREFIX}${day}`,
      recipe_id: recipeId,
      quantity: 1,
    })),
  );

  await replaceSlotRows({
    supabase,
    familyId,
    planDate: currentWeekKey,
    slots: weekSlots(),
    rows,
  });
}

export async function migrateLocalMenusToCloud({ familyId, todayMenu, weekPlan }) {
  await saveTodayMenu(familyId, todayMenu);
  await saveWeekPlan(familyId, weekPlan);
}

function rowsToTodayMenu(rows) {
  return rows
    .filter((row) => row.meal_slot === TODAY_SLOT)
    .map((row) => ({
      recipeId: row.recipe_id,
      quantity: row.quantity ?? 1,
    }));
}

function rowsToWeekPlan(rows) {
  const plan = {
    周一: [],
    周二: [],
    周三: [],
    周四: [],
    周五: [],
    周六: [],
    周日: [],
  };

  rows.forEach((row) => {
    if (!row.meal_slot?.startsWith(WEEK_PREFIX)) return;
    const day = row.meal_slot.slice(WEEK_PREFIX.length);
    if (!plan[day]) return;
    plan[day].push(row.recipe_id);
  });

  return plan;
}

async function replaceSlotRows({ supabase, familyId, planDate, slots, rows }) {
  const { error: deleteError } = await supabase
    .from("meal_plans")
    .delete()
    .eq("family_id", familyId)
    .eq("plan_date", planDate)
    .in("meal_slot", slots);

  if (deleteError) throw deleteError;
  if (rows.length === 0) return;

  const { error: insertError } = await supabase.from("meal_plans").insert(rows);
  if (insertError) throw insertError;
}

function weekSlots() {
  return ["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((day) => `${WEEK_PREFIX}${day}`);
}
