import { useMemo, useState } from "react";
import { Check, ChevronDown, HandCoins, PackageCheck, Plus, RotateCcw, Share2, Trash2 } from "lucide-react";
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
  excludedItems,
  onShare,
  checkedItems,
  groceryClaims = {},
  setCheckedItems,
  onToggleClaim,
  currentMemberId,
  onGroceryItemChecked,
}) {
  const totalItemCount = items.length + customItems.length;
  const checklistItems = [...items, ...customItems];
  const checkedItemCount = checklistItems.filter((item) => checkedItems[item.key]).length;
  const daySections = useMemo(() => buildDaySections(groups), [groups]);
  const shoppingSections = useMemo(() => buildShoppingSections(items), [items]);
  const [openSections, setOpenSections] = useState({});

  function toggle(itemOrKey) {
    const key = typeof itemOrKey === "string" ? itemOrKey : itemOrKey?.key;
    if (!key) return;
    setCheckedItems((current) => {
      const checked = !current[key];
      onGroceryItemChecked?.({ key, checked, item: typeof itemOrKey === "object" ? itemOrKey : undefined });
      return { ...current, [key]: checked };
    });
  }

  function toggleSection(key) {
    setOpenSections((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <section className="grid gap-5">
      <div className="grid gap-5">
        <ShoppingChecklist
          sections={shoppingSections}
          customItems={customItems}
          totalItemCount={totalItemCount}
          checkedItems={checkedItems}
          groceryClaims={groceryClaims}
          checkedItemCount={checkedItemCount}
          onToggleItem={toggle}
          onToggleClaim={onToggleClaim}
          currentMemberId={currentMemberId}
          onRemoveItem={onExcludeItem}
          onRemoveCustomItem={onRemoveCustomItem}
          onShare={onShare}
        />

        {daySections.length > 0 ? (
          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">按菜单核对</p>
                <h3 className="card-title">每顿饭需要什么</h3>
              </div>
              <span className="rounded-full bg-canvas px-3 py-1 text-xs font-black text-ink/52">
                {daySections.length} 天
              </span>
            </div>
            <div className="grid gap-3">
              {daySections.map((section) => (
                <DayGrocerySection
                  key={section.key}
                  section={section}
                  open={Boolean(openSections[section.key])}
                  onToggle={() => toggleSection(section.key)}
                  checkedItems={checkedItems}
                  onToggleItem={toggle}
                  onRemoveItem={onExcludeItem}
                />
              ))}
            </div>
          </Card>
        ) : (
          <Card>
            <NeutralEmptyState
              title="还没有需要核对的食材"
              text="先回【今晚】安排一顿，清单会自动出现在这里。"
            />
          </Card>
        )}

        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">顺手补充</p>
              <h3 className="card-title">临时加一项</h3>
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
            <button type="submit" className="rounded-full border border-line bg-white px-5 text-sm font-black text-ink">
              添加
            </button>
          </form>
        </Card>
        {excludedItems.length > 0 && (
          <Card>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">这次不用买</p>
                <p className="mt-1 text-sm font-black">已从清单移出的食材</p>
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
                    onClick={() => onRestoreItem(item)}
                    className="rounded-full border border-line bg-white px-3 py-2 text-xs font-black text-ink"
                  >
                    恢复
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </section>
  );
}

function buildShoppingSections(items) {
  const ingredientItems = items.filter((item) => item.type !== "seasoning" && !item.pantryItem);
  const seasoningItems = items.filter((item) => item.type === "seasoning" || item.pantryItem);
  return [
    {
      key: "ingredients",
      title: "要买的食材",
      note: "按买菜习惯勾选，数量只做大致参考。",
      items: ingredientItems,
    },
    {
      key: "seasonings",
      title: "调料和常备",
      note: "家里有就不用买，做饭前确认一下。",
      items: seasoningItems,
    },
  ].filter((section) => section.items.length > 0);
}

function ShoppingChecklist({
  sections,
  customItems,
  totalItemCount,
  checkedItemCount,
  checkedItems,
  groceryClaims,
  onToggleItem,
  onToggleClaim,
  currentMemberId,
  onRemoveItem,
  onRemoveCustomItem,
  onShare,
}) {
  const [openSections, setOpenSections] = useState({ ingredients: true, seasonings: false, custom: true });
  const progress = totalItemCount > 0 ? Math.round((checkedItemCount / totalItemCount) * 100) : 0;

  function toggleSection(key) {
    setOpenSections((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">买菜清单</p>
          <h3 className="card-title">去买这些就够了</h3>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            这里汇总已安排三餐要买的食材；买到后勾一下，进度会自动更新。
          </p>
        </div>
        <span key={checkedItemCount} className="grocery-count-pop min-w-[118px] shrink-0 whitespace-nowrap rounded-full bg-canvas px-4 py-2 text-center text-xs font-black leading-none text-ink/55">
          已完成 {checkedItemCount}/{totalItemCount}
        </span>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-canvas">
        <div
          className="grocery-progress-fill h-full rounded-full bg-ink"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-5 grid gap-4">
        {sections.length > 0 ? (
          sections.map((section) => (
            <CollapsibleChecklistSection
              key={section.key}
              title={section.title}
              note={section.note}
              count={section.items.length}
              open={Boolean(openSections[section.key])}
              onToggle={() => toggleSection(section.key)}
            >
              {section.items.map((item) => (
                <ShoppingItem
                  key={item.key}
                  item={item}
                  checked={checkedItems[item.key]}
                  claim={groceryClaims[item.key]}
                  currentMemberId={currentMemberId}
                  onToggle={() => onToggleItem(item)}
                  onToggleClaim={() => onToggleClaim?.(item)}
                  onRemove={() => onRemoveItem(item)}
                />
              ))}
            </CollapsibleChecklistSection>
          ))
        ) : (
          <NeutralEmptyState title="清单还空着" text="先安排一顿饭，食材会自动按买菜习惯分好类。" />
        )}

        {customItems.length > 0 && (
          <CollapsibleChecklistSection
            title="顺手买"
            note="不是菜谱必需，但这趟可以一起带上。"
            count={customItems.length}
            open={Boolean(openSections.custom)}
            onToggle={() => toggleSection("custom")}
          >
            {customItems.map((item) => (
              <ShoppingItem
                key={item.key}
                item={{ ...item, amount: item.amount ?? "自定义" }}
                checked={checkedItems[item.key]}
                claim={groceryClaims[item.key]}
                currentMemberId={currentMemberId}
                onToggle={() => onToggleItem(item)}
                onToggleClaim={() => onToggleClaim?.(item)}
                onRemove={() => onRemoveCustomItem(item.key)}
                removeLabel={`删除 ${item.name}`}
                actionIcon={Trash2}
              />
            ))}
          </CollapsibleChecklistSection>
        )}
      </div>

      <button
        type="button"
        onClick={onShare}
        className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-black text-white transition hover:-translate-y-0.5"
      >
        <Share2 size={17} />
        分享买菜清单
      </button>
    </Card>
  );
}

function CollapsibleChecklistSection({ title, note, count, open, onToggle, children }) {
  return (
    <div className="rounded-[22px] border border-line bg-canvas p-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span>
          <span className="block text-base font-black">{title}</span>
          <span className="mt-1 block text-xs font-bold leading-5 text-ink/45">{note}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-ink/52">{count} 项</span>
          <span className={`grid h-9 w-9 place-items-center rounded-full bg-white transition ${open ? "rotate-180" : ""}`}>
            <ChevronDown size={17} />
          </span>
        </span>
      </button>
      <div className="collapse-grid" data-open={open}>
        <div className="grid gap-2">{children}</div>
      </div>
    </div>
  );
}

function buildDaySections(groups) {
  const sections = new Map();
  groups.forEach((group) => {
    const title = formatSectionTitle(group.source);
    const current = sections.get(title) ?? {
      key: title,
      title,
      recipes: [],
      itemCount: 0,
    };
    current.recipes.push(group);
    current.itemCount += group.items.length;
    sections.set(title, current);
  });
  return [...sections.values()];
}

function formatSectionTitle(source) {
  return source.split(" · ")[0] || source;
}

function DayGrocerySection({ section, open, onToggle, checkedItems, onToggleItem, onRemoveItem }) {
  const recipeNames = section.recipes.map((group) => group.recipe.name).join("、");

  return (
    <div className="rounded-[22px] border border-line bg-canvas p-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="eyebrow">{section.title}</p>
          <h3 className="truncate text-2xl font-black tracking-[-0.03em]">
            {section.recipes.length} 道菜
          </h3>
          <p className="mt-2 line-clamp-1 text-sm font-bold text-ink/48">{recipeNames}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-ink px-3 py-1 text-xs font-black">
            {section.itemCount} 项
          </span>
          <span className={`grid h-10 w-10 place-items-center rounded-full bg-canvas transition ${open ? "rotate-180" : ""}`}>
            <ChevronDown size={18} />
          </span>
        </div>
      </button>

      <div className="collapse-grid" data-open={open}>
        <div className="grid gap-4">
          {section.recipes.map((group) => (
            <div key={group.key} className="rounded-[22px] border border-line bg-canvas p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-black">{group.recipe.name}</p>
                  {group.source !== section.title && (
                    <p className="mt-1 text-xs font-bold text-ink/42">{group.source}</p>
                  )}
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-ink/48">
                  {group.items.length} 项
                </span>
              </div>
              <div className="grid gap-2">
                {group.items.map((item) => (
                  <GroceryItem
                    key={item.key}
                    item={item}
                    checked={checkedItems[item.key]}
                    onToggle={() => onToggleItem(item)}
                    onRemove={() => onRemoveItem(item)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GroceryItem({ item, checked, onToggle, onRemove }) {
  return (
    <div
      className="grocery-item-enter flex items-center gap-2 rounded-[18px] border border-line bg-canvas p-3 transition hover:border-ink/20"
      data-checked={Boolean(checked)}
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={Boolean(checked)} onChange={onToggle} className="peer sr-only" />
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-ink/18 bg-white transition peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white">
          {checked && <Check size={15} className="check-pop" />}
        </span>
        <span className="min-w-0 flex-1 font-black">
          <span className="strike-text" data-checked={Boolean(checked)}>
            {item.name}
          </span>
          {item.pantryItem && <em className="ml-2 text-xs not-italic text-ink/38">常备</em>}
          {item.required === false && <em className="ml-2 text-xs not-italic text-ink/38">可选</em>}
        </span>
        <span className="shrink-0 font-black text-ink/66">{formatAmount(item)}</span>
      </label>
      <button
        type="button"
        onClick={onRemove}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-ink/45 transition hover:bg-ink hover:text-white"
        aria-label={`${item.name} 这次不用买`}
      >
        <PackageCheck size={15} />
      </button>
    </div>
  );
}

function ShoppingItem({
  item,
  checked,
  claim,
  currentMemberId,
  onToggle,
  onToggleClaim,
  onRemove,
  removeLabel,
  actionIcon: ActionIcon = PackageCheck,
}) {
  const claimState = getClaimState(claim, currentMemberId);
  return (
    <div
      className="grocery-item-enter grid gap-2 rounded-[18px] border border-line bg-canvas p-3 transition hover:border-ink/20"
      data-checked={Boolean(checked)}
    >
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
          <input type="checkbox" checked={Boolean(checked)} onChange={onToggle} className="peer sr-only" />
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-ink/18 bg-white transition peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white">
            {checked && <Check size={15} className="check-pop" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="strike-text max-w-full truncate text-sm font-black" data-checked={Boolean(checked)}>
              {item.name}
            </span>
            <span className="mt-0.5 block text-xs font-bold text-ink/42">
              {item.type === "seasoning" ? "调料" : "食材"}
              {item.pantryItem ? " · 常备" : ""}
              {item.required === false ? " · 可选" : ""}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-black text-ink/66">
            {formatShoppingAmount(item)}
          </span>
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-ink/45 transition hover:bg-ink hover:text-white"
          aria-label={removeLabel ?? `${item.name} 这次不用买`}
        >
          <ActionIcon size={15} />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-[14px] bg-white px-3 py-2">
        <span className="min-w-0 truncate text-xs font-black text-ink/52">
          {claimState.label}
        </span>
        <button
          type="button"
          onClick={onToggleClaim}
          disabled={!onToggleClaim || claimState.disabled}
          className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border border-line bg-white px-3 text-xs font-black text-ink transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink/35"
        >
          <HandCoins size={13} />
          {claimState.action}
        </button>
      </div>
    </div>
  );
}

function getClaimState(claim, currentMemberId) {
  if (!claim) {
    return { label: "还没人认领", action: "我来买", disabled: false };
  }
  if (claim.status === "done") {
    const mine = claim.memberId === currentMemberId;
    return {
      label: `${claim.memberName || "家人"}已买到`,
      action: mine ? "撤销" : "已完成",
      disabled: !mine,
    };
  }
  const mine = claim.memberId === currentMemberId;
  return {
    label: `${claim.memberName || "家人"}在买`,
    action: mine ? "买到了" : "已认领",
    disabled: !mine,
  };
}

function formatShoppingAmount(item) {
  if (item.type === "seasoning" || item.pantryItem) return "家里确认";
  if (typeof item.amount !== "number") return item.amount;
  if (["个", "颗", "根", "只", "块", "片"].includes(item.unit)) return `${item.amount}${item.unit}左右`;
  return `约 ${formatAmount(item)}`;
}

function NeutralEmptyState({ title, text }) {
  return (
    <div className="py-2 text-left">
      <p className="text-base font-black text-ink/55">{title}</p>
      <p className="mt-1 text-sm font-bold leading-6 text-ink/38">{text}</p>
    </div>
  );
}
