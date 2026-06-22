import { useEffect } from "react";
import { Download, RefreshCw, Share2, X } from "lucide-react";

export function PosterPreview({ poster, loading, onClose, onSave, onShare, onRegenerate }) {
  useEffect(() => {
    if (!poster) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, poster]);

  if (!poster) return null;
  const ready = Boolean(poster.url);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/56 px-3 pb-3 pt-10 backdrop-blur-sm md:items-center md:p-6"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="fixed right-4 top-[calc(1rem+env(safe-area-inset-top))] z-[55] grid h-11 w-11 place-items-center rounded-full bg-white text-ink shadow-lift transition hover:bg-ink hover:text-white"
        aria-label="关闭海报预览"
      >
        <X size={20} />
      </button>
      <section
        className="poster-preview-enter flex max-h-[94vh] w-full max-w-[1040px] flex-col overflow-hidden rounded-t-[32px] bg-canvas shadow-lift md:grid md:max-h-[88vh] md:grid-cols-[minmax(320px,520px)_1fr] md:rounded-[34px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="min-h-0 overflow-auto bg-ink p-4 md:p-6">
          <div className="mx-auto max-w-[390px] overflow-hidden rounded-[28px] bg-white shadow-lift">
            {ready ? (
              <img
                src={poster.url}
                alt={`${poster.title}海报预览`}
                className="block aspect-[3/4] w-full object-cover"
              />
            ) : (
              <div className="grid aspect-[3/4] w-full place-items-center bg-canvas p-8">
                <div className="grid justify-items-center gap-5 text-center">
                  <div className="relative h-20 w-20">
                    <div className="absolute inset-0 rounded-full border-[10px] border-ink/10" />
                    <div className="absolute inset-0 animate-spin rounded-full border-[10px] border-transparent border-t-acid" />
                  </div>
                  <div>
                    <p className="text-2xl font-black tracking-[-0.04em] text-ink">正在生成海报</p>
                    <p className="mt-2 text-sm font-bold leading-6 text-ink/50">
                      第一次加载菜图会慢一点。
                    </p>
                  </div>
                </div>
              </div>
            )}
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
                {ready
                  ? "已生成 1080 x 1440 海报，可以直接保存到相册，或打开系统分享面板发给家人。"
                  : "Humi 正在把菜单和图片排成 1080 x 1440 海报。"}
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
              disabled={loading || !ready}
              className="trend-button flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-acid px-5 text-sm font-black text-ink disabled:cursor-not-allowed disabled:opacity-55"
            >
              <Share2 size={18} />
              分享海报
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={loading || !ready}
              className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-black text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <Download size={18} className="text-acid" />
              保存 PNG
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={loading || !ready}
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
