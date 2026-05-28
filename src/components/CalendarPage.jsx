import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Plus, Search, X } from "lucide-react";
import {
  addMonths,
  calendarWeekdays,
  formatDateKey,
  formatDateLabel,
  formatMonthTitle,
  getCalendarMonthDates,
  parseDateKey,
} from "../lib/date";
import { getRecipe, photoFor, recipes } from "../lib/recipes";
import { Card } from "./ui/Card";
import { MiniMeal } from "./ui/MiniMeal";

export function CalendarPage({ mealCalendar, onAssign, onRemove, onOpenRecipe }) {
  const todayKey = formatDateKey(new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [visibleMonthKey, setVisibleMonthKey] = useState(todayKey);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const visibleMonthDate = parseDateKey(visibleMonthKey);
  const calendarDates = useMemo(() => getCalendarMonthDates(visibleMonthDate), [visibleMonthKey]);
  const selectedRecipeIds = mealCalendar[selectedDateKey] ?? [];
  const selectedRecipes = selectedRecipeIds.map((id) => getRecipe(id)).filter(Boolean);
  const selectedIsPast = selectedDateKey < todayKey;
  const selectedIsToday = selectedDateKey === todayKey;
  const pickerRecipes = recipes.filter((recipe) => {
    const keyword = pickerQuery.trim().toLowerCase();
    if (!keyword) return true;
    return [recipe.name, recipe.description, ...recipe.categories, ...recipe.tags]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });

  function openPicker() {
    setPickerOpen(true);
    setPickerQuery("");
  }

  function closePicker() {
    setPickerOpen(false);
    setPickerQuery("");
  }

  function chooseRecipe(recipeId) {
    onAssign(selectedDateKey, recipeId);
    closePicker();
  }

  function changeMonth(delta) {
    const nextMonth = addMonths(visibleMonthDate, delta);
    setVisibleMonthKey(formatDateKey(nextMonth));
  }

  function selectDate(dateKey) {
    setSelectedDateKey(dateKey);
    setVisibleMonthKey(dateKey);
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <Card>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Meal calendar</p>
            <h3 className="card-title">{formatMonthTitle(visibleMonthKey)}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="grid h-10 w-10 place-items-center rounded-full border border-line bg-canvas transition hover:bg-ink hover:text-white"
              aria-label="上个月"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedDateKey(todayKey);
                setVisibleMonthKey(todayKey);
              }}
              className="rounded-full bg-acid px-4 py-2 text-xs font-black"
            >
              今天
            </button>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="grid h-10 w-10 place-items-center rounded-full border border-line bg-canvas transition hover:bg-ink hover:text-white"
              aria-label="下个月"
            >
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {calendarWeekdays.map((weekday) => (
            <div key={weekday} className="py-2 text-center text-xs font-black text-ink/35">
              {weekday}
            </div>
          ))}
          {calendarDates.map((date) => {
            const dateKey = formatDateKey(date);
            const itemCount = mealCalendar[dateKey]?.length ?? 0;
            const isSelected = dateKey === selectedDateKey;
            const isToday = dateKey === todayKey;
            const isPast = dateKey < todayKey;
            const isCurrentMonth = date.getMonth() === parseDateKey(selectedDateKey).getMonth();
            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => selectDate(dateKey)}
                className={`min-h-[88px] rounded-[18px] border p-3 text-left transition hover:-translate-y-0.5 ${
                  isSelected
                    ? "border-ink bg-ink text-white shadow-lift"
                    : "border-line bg-white text-ink hover:border-ink/20"
                } ${!isCurrentMonth ? "opacity-35" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg font-black">{date.getDate()}</span>
                  {isToday && (
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black ${
                      isSelected ? "bg-acid text-ink" : "bg-acid text-ink"
                    }`}>
                      今天
                    </span>
                  )}
                </div>
                <p className={`mt-3 text-xs font-bold ${isSelected ? "text-white/58" : "text-ink/42"}`}>
                  {isPast ? "记录" : "计划"} · {itemCount} 道菜
                </p>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-5">
        <section className="overflow-hidden rounded-[28px] border border-line bg-white shadow-card">
          <div className="bg-ink p-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-acid">
              {selectedIsPast ? "History" : "Planning"}
            </p>
            <h3 className="mt-2 text-3xl font-black tracking-[-0.04em]">
              {formatDateLabel(selectedDateKey)}
            </h3>
            <p className="mt-2 text-sm font-bold text-white/55">
              {selectedIsPast
                ? "过去日期展示饮食记录，不再编辑。"
                : selectedIsToday
                  ? "今天可以继续补充菜单，也会影响食材清单。"
                  : "未来日期可以提前规划食谱。"}
            </p>
          </div>

          <div className="grid gap-3 p-5">
            {selectedRecipes.length > 0 ? (
              selectedRecipes.map((recipe) => (
                <div key={`${selectedDateKey}-${recipe.id}`} className="relative">
                  <MiniMeal recipe={recipe} onClick={() => onOpenRecipe(recipe.id)} />
                  {!selectedIsPast && (
                    <button
                      type="button"
                      onClick={() => onRemove(selectedDateKey, recipe.id)}
                      className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-ink shadow-card"
                      aria-label={`移除 ${recipe.name}`}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="rounded-[22px] bg-canvas p-5 text-sm font-bold leading-6 text-ink/50">
                {selectedIsPast ? "这一天还没有饮食记录。" : "这一天还没有规划菜品。"}
              </div>
            )}

            {!selectedIsPast && (
              <button
                type="button"
                onClick={openPicker}
                className="mt-2 flex min-h-12 items-center justify-center gap-2 rounded-full bg-acid px-4 text-sm font-black text-ink transition hover:-translate-y-0.5"
              >
                <Plus size={17} />
                为这一天添加菜品
              </button>
            )}
          </div>
        </section>

        <Card>
          <p className="eyebrow">How it works</p>
          <h3 className="card-title">日历规则</h3>
          <div className="mt-4 grid gap-3 text-sm font-bold leading-6 text-ink/55">
            <p>点击过去日期：查看当天饮食记录。</p>
            <p>点击今天或未来日期：提前规划菜品。</p>
            <p>当前版本先使用本地测试数据，后续接数据库后会保存真实历史。</p>
          </div>
        </Card>
      </div>

      {pickerOpen && (
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
                  <p className="eyebrow">{formatDateLabel(selectedDateKey)}</p>
                  <h3 className="card-title">规划食谱</h3>
                  <p className="mt-2 text-sm font-bold text-ink/50">选择一道菜加入这一天。</p>
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
                  const alreadyAdded = selectedRecipeIds.includes(recipe.id);
                  return (
                    <button
                      key={recipe.id}
                      type="button"
                      onClick={() => chooseRecipe(recipe.id)}
                      disabled={alreadyAdded}
                      className="flex items-center gap-3 rounded-[20px] border border-line bg-white p-3 text-left transition hover:border-ink/20 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <img src={photoFor(recipe)} alt="" className="h-16 w-16 rounded-2xl object-cover" />
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
