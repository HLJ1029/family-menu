import { CheckCircle2, ExternalLink, MonitorSmartphone, Share, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const productionUrl = "https://hlj1029.github.io/family-menu/";

export function PwaLaunchPanel({ compact = false }) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    setIsStandalone(standalone);
    setInstalled(standalone);

    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }

    function handleAppInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const installState = useMemo(() => {
    if (installed || isStandalone) return "已通过主屏幕应用模式打开。";
    if (installPrompt) return "当前浏览器支持一键安装。";
    return "iPhone Safari 请使用分享按钮添加到主屏幕。";
  }, [installPrompt, installed, isStandalone]);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  }

  return (
    <section className={`rounded-[28px] border border-line bg-white shadow-card ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink text-acid">
          <MonitorSmartphone size={20} />
        </span>
        <div>
          <p className="eyebrow">PWA launch</p>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">移动端上线检查</h3>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">{installState}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <LaunchCheck label="线上地址已固定" value={productionUrl} />
        <LaunchCheck label="主屏幕安装" value="Safari 分享按钮 -> 添加到主屏幕" />
        <LaunchCheck label="离线壳" value="断网后仍可打开 FamilyOS 壳" />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {installPrompt ? (
          <button
            type="button"
            onClick={installApp}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-acid px-4 text-sm font-black text-ink transition hover:-translate-y-0.5"
          >
            <Smartphone size={16} />
            安装 FamilyOS
          </button>
        ) : (
          <div className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-canvas px-4 text-sm font-black text-ink/58">
            <Share size={16} />
            添加到主屏幕
          </div>
        )}
        <a
          href={productionUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-black text-ink/62 transition hover:text-ink"
        >
          <ExternalLink size={16} />
          打开线上版
        </a>
      </div>
    </section>
  );
}

function LaunchCheck({ label, value }) {
  return (
    <div className="flex items-start gap-2 rounded-[18px] bg-canvas p-3">
      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ink" />
      <div className="min-w-0">
        <p className="text-xs font-black text-ink/42">{label}</p>
        <p className="mt-1 break-words text-xs font-bold leading-5 text-ink/58">{value}</p>
      </div>
    </div>
  );
}
