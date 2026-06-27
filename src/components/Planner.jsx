import { useState } from "react";
import { CalendarDays, Plus, Search, X } from "lucide-react";
import { DishImage } from "./ui/DishImage";
import { getCurrentPlanDay } from "../lib/date";
import { getRecipe, recipes } from "../lib/recipes";
import { CloudInlineStatus } from "./system/CloudInlineStatus";
import { Card } from "./ui/Card";
import { HumiBrandIllustration } from "./ui/HumiBrandIllustration";

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

export function Planner({ weekPlan, draggedRecipeId, onAssign, onRemove, cloudSync, onViewChange }) {
  const currentDay = getCurrentPlanDay();
  const currentIndex = days.indexOf(currentDay);
  const weekDates = getWeekDates();

  const [selectedDay, setSelectedDay] = useState(currentDay);
  const [pickerDay, setPickerDay] = useState(null);
  const [pickerQuery, setPickerQuery] = useState("");

  const selectedIndex = days.indexOf(selectedDay);
  const selectedRecipes = (weekPlan[selectedDay] ?? []).map((id) => getRecipe(id)).filter(Boolean);

  const pickerRecipes = recipes.filter((recipe) => {
    const keyword = pickerQuery.trim().toLowerCase();
    if (!keyword) return true;
    return [recipe.name, recipe.description, ...recipe.categories, ...(recipe.tags ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });

  function openPicker(day) {
    setPickerDay(day);
    setPickerQuery("");
  }

  function closePicker() {
    setPickerDay(null);
    setPickerQuery("");
  }

  function chooseRecipe(recipeId) {
    if (!pickerDay) return;
    onAssign(pickerDay, recipeId);
    closePicker();
  }

  return (
    <section className="grid gap-5">
      <div className="rounded-[28px] border border-line bg-white p-5 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">Week plan</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] md:text-5xl">
              先把这一周顺一顺。
            </h2>
          </div>
          <HumiBrandIllustration
            variant="weekly"
            size="md"
            className="-mr-1 -mt-3 shrink-0"
            contextKey="planner-hero"
            title="每周安排"
          />
        </div>
        <div>
          <p className="mt-3 max-w-xl text-sm font-bold leading-6 text-ink/52">
            每天留一点余地，晚饭、清单和库存会跟着同步。
          </p>
        </div>
      </div>

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
          {selectedRecipes.length > 0
            ? `已安排 ${selectedRecipes.length} 道菜`
            : "还没有安排"}
        </h3>
        <div className="mt-4 grid gap-2">
          {selectedRecipes.map((recipe) => (
            <div
              key={recipe.id}
              className="flex items-center gap-3 rounded-2xl border border-line bg-white p-2 pr-4"
            >
              <DishImage
                recipe={recipe}
                variant="thumb"
                alt={recipe.name}
                className="h-12 w-12 rounded-xl object-cover"
              />
              <span className="min-w-0 flex-1 text-sm font-black">{recipe.name}</span>
              <button
                type="button"
                onClick={() => onRemove(selectedDay, recipe.id)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-canvas text-ink/50 transition hover:bg-ink/10 hover:text-ink"
                aria-label={`移除 ${recipe.name}`}
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => openPicker(selectedDay)}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-ink/20 text-sm font-black text-ink/45 transition hover:border-ink/40 hover:text-ink"
          >
            <Plus size={14} />
            添加菜品
          </button>
        </div>
      </Card>

      <CloudInlineStatus
        {...cloudSync}
        localLabel="本地一周计划"
        pendingLabel="一周计划待保存"
        enabledLabel="已保存一周计划"
        migrateLabel={cloudSync?.enabled ? "重新保存本机计划" : "保存一周计划"}
      />

      <button
        type="button"
        onClick={() => onViewChange("calendar")}
        className="flex items-center justify-between rounded-[24px] border border-line bg-white p-5 shadow-card transition hover:border-ink/20"
      >
        <div className="text-left">
          <p className="text-sm font-black">营养日历</p>
          <p className="mt-0.5 text-xs font-bold text-ink/45">按日期查看菜单、营养环和饮食记录</p>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-full bg-canvas text-ink">
          <CalendarDays size={18} />
        </span>
      </button>

      {/* Recipe picker modal */}
      {pickerDay && (
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
                  <p className="eyebrow">{pickerDay}</p>
                  <h3 className="card-title">添加菜品</h3>
                  <p className="mt-2 text-sm font-bold text-ink/50">选择一道菜加入这一天的计划。</p>
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
                  const alreadyAdded = (weekPlan[pickerDay] ?? []).includes(recipe.id);
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
