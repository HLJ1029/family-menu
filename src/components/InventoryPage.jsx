import { forwardRef, useRef } from "react";
import { AlertTriangle, ChefHat, Cloud, PackageCheck, Plus, RefreshCw, Share2, UploadCloud } from "lucide-react";
import { buildMealInsights } from "../lib/insights";
import { formatPantryCount, getExpiryState } from "../lib/pantry";
import { Card } from "./ui/Card";
import { HumiBrandIllustration, HumiEmptyState, HumiPeek } from "./ui/HumiBrandIllustration";
import { PantryChip } from "./ui/PantryChip";

export function InventoryPage({
  pantryItems,
  pantryExpirySummary,
  newPantryItem,
  setNewPantryItem,
  newPantryAmount,
  setNewPantryAmount,
  newPantryExpiresOn,
  setNewPantryExpiresOn,
  onAddPantryItem,
  onRemovePantryItem,
  onShare,
  cloudSync,
  onOpenUserCenter,
  mealLogs,
  mealCalendar,
  familyProfile,
  nutritionGoals,
  weekPlan,
}) {
  const priorityRef = useRef(null);
  const expiringRef = useRef(null);
  const datePassedRef = useRef(null);
  const freshRef = useRef(null);
  const quickPantryItems = ["鸡蛋", "牛奶", "番茄", "青菜", "豆腐", "猪肉末", "米饭", "葱姜蒜"];
  const expiredItems = pantryItems.filter((item) => getExpiryState(item.expiresOn) === "expired");
  const expiringItems = pantryItems.filter((item) => getExpiryState(item.expiresOn) === "soon");
  const freshItems = pantryItems.filter((item) => !["expired", "soon"].includes(getExpiryState(item.expiresOn)));
  const insights = buildMealInsights({
    mealLogs,
    mealCalendar,
    pantryItems,
    familyProfile,
    nutritionGoals,
    weekPlan,
  });

  function submitPantryItem(event) {
    event.preventDefault();
    onAddPantryItem({
      name: newPantryItem,
      amount: newPantryAmount,
      expiresOn: newPantryExpiresOn,
    });
  }

  function scrollToSection(ref) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function addQuickPantryItem(name) {
    onAddPantryItem({ name, amount: "", expiresOn: "" });
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <div className="grid gap-5">
        <section className="overflow-hidden rounded-[32px] border border-line bg-white p-6 text-ink shadow-card md:p-8">
          <div className="grid gap-5 md:grid-cols-[1fr_170px] md:items-end">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.24em] text-ink/40">Pantry</p>
              <h2 className="mt-4 max-w-3xl text-4xl font-black tracking-[-0.04em] md:text-6xl">
                家里有什么，先看一眼。
              </h2>
              <p className="mt-4 max-w-xl text-sm font-bold leading-7 text-ink/58">
                买菜前先看看家里现有的，快到期的也别忘了优先处理。日期只是提醒，不判断食材能不能吃。
              </p>
            </div>
            <div className="rounded-[28px] border border-line bg-canvas p-4 text-center">
              <HumiBrandIllustration
                variant="pantry"
                size="xl"
                className="mx-auto"
                title="冰箱库存生活场景"
                contextKey="inventory-hero"
              />
              <p className="mt-2 text-xs font-black text-ink/56">先录库存，再排晚饭</p>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <InventoryMetric
            label="家里现有"
            value={`${pantryItems.length} 项`}
            hint="查看库存明细"
            onClick={() => scrollToSection(freshRef)}
          />
          <InventoryMetric
            label="临期提醒"
            value={`${pantryExpirySummary.expiringCount ?? 0} 项`}
            hint="查看优先处理"
            onClick={() => scrollToSection(expiringRef)}
          />
          <InventoryMetric
            label="日期已过"
            value={`${pantryExpirySummary.expiredCount ?? 0} 项`}
            hint="按实际状态确认"
            onClick={() => scrollToSection(datePassedRef)}
          />
        </div>

        <Card ref={priorityRef}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">库存预测</p>
              <h3 className="card-title">优先吃掉</h3>
            </div>
            <AlertTriangle size={22} />
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <div className="grid gap-2">
              {insights.pantryPriorityItems.length > 0 ? (
                insights.pantryPriorityItems.slice(0, 5).map((item) => (
                  <PriorityItem key={item.key} item={item} />
                ))
              ) : (
                <HumiEmptyState
                  variant="fridge-empty"
                  title="冰箱还没记录"
                  text="先记一笔鸡蛋、青菜或牛奶，推荐会先围绕家里已有来排。"
                  contextKey="inventory-priority-empty"
                />
              )}
            </div>
            <div className="rounded-[22px] bg-canvas p-4">
              <div className="flex items-center gap-2">
                <ChefHat size={18} />
                <p className="font-black">可搭配菜谱</p>
              </div>
              <div className="mt-3 grid gap-2">
                {insights.inventoryRecipeMatches.length > 0 ? (
                  insights.inventoryRecipeMatches.slice(0, 3).map((match) => (
                    <div key={match.recipe.id} className="rounded-[18px] bg-white p-3">
                      <p className="text-sm font-black">{match.recipe.name}</p>
                      <p className="mt-1 text-xs font-bold leading-5 text-ink/45">
                        可用上 {match.matched.slice(0, 3).join("、")}
                        {match.planned ? " · 已在本周计划" : ""}
                      </p>
                    </div>
                  ))
                ) : (
                  <HumiEmptyState
                    variant="ingredient-input"
                    title="还没配上菜"
                    text="补充库存名称后，这里会自动找能用上的菜谱。"
                    contextKey="inventory-recipe-empty"
                  />
                )}
              </div>
            </div>
          </div>
        </Card>

        <InventoryGroup
          ref={expiringRef}
          title="临期提醒"
          emptyText="暂时没有快到期的。"
          items={expiringItems}
          onRemove={onRemovePantryItem}
        />
        <InventoryGroup
          ref={datePassedRef}
          title="日期已过"
          emptyText="暂无日期已过的库存。"
          items={expiredItems}
          onRemove={onRemovePantryItem}
        />
        <InventoryGroup
          ref={freshRef}
          title="家里现有"
          emptyText="还没记录家里有什么。"
          items={freshItems}
          onRemove={onRemovePantryItem}
        />
      </div>

      <aside className="grid content-start gap-5">
        <Card className="relative overflow-hidden">
          <HumiPeek
            variant="ingredient-input"
            size="md"
            className="absolute -right-4 -top-2 opacity-90"
            contextKey="inventory-add-peek"
          />
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Add item</p>
              <h3 className="card-title">快速记库存</h3>
            </div>
            <Plus size={22} />
          </div>
          <p className="mt-3 text-xs font-bold leading-5 text-ink/48">
            只填名字就能加入推荐依据；数量和提醒日期都可以以后再补。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {quickPantryItems.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => addQuickPantryItem(item)}
                className="rounded-full border border-line bg-canvas px-3 py-2 text-xs font-black text-ink/62 transition hover:border-ink/30 hover:text-ink"
              >
                {item}
              </button>
            ))}
          </div>
          <form className="mt-5 grid gap-3" onSubmit={submitPantryItem}>
            <input
              value={newPantryItem}
              onChange={(event) => setNewPantryItem(event.target.value)}
              className="min-h-12 rounded-full border border-line bg-canvas px-4 text-sm font-bold outline-none focus:border-ink/30"
              placeholder="例如：鸡蛋、牛奶、青菜"
            />
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <input
                value={newPantryAmount}
                onChange={(event) => setNewPantryAmount(event.target.value)}
                className="min-h-12 rounded-full border border-line bg-canvas px-4 text-sm font-bold outline-none focus:border-ink/30"
                placeholder="数量，例如：6 个"
              />
              <label className="grid gap-1">
                <span className="px-2 text-[11px] font-black uppercase tracking-[0.16em] text-ink/32">
                  可选提醒日期
                </span>
              <input
                value={newPantryExpiresOn}
                onChange={(event) => setNewPantryExpiresOn(event.target.value)}
                type="date"
                aria-label="提醒日期"
                className="min-h-12 rounded-full border border-line bg-canvas px-4 text-sm font-bold outline-none focus:border-ink/30"
              />
              </label>
            </div>
            <button
              type="submit"
              className="min-h-12 rounded-full bg-ink px-5 text-sm font-black text-white transition hover:-translate-y-0.5"
            >
              加到家里现有
            </button>
          </form>
        </Card>

        <InventoryCloudStatus
          cloudSync={cloudSync}
          onOpenUserCenter={onOpenUserCenter}
          pantryItems={pantryItems}
          pantryExpirySummary={pantryExpirySummary}
          onShare={onShare}
        />
      </aside>
    </section>
  );
}

function InventoryMetric({ label, value, hint, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[24px] border border-line bg-white p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:border-ink/24"
    >
      <p className="text-3xl font-black tracking-[-0.04em]">{value}</p>
      <p className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-ink/38">{label}</p>
      {hint && <p className="mt-3 text-xs font-bold text-ink/42">{hint}</p>}
    </button>
  );
}

function PriorityItem({ item }) {
  const tone =
    item.state === "expired"
      ? "border-ink bg-ink text-white"
      : item.state === "soon"
        ? "border-ink bg-ink text-white"
        : "border-line bg-canvas text-ink";
  return (
    <div className={`rounded-[20px] border p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-black">{item.name}</p>
          <p className={`mt-1 text-xs font-bold leading-5 ${item.state === "expired" ? "text-white/60" : "text-ink/48"}`}>
            {item.note}
          </p>
        </div>
        {item.amount && (
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${
            item.state === "expired" ? "bg-white/12 text-white/78" : "bg-white text-ink/58"
          }`}>
            {item.amount}
          </span>
        )}
      </div>
    </div>
  );
}

const InventoryGroup = forwardRef(function InventoryGroup({ title, emptyText, items, onRemove }, ref) {
  return (
    <Card ref={ref}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Pantry</p>
          <h3 className="card-title">{title}</h3>
        </div>
        <span className="rounded-full bg-canvas px-3 py-1 text-xs font-black text-ink/52">
          {items.length} 项
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {items.length > 0 ? (
          items.map((item) => (
            <PantryChip key={item.key} item={item} onRemove={() => onRemove(item.key)} />
          ))
        ) : (
          <HumiEmptyState
            variant={title === "家里现有" ? "pantry" : "empty"}
            title={emptyText}
            text={title === "家里现有" ? "加几样常备食材，推荐和清单会更准。" : "这里会在需要处理时自动提醒。"}
            className="w-full"
          />
        )}
      </div>
    </Card>
  );
});

function InventoryCloudStatus({ cloudSync, onOpenUserCenter, pantryItems, pantryExpirySummary, onShare }) {
  const family = cloudSync?.family;
  const signedIn = Boolean(cloudSync?.signedIn);
  const enabled = Boolean(cloudSync?.enabled);
  const loading = Boolean(cloudSync?.loading);
  const status = loading
    ? "正在保存库存..."
    : family
    ? cloudSync?.status ?? "库存会保存在我的家。"
    : signedIn
    ? "创建我的家后，库存会和清单一起保存。"
    : "库存会先保存在本机。";
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-canvas text-ink">
          <Cloud size={20} />
        </span>
        <div>
          <p className="eyebrow">Save</p>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">
            {enabled ? "已保存到我的家" : family ? "库存待保存" : signedIn ? "还没创建我的家" : "先保存在本机"}
          </h3>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            {status}
          </p>
        </div>
      </div>
      <div className="mt-5 rounded-[22px] bg-canvas p-4">
        <p className="text-sm font-black">{formatPantryCount(pantryItems.length, pantryExpirySummary)}</p>
        <p className="mt-1 text-xs font-bold leading-5 text-ink/45">
          这些会影响今晚推荐和买菜清单。
        </p>
      </div>
      <button
        type="button"
        onClick={onShare}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-black text-white transition hover:-translate-y-0.5"
      >
        <Share2 size={16} className="text-white" />
        分享库存摘要
      </button>
      {family ? (
        <div className="mt-2 grid gap-2">
          <button
            type="button"
            onClick={cloudSync.onMigrate}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            <UploadCloud size={16} />
            {enabled ? "重新保存本机库存" : "保存库存"}
          </button>
          <button
            type="button"
            onClick={cloudSync.onRefresh}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-canvas px-4 text-sm font-black text-ink/62 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <RefreshCw size={15} />
            刷新库存
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpenUserCenter}
          className="mt-4 min-h-11 w-full rounded-full bg-canvas px-4 text-sm font-black text-ink transition hover:-translate-y-0.5"
        >
          {signedIn ? "创建我的家" : "去我的家"}
        </button>
      )}
    </Card>
  );
}
