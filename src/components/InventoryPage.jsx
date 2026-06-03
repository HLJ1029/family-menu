import { Cloud, PackageCheck, Plus, RefreshCw, Share2, UploadCloud } from "lucide-react";
import { formatPantryCount, getExpiryState } from "../lib/pantry";
import { Card } from "./ui/Card";
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
}) {
  const expiredItems = pantryItems.filter((item) => getExpiryState(item.expiresOn) === "expired");
  const expiringItems = pantryItems.filter((item) => getExpiryState(item.expiresOn) === "soon");
  const freshItems = pantryItems.filter((item) => !["expired", "soon"].includes(getExpiryState(item.expiresOn)));

  function submitPantryItem(event) {
    event.preventDefault();
    onAddPantryItem({
      name: newPantryItem,
      amount: newPantryAmount,
      expiresOn: newPantryExpiresOn,
    });
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <div className="grid gap-5">
        <section className="rounded-[32px] bg-ink p-6 text-white shadow-lift md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.24em] text-acid">Pantry</p>
          <h2 className="mt-4 max-w-3xl text-4xl font-black tracking-[-0.04em] md:text-6xl">
            家里有什么，先看一眼。
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-white/62">
            买菜前先看看家里现有的，快到期的也别忘了吃掉。
          </p>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <InventoryMetric label="家里现有" value={`${pantryItems.length} 项`} />
          <InventoryMetric label="快到期" value={`${pantryExpirySummary.expiringCount ?? 0} 项`} />
          <InventoryMetric label="已过期" value={`${pantryExpirySummary.expiredCount ?? 0} 项`} />
        </div>

        <InventoryGroup
          title="先吃掉"
          emptyText="暂时没有快到期的。"
          items={expiringItems}
          onRemove={onRemovePantryItem}
        />
        <InventoryGroup
          title="已过期"
          emptyText="暂无已过期库存。"
          items={expiredItems}
          onRemove={onRemovePantryItem}
        />
        <InventoryGroup
          title="家里现有"
          emptyText="还没记录家里有什么。"
          items={freshItems}
          onRemove={onRemovePantryItem}
        />
      </div>

      <aside className="grid content-start gap-5">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Add item</p>
              <h3 className="card-title">记一笔库存</h3>
            </div>
            <Plus size={22} />
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
              <input
                value={newPantryExpiresOn}
                onChange={(event) => setNewPantryExpiresOn(event.target.value)}
                type="date"
                aria-label="到期日"
                className="min-h-12 rounded-full border border-line bg-canvas px-4 text-sm font-bold outline-none focus:border-ink/30"
              />
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

function InventoryMetric({ label, value }) {
  return (
    <div className="rounded-[24px] border border-line bg-white p-5 shadow-card">
      <p className="text-3xl font-black tracking-[-0.04em]">{value}</p>
      <p className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-ink/38">{label}</p>
    </div>
  );
}

function InventoryGroup({ title, emptyText, items, onRemove }) {
  return (
    <Card>
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
          <p className="text-sm font-bold leading-6 text-ink/48">{emptyText}</p>
        )}
      </div>
    </Card>
  );
}

function InventoryCloudStatus({ cloudSync, onOpenUserCenter, pantryItems, pantryExpirySummary, onShare }) {
  const family = cloudSync?.family;
  const enabled = Boolean(cloudSync?.enabled);
  const loading = Boolean(cloudSync?.loading);
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-canvas text-ink">
          <Cloud size={20} />
        </span>
        <div>
          <p className="eyebrow">Save</p>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">
            {enabled ? "已保存到我的家" : family ? "库存待保存" : "先保存在本机"}
          </h3>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            {loading ? "正在保存库存..." : cloudSync?.status ?? "库存会先保存在本机。"}
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
        <Share2 size={16} className="text-acid" />
        分享库存摘要
      </button>
      {family ? (
        <div className="mt-2 grid gap-2">
          <button
            type="button"
            onClick={cloudSync.onMigrate}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-acid px-4 text-sm font-black text-ink disabled:cursor-not-allowed disabled:opacity-45"
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
          去我的家登录
        </button>
      )}
    </Card>
  );
}
