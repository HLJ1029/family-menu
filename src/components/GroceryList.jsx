import { Check, PackageCheck, Plus, RotateCcw, Share2, Trash2 } from "lucide-react";
import { formatAmount } from "../lib/grocery";
import { Card } from "./ui/Card";

export function GroceryList({
  items,
  groups,
  customItems,
  newCustomItem,
  setNewCustomItem,
  onAddCustomItem,
  onRemoveCustomItem,
  onExcludeItem,
  onRestoreItem,
  onRestoreAllItems,
  onMarkPantryItemsOwned,
  excludedItems,
  onShare,
  checkedItems,
  setCheckedItems,
}) {
  const visibleRecipeItemCount = groups.reduce((total, group) => total + group.items.length, 0);
  const totalItemCount = items.length + customItems.length;
  const pantryCandidateCount = items.filter((item) => item.pantryItem).length;

  function toggle(key) {
    setCheckedItems((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="grid gap-5">
        {groups.length > 0 ? (
          groups.map((group) => (
            <Card key={group.key}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="eyebrow">{group.source}</p>
                  <h3 className="card-title">{group.recipe.name}</h3>
                </div>
                <span className="rounded-full bg-acid px-3 py-1 text-xs font-black">
                  {group.items.length} 项
                </span>
              </div>
              <div className="grid gap-2">
                {group.items.map((item) => (
                  <GroceryItem
                    key={item.key}
                    item={item}
                    checked={checkedItems[item.key]}
                    onToggle={() => toggle(item.key)}
                    onRemove={() => onExcludeItem(item.hiddenKey)}
                  />
                ))}
              </div>
            </Card>
          ))
        ) : (
          <Card>
            <p className="eyebrow">Empty list</p>
            <h3 className="card-title">暂无可购买食材</h3>
            <p className="mt-3 text-sm font-bold leading-6 text-ink/55">
              可以先去菜单库加入菜品，或从右侧恢复“家中已有”的材料。
            </p>
          </Card>
        )}

        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Manual list</p>
              <h3 className="card-title">手动添加</h3>
            </div>
            <Plus size={20} />
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onAddCustomItem(newCustomItem);
            }}
          >
            <input
              value={newCustomItem}
              onChange={(event) => setNewCustomItem(event.target.value)}
              className="min-w-0 flex-1 rounded-full border border-line bg-canvas px-4 py-3 text-sm font-bold outline-none focus:border-ink/30"
              placeholder="例如：厨房纸、牛奶、保鲜袋"
            />
            <button type="submit" className="rounded-full bg-ink px-5 text-sm font-black text-white">
              添加
            </button>
          </form>
          <div className="mt-4 grid gap-2">
            {customItems.map((item) => (
              <div key={item.key} className="flex items-center gap-3 rounded-[18px] border border-line bg-canvas p-3">
                <span className="flex-1 font-black">{item.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveCustomItem(item.key)}
                  className="grid h-9 w-9 place-items-center rounded-full bg-white text-ink/55 transition hover:text-ink"
                  aria-label={`删除 ${item.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <p className="eyebrow">Auto merged</p>
        <h3 className="card-title">合并采购清单</h3>
        <p className="mt-4 text-sm leading-7 text-ink/56">
          重复食材会合并数量，常备调料排在后面；买菜时优先看这里，也可以把家里已有的材料移出清单。
        </p>
        <div className="mt-6 rounded-[22px] bg-ink p-5 text-white">
          <p className="text-5xl font-black tracking-[-0.05em]">{totalItemCount}</p>
          <p className="mt-1 text-sm font-bold text-white/56">merged grocery items</p>
        </div>
        <div className="mt-5 rounded-[22px] border border-line bg-canvas p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-ink">
              <PackageCheck size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black">家中已有</p>
              <p className="mt-1 text-xs font-bold leading-5 text-ink/48">
                盐、油、酱油这类常备调料通常不用再买，可以一键移到恢复区。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onMarkPantryItemsOwned}
            disabled={pantryCandidateCount === 0}
            className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-black text-ink transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <PackageCheck size={16} />
            {pantryCandidateCount > 0 ? `移出 ${pantryCandidateCount} 个常备项` : "常备项已处理"}
          </button>
        </div>
        <div className="mt-5 grid gap-2">
          {items.length > 0 ? (
            items.map((item) => (
              <MergedGroceryItem
                key={item.key}
                item={item}
                checked={checkedItems[item.key]}
                onToggle={() => toggle(item.key)}
                onRemove={() => onExcludeItem(item.hiddenKey)}
              />
            ))
          ) : (
            <div className="rounded-[20px] border border-line bg-canvas p-4 text-sm font-bold text-ink/50">
              暂无合并项。先去菜单库或一周计划添加菜品。
            </div>
          )}
        </div>
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={onShare}
            className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-acid px-4 text-sm font-black text-ink transition hover:-translate-y-0.5"
          >
            <Share2 size={17} />
            分享 / 复制清单
          </button>
          <div className="rounded-[20px] border border-line bg-canvas p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">Preview card</p>
            <p className="mt-2 text-sm font-bold leading-6 text-ink/62">
              左侧保留按菜拆分，共 {visibleRecipeItemCount} 个明细项，适合做饭前逐菜确认。
            </p>
          </div>
        </div>
        {excludedItems.length > 0 && (
          <div className="mt-6 rounded-[22px] border border-line bg-canvas p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">Already at home</p>
                <p className="mt-1 text-sm font-black">家中已有材料</p>
              </div>
              <button
                type="button"
                onClick={onRestoreAllItems}
                className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-black text-ink transition hover:-translate-y-0.5"
              >
                <RotateCcw size={13} />
                全部恢复
              </button>
            </div>
            <div className="grid gap-2">
              {excludedItems.map((item) => (
                <div key={item.key} className="flex items-center gap-2 rounded-[16px] bg-white p-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink/58">
                    {item.name} {formatAmount(item)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRestoreItem(item.hiddenKey)}
                    className="rounded-full bg-acid px-3 py-2 text-xs font-black text-ink"
                  >
                    恢复
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

function GroceryItem({ item, checked, onToggle, onRemove }) {
  return (
    <div className="flex items-center gap-2 rounded-[18px] border border-line bg-canvas p-3 transition hover:border-ink/20">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={Boolean(checked)} onChange={onToggle} className="peer sr-only" />
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-ink/18 bg-white peer-checked:border-ink peer-checked:bg-ink peer-checked:text-acid">
          {checked && <Check size={15} />}
        </span>
        <span className={`min-w-0 flex-1 font-black ${checked ? "text-ink/35 line-through" : ""}`}>
          {item.name}
          {item.pantryItem && <em className="ml-2 text-xs not-italic text-ink/38">常备</em>}
          {item.required === false && <em className="ml-2 text-xs not-italic text-ink/38">可选</em>}
        </span>
        <span className="shrink-0 font-black text-ink/66">{formatAmount(item)}</span>
      </label>
      <button
        type="button"
        onClick={onRemove}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-ink/45 transition hover:bg-ink hover:text-white"
        aria-label={`${item.name} 家中已有`}
      >
        <PackageCheck size={15} />
      </button>
    </div>
  );
}

function MergedGroceryItem({ item, checked, onToggle, onRemove }) {
  return (
    <div className="flex items-center gap-2 rounded-[18px] border border-line bg-canvas p-3 transition hover:border-ink/20">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={Boolean(checked)} onChange={onToggle} className="peer sr-only" />
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-ink/18 bg-white peer-checked:border-ink peer-checked:bg-ink peer-checked:text-acid">
          {checked && <Check size={15} />}
        </span>
        <span className={`min-w-0 flex-1 ${checked ? "text-ink/35 line-through" : ""}`}>
          <span className="block truncate text-sm font-black">{item.name}</span>
          <span className="mt-0.5 block text-xs font-bold text-ink/42">
            {item.type === "seasoning" ? "调料" : "食材"}
            {item.pantryItem ? " · 常备" : ""}
            {item.required === false ? " · 可选" : ""}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-black text-ink/66">
          {formatAmount(item)}
        </span>
      </label>
      <button
        type="button"
        onClick={onRemove}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-ink/45 transition hover:bg-ink hover:text-white"
        aria-label={`${item.name} 家中已有`}
      >
        <PackageCheck size={15} />
      </button>
    </div>
  );
}
