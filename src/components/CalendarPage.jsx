import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Flame, Plus, Search, Utensils, X } from "lucide-react";
import {
  addMonths,
  calendarWeekdays,
  formatDateKey,
  formatDateLabel,
  formatMonthTitle,
  getCalendarMonthDates,
  parseDateKey,
} from "../lib/date";
import { getRecipe, nutritionFor, recipes } from "../lib/recipes";
import { Card } from "./ui/Card";
import { DishImage } from "./ui/DishImage";
import { HumiScene } from "./ui/HumiScene";
import { MiniMeal } from "./ui/MiniMeal";

export function CalendarPage({ mealCalendar, onAssign, onRemove, onOpenRecipe, canManageHousehold = true }) {
  const todayKey = formatDateKey(new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(null);
  const [visibleMonthKey, setVisibleMonthKey] = useState(todayKey);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const detailRef = useRef(null);
  const visibleMonthDate = parseDateKey(visibleMonthKey);
  const calendarDates = useMemo(() => getCalendarMonthDates(visibleMonthDate), [visibleMonthKey]);
  const hasSelectedDate = Boolean(selectedDateKey);
  const selectedRecipeIds = hasSelectedDate ? mealCalendar[selectedDateKey] ?? [] : [];
  const selectedRecipes = selectedRecipeIds.map((id) => getRecipe(id)).filter(Boolean);
  const selectedSummary = getNutritionSummary(selectedRecipes);
  const selectedIsPast = hasSelectedDate && selectedDateKey < todayKey;
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
    if (!canManageHousehold) return;
    setPickerOpen(true);
    setPickerQuery("");
  }

  function closePicker() {
    setPickerOpen(false);
    setPickerQuery("");
  }

  function chooseRecipe(recipeId) {
    if (!selectedDateKey) return;
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
    window.setTimeout(() => {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  return (
    <section className="grid gap-5">
      <Card>
        <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="eyebrow">饮食日历</p>
              <h3 className="card-title">{formatMonthTitle(visibleMonthKey)}</h3>
            </div>
            <div className="flex items-center justify-end gap-2">
            <HumiScene scene="calendar" size="sm" className="mr-2 hidden md:grid" />
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="grid h-10 w-10 place-items-center rounded-full border border-line bg-white transition hover:border-ink hover:bg-ink hover:text-white"
              aria-label="上个月"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedDateKey(todayKey);
                setVisibleMonthKey(todayKey);
                window.setTimeout(() => {
                  detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 80);
              }}
              className="rounded-full border border-line bg-white px-4 py-2 text-xs font-black text-ink"
            >
              今天
            </button>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="grid h-10 w-10 place-items-center rounded-full border border-line bg-white transition hover:border-ink hover:bg-ink hover:text-white"
              aria-label="下个月"
            >
              <ArrowRight size={16} />
            </button>
            </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {calendarWeekdays.map((weekday) => (
            <div key={weekday} className="py-2 text-center text-xs font-black text-ink/35">
              {weekday}
            </div>
          ))}
          {calendarDates.map((date) => {
            const dateKey = formatDateKey(date);
            const dayRecipes = (mealCalendar[dateKey] ?? []).map((id) => getRecipe(id)).filter(Boolean);
            const itemCount = dayRecipes.length;
            const summary = getNutritionSummary(dayRecipes);
            const isSelected = dateKey === selectedDateKey;
            const isToday = dateKey === todayKey;
            const isCurrentMonth = date.getMonth() === visibleMonthDate.getMonth();
            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => selectDate(dateKey)}
                data-calendar-day={dateKey}
                data-item-count={itemCount}
                className={`relative grid min-h-[74px] place-items-center rounded-[18px] border p-2 text-center transition hover:-translate-y-0.5 sm:min-h-[104px] ${
                  isSelected
                    ? "calendar-day-selected border-ink bg-ink text-white shadow-lift"
                    : "border-line bg-white text-ink hover:border-ink/20 hover:shadow-card"
                } ${!isCurrentMonth ? "opacity-35" : ""}`}
              >
                <div className="absolute left-2 top-2 flex items-center gap-1.5">
                  <span className="text-sm font-black sm:text-base">{date.getDate()}</span>
                  {isToday && <span className="h-1.5 w-1.5 rounded-full bg-ink" aria-label="今天" />}
                </div>
                {itemCount > 0 && <NutritionRings summary={summary} selected={isSelected} size="xs" />}
                {itemCount > 0 && (
                  <span className={`absolute bottom-2 rounded-full px-2 py-1 text-[10px] font-black ${
                    isSelected ? "bg-white/12 text-white/72" : "bg-canvas text-ink/46"
                  }`}>
                    {itemCount} 道
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <div ref={detailRef} className="grid scroll-mt-5 gap-5">
        {hasSelectedDate ? (
          <section
            key={selectedDateKey}
            className="calendar-detail-enter overflow-hidden rounded-[30px] border border-line bg-white shadow-lift"
          >
            <div className="grid gap-6 bg-ink p-5 text-white md:grid-cols-[124px_1fr_auto] md:items-center md:p-6">
              <NutritionRings summary={selectedSummary} selected size="lg" />
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-white">
                  Daily page · {selectedIsPast ? "History" : "Planning"}
                </p>
                <h3 className="mt-2 text-3xl font-black tracking-[-0.04em]">
                  {formatDateLabel(selectedDateKey)}
                </h3>
                <p className="mt-2 text-sm font-bold text-white/55">
                  {selectedIsPast
                    ? "过去日期展示饮食记录。"
                    : selectedIsToday
                      ? "今天可以继续补充菜单，也会影响食材清单。"
                    : "未来日期可以提前规划食谱。"}
                </p>
              </div>
              {!selectedIsPast && canManageHousehold && (
                <button
                  type="button"
                  onClick={openPicker}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-black text-ink transition hover:-translate-y-0.5"
                >
                  <Plus size={17} />
                  添加菜品
                </button>
              )}
            </div>

            <div className="grid gap-5 p-5 md:p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <NutritionMetric icon={Utensils} label="菜品" value={`${selectedSummary.meals} 道`} />
                <NutritionMetric icon={Flame} label="估算能量" value={`${selectedSummary.energy} kcal`} />
                <NutritionMetric icon={Plus} label="结构" value={selectedSummary.balanceLabel} />
              </div>

              {selectedRecipes.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {selectedRecipes.map((recipe) => (
                    <div key={`${selectedDateKey}-${recipe.id}`} className="relative">
                      <MiniMeal recipe={recipe} onClick={() => onOpenRecipe(recipe.id)} />
                      {!selectedIsPast && canManageHousehold && (
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
                  ))}
                </div>
              ) : (
                <div className="rounded-[22px] bg-canvas p-5 text-sm font-bold leading-6 text-ink/45">
                  {selectedIsPast ? "这一天暂时没有记录。" : "可以从这里补一道菜。"}
                </div>
              )}

              {!selectedIsPast && (
                <button
                  type="button"
                  onClick={openPicker}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-black text-ink transition hover:-translate-y-0.5 hover:border-ink hover:bg-ink hover:text-white md:hidden"
                >
                  <Plus size={17} />
                  为这一天添加菜品
                </button>
              )}
            </div>
          </section>
        ) : (
          <div className="rounded-[24px] border border-dashed border-line bg-white/55 p-5 text-center text-sm font-bold text-ink/45">
            点一天，看看当天吃了什么。
          </div>
        )}
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

export function NutritionRings({ summary, selected = false, size = "sm" }) {
  const dimensions = {
    lg: { dimension: 112, stroke: 8, mealRadius: 48, vegRadius: 37, proteinRadius: 26, text: "text-2xl" },
    sm: { dimension: 58, stroke: 5, mealRadius: 25, vegRadius: 19, proteinRadius: 13, text: "text-xs" },
    xs: { dimension: 38, stroke: 4, mealRadius: 16, vegRadius: 11, proteinRadius: 6, text: "text-[10px]" },
  };
  const { dimension, stroke, mealRadius, vegRadius, proteinRadius, text: centerTextClass } = dimensions[size];
  const mutedText = selected ? "text-white/54" : "text-ink/42";

  return (
    <div className="relative grid place-items-center" style={{ width: dimension, height: dimension }}>
      <svg width={dimension} height={dimension} viewBox={`0 0 ${dimension} ${dimension}`} aria-hidden="true">
        <RingTrack
          progress={summary.mealProgress}
          radius={mealRadius}
          stroke={stroke}
          color={selected ? "#FFFFFF" : "#111111"}
          trackColor={selected ? "rgba(255,255,255,0.16)" : "rgba(17,17,17,0.08)"}
          center={dimension / 2}
          delayClass=""
        />
        <RingTrack
          progress={summary.vegetableProgress}
          radius={vegRadius}
          stroke={stroke}
          color={selected ? "rgba(255,255,255,0.72)" : "rgba(17,17,17,0.62)"}
          trackColor={selected ? "rgba(255,255,255,0.10)" : "rgba(17,17,17,0.06)"}
          center={dimension / 2}
          delayClass="fitness-ring-delay-1"
        />
        <RingTrack
          progress={summary.proteinProgress}
          radius={proteinRadius}
          stroke={stroke}
          color={selected ? "rgba(255,255,255,0.46)" : "rgba(17,17,17,0.34)"}
          trackColor={selected ? "rgba(255,255,255,0.07)" : "rgba(17,17,17,0.04)"}
          center={dimension / 2}
          delayClass="fitness-ring-delay-2"
        />
      </svg>
      <div key={`${summary.meals}-${summary.mealProgress}-${summary.vegetableProgress}-${summary.proteinProgress}`} className="fitness-ring-center absolute grid place-items-center text-center">
        <span className={`font-black tracking-[-0.04em] ${centerTextClass}`}>{summary.meals}</span>
        {size === "lg" && <span className={`-mt-1 text-[10px] font-black uppercase ${mutedText}`}>meals</span>}
      </div>
    </div>
  );
}

function RingTrack({ progress, radius, stroke, color, trackColor, center, delayClass }) {
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamp(progress));

  return (
    <>
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={trackColor}
        strokeWidth={stroke}
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
        className={`fitness-ring ${delayClass}`}
        style={{
          "--ring-circumference": circumference,
          "--ring-offset": offset,
        }}
      />
    </>
  );
}

function NutritionMetric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-[20px] bg-canvas p-4">
      <div className="flex items-center gap-2 text-ink/42">
        <Icon size={16} />
        <p className="text-xs font-black uppercase tracking-[0.14em]">{label}</p>
      </div>
      <p className="mt-2 text-xl font-black tracking-[-0.03em]">{value}</p>
    </div>
  );
}

export function getNutritionSummary(dayRecipes) {
  const meals = dayRecipes.length;
  const vegetableCount = dayRecipes.filter(hasVegetableSignal).length;
  const proteinCount = dayRecipes.filter(hasProteinSignal).length;
  const energy = dayRecipes.reduce((total, recipe) => total + nutritionFor(recipe).caloriesKcal, 0);
  const vegetableProgress = meals > 0 ? vegetableCount / meals : 0;
  const proteinProgress = meals > 0 ? proteinCount / meals : 0;

  return {
    meals,
    energy,
    mealProgress: meals / 3,
    vegetableProgress,
    proteinProgress,
    balanceLabel: getBalanceLabel(meals, vegetableProgress, proteinProgress),
  };
}

function hasVegetableSignal(recipe) {
  const words = [
    ...recipe.categories,
    ...recipe.tags,
    ...recipe.ingredients.map((item) => item.name),
  ].join(" ");
  return /素菜|清爽|青菜|白菜|西红柿|番茄|黄瓜|土豆|青椒|西兰花|冬瓜|胡萝卜|木耳|茄子|香菇|莲藕|山药|蒜苔|蒜苗/.test(words);
}

function hasProteinSignal(recipe) {
  const words = [
    ...recipe.categories,
    ...recipe.tags,
    ...recipe.ingredients.map((item) => item.name),
  ].join(" ");
  return /肉菜|鱼虾海鲜|鸡|蛋|肉|排骨|豆腐|鱼|虾|皮蛋/.test(words);
}

function getBalanceLabel(meals, vegetableProgress, proteinProgress) {
  if (meals === 0) return "未记录";
  if (vegetableProgress >= 0.5 && proteinProgress >= 0.5) return "均衡";
  if (vegetableProgress < 0.5 && proteinProgress >= 0.5) return "补蔬菜";
  if (proteinProgress < 0.5 && vegetableProgress >= 0.5) return "补蛋白";
  return "待丰富";
}

function clamp(value) {
  return Math.min(1, Math.max(0, value));
}
