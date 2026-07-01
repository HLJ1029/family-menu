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
        eyebrow="Save"
        title="今晚菜单和一周计划"
        description={
          cloudMenuEnabled
            ? `${family.name} 已经记住这些菜单。`
            : "把本机菜单保存到我的家，之后换设备也能继续看。"
        }
        loading={cloudMenuLoading}
        status={cloudSyncStatus}
        primaryLabel="保存本机菜单"
        secondaryLabel="刷新菜单"
        onPrimary={onMigrateLocalMenus}
        onSecondary={onRefreshCloudMenus}
      />
      <SyncCard
        icon={ShoppingBasket}
        eyebrow="Save"
        title="食材清单和后台已有"
        description={
          cloudGroceryEnabled
            ? "买菜勾选和家里现有会在后台记住。"
            : "菜单保存后，再把买菜时会改动的清单也保存起来。"
        }
        loading={cloudGroceryLoading}
        status={cloudGroceryStatus}
        primaryLabel="保存食材清单"
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
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink text-white">
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
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
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
        {loading ? "正在保存..." : status}
      </p>
    </section>
  );
}
