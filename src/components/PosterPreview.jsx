import { Download, RefreshCw, Share2, X } from "lucide-react";

export function PosterPreview({ poster, loading, onClose, onSave, onShare, onRegenerate }) {
  if (!poster) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/56 px-3 pb-3 pt-10 backdrop-blur-sm md:items-center md:p-6">
      <section className="poster-preview-enter flex max-h-[94vh] w-full max-w-[1040px] flex-col overflow-hidden rounded-t-[32px] bg-canvas shadow-lift md:grid md:max-h-[88vh] md:grid-cols-[minmax(320px,520px)_1fr] md:rounded-[34px]">
        <div className="min-h-0 overflow-auto bg-ink p-4 md:p-6">
          <div className="mx-auto max-w-[390px] overflow-hidden rounded-[28px] bg-white shadow-lift">
            <img
              src={poster.url}
              alt={`${poster.title}海报预览`}
              className="block aspect-[3/4] w-full object-cover"
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-col p-5 md:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Poster</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] md:text-5xl">
                {poster.title}
              </h2>
              <p className="mt-3 text-sm font-bold leading-6 text-ink/52">
                已生成 1080 x 1440 海报，可以直接保存到相册，或打开系统分享面板发给家人。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-ink transition hover:bg-ink hover:text-white"
              aria-label="关闭海报预览"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mt-6 grid gap-3">
            <button
              type="button"
              onClick={onShare}
              disabled={loading}
              className="trend-button flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-acid px-5 text-sm font-black text-ink disabled:cursor-not-allowed disabled:opacity-55"
            >
              <Share2 size={18} />
              分享海报
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={loading}
              className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-black text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <Download size={18} className="text-acid" />
              保存 PNG
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={loading}
              className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-line bg-white px-5 text-sm font-black text-ink/62 transition hover:border-ink/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-55"
            >
              <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
              {poster.refreshLabel ?? "重新生成海报"}
            </button>
          </div>

          <div className="mt-auto hidden rounded-[22px] bg-white p-4 text-sm font-bold leading-6 text-ink/52 md:block">
            小提示：在 iPhone 或微信里打开时，优先使用“分享海报”；如果系统不支持文件分享，就点“保存 PNG”。
          </div>
        </div>
      </section>
    </div>
  );
}
