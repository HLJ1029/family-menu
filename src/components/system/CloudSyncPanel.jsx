import { Cloud, UploadCloud } from "lucide-react";

export function CloudSyncPanel({
  family,
  cloudMenuEnabled,
  cloudMenuLoading,
  cloudSyncStatus,
  onMigrateLocalMenus,
  onRefreshCloudMenus,
}) {
  if (!family) return null;

  return (
    <section className="rounded-[28px] border border-line bg-white p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink text-acid">
          <Cloud size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Cloud menu sync</p>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">
            今日菜单和一周计划
          </h3>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            {cloudMenuEnabled
              ? `${family.name} 已启用云端菜单同步。`
              : "先把本地菜单迁移到家庭空间，之后会自动同步。"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onMigrateLocalMenus}
          disabled={cloudMenuLoading}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-acid px-5 text-sm font-black text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          <UploadCloud size={17} />
          迁移本地菜单
        </button>
        <button
          type="button"
          onClick={onRefreshCloudMenus}
          disabled={cloudMenuLoading}
          className="min-h-12 rounded-full border border-line bg-canvas px-5 text-sm font-black text-ink/62 transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          从云端刷新
        </button>
      </div>

      <p className="mt-4 rounded-[20px] bg-canvas p-4 text-xs font-bold leading-5 text-ink/50">
        {cloudMenuLoading ? "正在同步菜单..." : cloudSyncStatus}
      </p>
    </section>
  );
}
