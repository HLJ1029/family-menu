import { useState } from "react";
import { Plus, Search, ShoppingBasket, X } from "lucide-react";
import { DishImage } from "./ui/DishImage";
import { getCurrentPlanDay } from "../lib/date";
import { getDayMeals, mealSlots } from "../lib/mealPlan";
import { getRecipe, recipes } from "../lib/recipes";
import { CloudInlineStatus } from "./system/CloudInlineStatus";
import { Card } from "./ui/Card";

const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const dayLabels = ["一", "二", "三", "四", "五", "六", "日"];

function getWeekDates() {
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.getDate();
  });
}

export function Planner({
  weekPlan,
  mealPlan = {},
  weekDateKeys = {},
  draggedRecipeId,
  onAssign,
  onAssignMeal,
  onRemove,
  onRemoveMeal,
  cloudSync,
  onViewChange,
}) {
  const currentDay = getCurrentPlanDay();
  const currentIndex = days.indexOf(currentDay);
  const weekDates = getWeekDates();

  const [selectedDay, setSelectedDay] = useState(currentDay);
  const [pickerTarget, setPickerTarget] = useState(null);
  const [pickerQuery, setPickerQuery] = useState("");

  const selectedIndex = days.indexOf(selectedDay);
  const selectedDateKey = weekDateKeys[selectedDay];
  const selectedMeals = getDayMeals(mealPlan, selectedDateKey);
  const selectedRecipeCount = mealSlots.reduce((total, slot) => total + (selectedMeals[slot.id]?.length ?? 0), 0);
  const weekMealCount = [...new Set(Object.values(weekDateKeys).filter(Boolean))].reduce((total, dateKey) => {
    const dayMeals = getDayMeals(mealPlan, dateKey);
    return total + mealSlots.reduce((dayTotal, slot) => dayTotal + (dayMeals[slot.id]?.length ?? 0), 0);
  }, 0);

  const pickerRecipes = recipes.filter((recipe) => {
    const keyword = pickerQuery.trim().toLowerCase();
    if (!keyword) return true;
    return [recipe.name, recipe.description, ...recipe.categories, ...(recipe.tags ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });

  function openPicker(day, slotId = "dinner") {
    setPickerTarget({ day, slotId, dateKey: weekDateKeys[day] });
    setPickerQuery("");
  }

  function closePicker() {
    setPickerTarget(null);
    setPickerQuery("");
  }

  function chooseRecipe(recipeId) {
    if (!pickerTarget) return;
    if (pickerTarget.dateKey && onAssignMeal) {
      onAssignMeal(pickerTarget.dateKey, pickerTarget.slotId, recipeId);
    } else {
      onAssign(pickerTarget.day, recipeId);
    }
    closePicker();
  }

  return (
    <section className="grid gap-5">
      {/* Week date strip */}
      <Card>
        <div className="flex justify-between">
          {days.map((day, i) => {
            const isToday = i === currentIndex;
            const isPast = i < currentIndex;
            const isSelected = i === selectedIndex;
            const date = weekDates[i];

            let circleClass = "text-ink/38";
            if (isSelected && isToday) {
              circleClass = "border-2 border-ink text-ink bg-white";
            } else if (isSelected || isPast) {
              circleClass = "bg-ink text-white";
            }

            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className="flex flex-col items-center gap-1.5"
              >
                <span className="text-[11px] font-black text-ink/38">{dayLabels[i]}</span>
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-black transition ${circleClass}`}
                >
                  {date}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Selected day card */}
      <Card>
        <p className="eyebrow">
          {selectedDay === currentDay ? `今天·${currentDay}` : selectedDay}
        </p>
        <h3 className="card-title">
          {selectedRecipeCount > 0
            ? `已安排 ${selectedRecipeCount} 道`
            : "这天先空着"}
        </h3>
        <div className="mt-4 grid gap-2">
          {mealSlots.map((slot) => {
            const entries = selectedMeals[slot.id] ?? [];
            return (
              <div key={slot.id} className="rounded-[22px] border border-line bg-canvas p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/38">{slot.label}</p>
                  <button
                    type="button"
                    onClick={() => openPicker(selectedDay, slot.id)}
                    className="inline-flex min-h-8 items-center gap-1 rounded-full bg-white px-3 text-xs font-black text-ink transition hover:bg-ink hover:text-white"
                  >
                    <Plus size={13} />
                    添加
                  </button>
                </div>
                <div className="mt-3 grid gap-2">
                  {entries.length === 0 && (
                    <p className="rounded-2xl bg-white p-3 text-sm font-bold text-ink/42">
                      {slot.label}先空着
                    </p>
                  )}
                  {entries.map((entry) => {
                    const recipe = getRecipe(entry.recipeId);
                    if (!recipe) return null;
                    return (
                      <div
                        key={`${slot.id}:${recipe.id}`}
                        className="flex items-center gap-3 rounded-2xl border border-line bg-white p-2 pr-4"
                      >
                        <DishImage
                          recipe={recipe}
                          variant="thumb"
                          alt={recipe.name}
                          className="h-12 w-12 rounded-xl object-cover"
                        />
                        <span className="min-w-0 flex-1 text-sm font-black">
                          {recipe.name}
                          {entry.quantity > 1 && <span className="ml-2 text-xs text-ink/38">x{entry.quantity}</span>}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedDateKey && onRemoveMeal) onRemoveMeal(selectedDateKey, slot.id, recipe.id);
                            else onRemove(selectedDay, recipe.id);
                          }}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-canvas text-ink/50 transition hover:bg-ink/10 hover:text-ink"
                          aria-label={`移除 ${recipe.name}`}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {weekMealCount > 0 && (
        <button
          type="button"
          data-testid="planner-grocery-summary"
          onClick={() => onViewChange("grocery")}
          className="flex min-h-14 items-center justify-between gap-4 rounded-full bg-ink px-6 text-left text-white shadow-card transition hover:-translate-y-0.5"
        >
          <span>
            <span className="block text-sm font-black">查看汇总清单</span>
            <span className="mt-1 block text-xs font-bold text-white/58">本周已安排 {weekMealCount} 道菜</span>
          </span>
          <ShoppingBasket size={19} className="shrink-0 text-white" />
        </button>
      )}

      <CloudInlineStatus
        {...cloudSync}
        primaryAction={false}
        localLabel="本地连排计划"
        pendingLabel="连排计划待保存"
        enabledLabel="已保存连排计划"
        migrateLabel={cloudSync?.enabled ? "重新保存本机计划" : "保存连排计划"}
      />

      {/* Recipe picker modal */}
      {pickerTarget && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-ink/38 backdrop-blur-sm"
            aria-label="关闭添加菜品"
            onClick={closePicker}
          />
          <aside className="absolute inset-x-0 bottom-0 max-h-[86vh] overflow-hidden rounded-t-[30px] bg-canvas shadow-lift md:inset-y-6 md:left-auto md:right-6 md:w-[520px] md:rounded-[30px]">
            <div className="border-b border-line bg-white/90 p-5 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">{pickerTarget.day} · {mealSlots.find((slot) => slot.id === pickerTarget.slotId)?.label}</p>
                  <h3 className="card-title">添加菜品</h3>
                  <p className="mt-2 text-sm font-bold text-ink/50">选择一道菜加入这顿饭。</p>
                </div>
                <button
                  type="button"
                  onClick={closePicker}
                  className="grid h-10 w-10 place-items-center rounded-full bg-canvas text-ink"
                  aria-label="关闭"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-full border border-line bg-canvas px-4 py-3">
                <Search size={17} className="text-ink/38" />
                <input
                  value={pickerQuery}
                  onChange={(event) => setPickerQuery(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
                  placeholder="搜索菜名、分类或口味"
                />
              </div>
            </div>
            <div className="max-h-[58vh] overflow-y-auto p-5">
              <div className="grid gap-3">
                {pickerRecipes.map((recipe) => {
                  const targetMeals = getDayMeals(mealPlan, pickerTarget.dateKey);
                  const alreadyAdded = (targetMeals[pickerTarget.slotId] ?? []).some((entry) => entry.recipeId === recipe.id) ||
                    (pickerTarget.slotId === "dinner" && (weekPlan[pickerTarget.day] ?? []).includes(recipe.id));
                  return (
                    <button
                      key={recipe.id}
                      type="button"
                      onClick={() => chooseRecipe(recipe.id)}
                      disabled={alreadyAdded}
                      className="flex items-center gap-3 rounded-[20px] border border-line bg-white p-3 text-left transition hover:border-ink/20 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <DishImage
                        recipe={recipe}
                        variant="thumb"
                        alt=""
                        className="h-16 w-16 rounded-2xl object-cover"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-black">{recipe.name}</span>
                        <span className="mt-1 block text-xs font-bold text-ink/45">
                          {recipe.timeMinutes} min · {recipe.difficulty} · {recipe.categories[0]}
                        </span>
                      </span>
                      <span className={`rounded-full px-3 py-2 text-xs font-black ${
                        alreadyAdded ? "bg-canvas text-ink/45" : "bg-ink text-white"
                      }`}>
                        {alreadyAdded ? "已添加" : "加入"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
