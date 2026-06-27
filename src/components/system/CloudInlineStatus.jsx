import { Cloud, RefreshCw, UploadCloud } from "lucide-react";

export function CloudInlineStatus({
  family,
  signedIn = false,
  enabled,
  loading,
  status,
  localLabel,
  pendingLabel,
  enabledLabel,
  migrateLabel,
  refreshLabel = "从云端刷新",
  onMigrate,
  onRefresh,
  onOpenUserCenter,
}) {
  return (
    <div className="rounded-[22px] border border-line bg-white p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-canvas text-ink">
          <Cloud size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">Save</p>
          <p className="mt-1 text-sm font-black">
            {enabled ? enabledLabel : family ? pendingLabel : signedIn ? "还没创建我的家" : localLabel}
          </p>
          <p className="mt-2 text-xs font-bold leading-5 text-ink/48">
            {loading ? "正在保存..." : status}
          </p>
        </div>
      </div>

      {family ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onMigrate}
            disabled={loading}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-black text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <UploadCloud size={16} />
            {migrateLabel}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-line bg-canvas px-4 text-sm font-black text-ink/60 transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
          >
            <RefreshCw size={15} />
            {refreshLabel}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpenUserCenter}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-canvas px-4 text-sm font-black text-ink transition hover:-translate-y-0.5"
        >
          {signedIn ? "创建我的家" : "去我的家"}
        </button>
      )}
    </div>
  );
}
