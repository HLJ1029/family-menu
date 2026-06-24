import { WifiOff } from "lucide-react";

export function OfflineStatus({ online }) {
  if (online) return null;

  return (
    <div className="fixed inset-x-4 top-4 z-[80] flex items-center gap-3 rounded-[20px] border border-line bg-white px-4 py-3 text-sm font-black text-ink shadow-lift">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-ink text-white">
        <WifiOff size={17} />
      </span>
      当前离线，Humi 会先保留页面；重新联网后继续保存菜单和清单。
    </div>
  );
}
