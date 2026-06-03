import { useState } from "react";
import { Plus, Search, Share2, X } from "lucide-react";
import { getCurrentPlanDay } from "../lib/date";
import { getRecipe, photoFor, recipes } from "../lib/recipes";
import { CloudInlineStatus } from "./system/CloudInlineStatus";
import { Card } from "./ui/Card";
import { MiniMeal } from "./ui/MiniMeal";

const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function Planner({ weekPlan, draggedRecipeId, onAssign, onRemove, cloudSync, onShare }) {
  const [selectedDay, setSelectedDay] = useState(days[0]);
  const [selectedRecipeId, setSelectedRecipeId] = useState(recipes[0]?.id ?? "");
  const [pickerDay, setPickerDay] = useState(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const selectedRecipe = getRecipe(selectedRecipeId);
  const currentDay = getCurrentPlanDay();
  const pickerRecipes = recipes.filter((recipe) => {
    const keyword = pickerQuery.trim().toLowerCase();
    if (!keyword) return true;
    return [recipe.name, recipe.description, ...recipe.categories, ...recipe.tags]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });

  function addSelectedRecipe() {
    if (!selectedDay || !selectedRecipeId) return;
    onAssign(selectedDay, selectedRecipeId);
  }

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
      <Card>
        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="eyebrow">Weekly planning</p>
            <h3 className="card-title">快速安排</h3>
            <p className="mt-3 text-sm font-bold leading-6 text-ink/55">
              今天是{currentDay}。今晚选好的菜会顺手放进今天计划；你也可以在下面单独安排每一天。
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {days.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => openPicker(day)}
                  className={`rounded-full border px-4 py-2 text-sm font-black transition ${
                    day === currentDay
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-canvas text-ink/58 hover:border-ink/20 hover:text-ink"
                  }`}
                >
                  {day}加菜
                </button>
              ))}
              <button
                type="button"
                onClick={onShare}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-black text-ink/62 transition hover:border-ink/20 hover:text-ink"
              >
                <Share2 size={15} />
                分享周计划
              </button>
            </div>
          </div>

          <div className="rounded-[22px] border border-line bg-canvas p-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-ink/38">Quick add</p>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-2">
                <span className="text-xs font-black text-ink/42">菜品</span>
                <select
                  value={selectedRecipeId}
                  onChange={(event) => setSelectedRecipeId(event.target.value)}
                  className="h-12 rounded-full border border-line bg-white px-4 text-sm font-black outline-none focus:border-ink/30"
                >
                  {recipes.map((recipe) => (
                    <option key={recipe.id} value={recipe.id}>
                      {recipe.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select
                  value={selectedDay}
                  onChange={(event) => setSelectedDay(event.target.value)}
                  className="h-12 rounded-full border border-line bg-white px-4 text-sm font-black outline-none focus:border-ink/30"
                >
                  {days.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addSelectedRecipe}
                  className="flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-black text-white transition hover:-translate-y-0.5"
                >
                  <Plus size={16} className="text-acid" />
                  添加
                </button>
              </div>
            </div>
            {selectedRecipe && (
              <div className="mt-3 flex items-center gap-3 rounded-[18px] bg-white p-2">
                <img
                  src={photoFor(selectedRecipe, { variant: "thumb" })}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-12 w-12 rounded-2xl object-cover"
                />
                <div>
                  <p className="text-sm font-black">{selectedRecipe.name}</p>
                  <p className="text-xs font-bold text-ink/45">
                    {selectedRecipe.timeMinutes} min · {selectedRecipe.difficulty}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <CloudInlineStatus
        {...cloudSync}
        localLabel="本地一周计划"
        pendingLabel="一周计划待保存"
        enabledLabel="已保存一周计划"
        migrateLabel={cloudSync?.enabled ? "重新保存本机计划" : "保存一周计划"}
      />

      <div className="grid gap-4">
        {days.map((day) => {
          const dayRecipes = (weekPlan[day] ?? []).map((id) => getRecipe(id)).filter(Boolean);
          return (
            <div
              key={day}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => draggedRecipeId && onAssign(day, draggedRecipeId)}
              className="grid gap-4 rounded-[24px] border border-line bg-white p-4 shadow-card transition hover:border-ink/20 md:grid-cols-[132px_1fr]"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-ink/38">{day}</p>
                  {day === currentDay && (
                    <span className="rounded-full bg-acid px-2 py-1 text-[10px] font-black">今天</span>
                  )}
                </div>
                <p className="mt-2 text-xs font-bold text-ink/42">
                  {dayRecipes.length} 道菜
                </p>
                <button
                  type="button"
                  onClick={() => openPicker(day)}
                  className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-ink px-3 text-xs font-black text-white transition hover:-translate-y-0.5"
                >
                  <Plus size={14} className="text-acid" />
                  添加菜品
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {dayRecipes.length > 0 ? (
                  dayRecipes.map((recipe) => (
                    <div key={`${day}-${recipe.id}`} className="relative">
                      <MiniMeal recipe={recipe} />
                      <button
                        type="button"
                        onClick={() => onRemove(day, recipe.id)}
                        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-ink shadow-card"
                        aria-label={`移除 ${recipe.name}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[20px] bg-canvas p-4 text-sm font-bold text-ink/45">
                    未安排。点击左侧“添加菜品”开始计划，也可以拖一道菜到这里。
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

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
                      <img
                        src={photoFor(recipe, { variant: "thumb" })}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-16 w-16 rounded-2xl object-cover"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-black">{recipe.name}</span>
                        <span className="mt-1 block text-xs font-bold text-ink/45">
                          {recipe.timeMinutes} min · {recipe.difficulty} · {recipe.categories[0]}
                        </span>
                      </span>
                      <span className={`rounded-full px-3 py-2 text-xs font-black ${
                        alreadyAdded ? "bg-canvas text-ink/45" : "bg-acid text-ink"
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
