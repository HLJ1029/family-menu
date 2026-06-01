import { Cloud, ShoppingBasket, UploadCloud } from "lucide-react";

export function CloudSyncPanel({
  family,
  cloudMenuEnabled,
  cloudMenuLoading,
  cloudSyncStatus,
  onMigrateLocalMenus,
  onRefreshCloudMenus,
  cloudGroceryEnabled,
  cloudGroceryLoading,
  cloudGroceryStatus,
  onMigrateLocalGrocery,
  onRefreshCloudGrocery,
}) {
  if (!family) return null;

  return (
    <section className="grid gap-4">
      <SyncCard
        icon={Cloud}
        eyebrow="Cloud menu sync"
        title="今日菜单和一周计划"
        description={
          cloudMenuEnabled
            ? `${family.name} 已启用云端菜单同步。`
            : "先把本地菜单迁移到家庭空间，之后会自动同步。"
        }
        loading={cloudMenuLoading}
        status={cloudSyncStatus}
        primaryLabel="迁移本地菜单"
        secondaryLabel="从云端刷新"
        onPrimary={onMigrateLocalMenus}
        onSecondary={onRefreshCloudMenus}
      />
      <SyncCard
        icon={ShoppingBasket}
        eyebrow="Cloud grocery sync"
        title="食材清单和厨房库存"
        description={
          cloudGroceryEnabled
            ? "手动清单、勾选状态、家中已有材料和厨房库存会自动同步。"
            : "菜单迁移后，继续把买菜时会改动的清单状态迁移到云端。"
        }
        loading={cloudGroceryLoading}
        status={cloudGroceryStatus}
        primaryLabel="迁移食材清单"
        secondaryLabel="刷新食材清单"
        onPrimary={onMigrateLocalGrocery}
        onSecondary={onRefreshCloudGrocery}
      />
    </section>
  );
}

function SyncCard({
  icon: Icon,
  eyebrow,
  title,
  description,
  loading,
  status,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}) {
  return (
    <section className="rounded-[28px] border border-line bg-white p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink text-acid">
          <Icon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{eyebrow}</p>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">{title}</h3>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">{description}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onPrimary}
          disabled={loading}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-acid px-5 text-sm font-black text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          <UploadCloud size={17} />
          {primaryLabel}
        </button>
        <button
          type="button"
          onClick={onSecondary}
          disabled={loading}
          className="min-h-12 rounded-full border border-line bg-canvas px-5 text-sm font-black text-ink/62 transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {secondaryLabel}
        </button>
      </div>

      <p className="mt-4 rounded-[20px] bg-canvas p-4 text-xs font-bold leading-5 text-ink/50">
        {loading ? "正在同步..." : status}
      </p>
    </section>
  );
}
