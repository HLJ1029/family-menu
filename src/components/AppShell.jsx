import { ChefHat, Search, UserRound } from "lucide-react";
import { isWechatMiniProgramWebView } from "../lib/runtime";
import { getNavItem, mobileNavItems, navItems } from "./navigation";
import { DoodlePot } from "./ui/Doodles";

export function Sidebar({ activeView, onChange }) {
  return (
    <aside className="sticky top-6 hidden h-[calc(100vh-48px)] w-72 shrink-0 flex-col rounded-[28px] border border-line/80 bg-white/78 p-5 shadow-card backdrop-blur-xl lg:flex">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-acid">
          <ChefHat size={22} />
        </div>
        <div>
          <p className="text-2xl font-black tracking-tight">Humi</p>
          <p className="-mt-0.5 text-xs font-black text-ink/45">让每顿饭都有安排</p>
        </div>
      </div>
      <nav className="space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeView;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`group flex w-full items-center gap-3 rounded-[20px] px-4 py-3 text-left text-sm font-bold transition ${
                active ? "nav-tab-active bg-ink text-white" : "text-ink/62 hover:bg-ink/[0.04] hover:text-ink"
              }`}
            >
              <Icon size={19} className={active ? "text-acid" : "text-ink/48 group-hover:text-ink"} />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto rounded-[24px] border border-line bg-canvas p-4">
        <DoodlePot />
        <p className="mt-4 text-sm font-black">家里的饭，慢慢记住</p>
        <p className="mt-1 text-xs leading-5 text-ink/52">
          从今晚吃什么，到买菜清单和家里库存，都帮你顺一顺。
        </p>
      </div>
    </aside>
  );
}

export function AccountAvatar({ session, onClick, compact = false }) {
  const email = session?.user?.email;
  const displayName = session?.user?.displayName;
  const initial = email ? email.slice(0, 1).toUpperCase() : displayName ? displayName.slice(0, 1) : "";
  const isWechatMiniProgram = isWechatMiniProgramWebView();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`motion-card grid shrink-0 place-items-center rounded-full border border-line bg-white text-sm font-black text-ink shadow-card transition hover:-translate-y-0.5 ${
        compact ? "h-11 w-11" : "h-12 w-12"
      }`}
      aria-label={email || displayName || isWechatMiniProgram ? "打开我的家" : "登录并保存我的 Humi"}
    >
      {initial ? initial : <UserRound size={19} />}
    </button>
  );
}

export function Topbar({ activeView, query, setQuery, session, onOpenUserCenter }) {
  const activeItem = getNavItem(activeView);
  const title = activeItem?.label ?? "Humi";

  return (
    <header className="mb-5 flex flex-col gap-4 lg:mb-7 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-ink/45">
          <span className="h-2 w-2 rounded-full bg-acid" />
          Humi
        </div>
        <h1 className="mt-2 max-w-3xl text-5xl font-black tracking-[-0.04em] md:text-7xl">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3 rounded-[22px] border border-line bg-white px-4 py-3 shadow-card lg:w-[390px]">
          <Search size={18} className="text-ink/38" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-ink/35"
            placeholder="搜索菜名、食材、标签"
          />
        </div>
        <AccountAvatar session={session} onClick={onOpenUserCenter} />
      </div>
    </header>
  );
}

export function MobileTabbar({ activeView, onChange }) {
  return (
    <nav
      className="fixed inset-x-3 z-30 grid grid-cols-4 rounded-[26px] border border-line bg-white/92 p-2 shadow-lift backdrop-blur-xl transition-transform duration-300 lg:hidden"
      style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      {mobileNavItems.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeView;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`relative grid place-items-center gap-1 overflow-hidden rounded-[20px] py-2 text-[11px] font-black transition ${
              active ? "nav-tab-active bg-ink text-white shadow-card" : "text-ink/45 hover:text-ink"
            }`}
          >
            {active && <span className="absolute inset-x-4 top-1 h-0.5 rounded-full bg-acid" />}
            <Icon size={18} className={active ? "text-acid" : ""} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
