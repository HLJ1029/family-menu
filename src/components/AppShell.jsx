import { ArrowLeft, CalendarDays, ChefHat, Search, Sparkles, UserRound } from "lucide-react";
import { useState } from "react";
import { isWechatMiniProgramWebView } from "../lib/runtime";
import { getNavItem, mobileNavItems, navItems } from "./navigation";
import { stableHash } from "./ui/characterIllustrations";
import { HumiPeek } from "./ui/HumiBrandIllustration";

export const ICP_RECORD_NUMBER = "闽ICP备2026021323号-1";
export const ICP_RECORD_URL = "https://beian.miit.gov.cn/";

export function IcpFooter({ compact = false }) {
  return (
    <footer className={`mx-auto w-full max-w-[1480px] px-4 text-center text-xs font-bold text-ink/42 md:px-6 ${compact ? "pb-5 pt-2" : "pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-8 lg:pb-8"}`}>
      <a
        href={ICP_RECORD_URL}
        target="_blank"
        rel="noreferrer"
        className="transition hover:text-ink"
      >
        {ICP_RECORD_NUMBER}
      </a>
    </footer>
  );
}

export function Sidebar({ activeView, onChange }) {
  const quickLinks = [
    { id: "library", label: "全部菜品库", icon: Sparkles },
    { id: "planner", label: "想连排几天", icon: CalendarDays },
  ];

  return (
    <aside className="sticky top-6 hidden h-[calc(100vh-48px)] w-72 shrink-0 flex-col rounded-[28px] border border-line/80 bg-white/78 p-5 shadow-card backdrop-blur-xl lg:flex">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-white">
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
              <Icon size={19} className={active ? "text-white" : "text-ink/48 group-hover:text-ink"} />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="mt-6 border-t border-line pt-4">
        <p className="mb-2 px-4 text-xs font-black uppercase tracking-[0.18em] text-ink/35">可选</p>
        <div className="space-y-1">
          {quickLinks.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeView;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChange(item.id)}
                className={`flex w-full items-center gap-3 rounded-[18px] px-4 py-2.5 text-left text-sm font-bold transition ${
                  active ? "bg-canvas text-ink" : "text-ink/48 hover:bg-ink/[0.04] hover:text-ink"
                }`}
              >
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChange("user")}
        className="relative mt-auto overflow-hidden rounded-[24px] border border-line bg-canvas p-4 pr-20 text-left transition hover:-translate-y-0.5 hover:border-ink/20"
      >
        <HumiPeek
          variant="cooking"
          size="md"
          className="absolute -bottom-3 -right-3 opacity-95"
          contextKey="sidebar-cooking-peek"
        />
        <p className="mt-4 text-sm font-black">家里的饭，慢慢记住</p>
        <p className="mt-1 text-xs leading-5 text-ink/52">
          从今晚吃啥，到买菜清单和家人反馈，都帮你顺一顺。
        </p>
      </button>
    </aside>
  );
}

export function AccountAvatar({ session, onClick, compact = false, label = "回到 Humi 首页" }) {
  const email = session?.user?.email;
  const displayName = session?.user?.displayName;
  const isWechatMiniProgram = isWechatMiniProgramWebView();
  const identitySeed = email || displayName || (isWechatMiniProgram ? "wechat-mini-program" : "guest");
  const avatars = [
    "/assets/brand/avatars/humi-avatar-f-01.webp",
    "/assets/brand/avatars/humi-avatar-m-01.webp",
  ];
  const avatarSrc = avatars[stableHash(identitySeed) % avatars.length];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`motion-card grid shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-white text-ink shadow-card transition hover:-translate-y-0.5 ${
        compact ? "h-11 w-11" : "h-12 w-12"
      }`}
      aria-label={label}
      title={label}
    >
      {avatarSrc ? (
        <img
          src={avatarSrc}
          alt=""
          className="h-full w-full scale-[0.96] object-contain object-center"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <UserRound size={19} />
      )}
    </button>
  );
}

export function Topbar({ activeView, query, setQuery, session, onOpenUserCenter, onBack }) {
  const activeItem = getNavItem(activeView);
  const title = activeItem?.label ?? "Humi";
  const [searchOpen, setSearchOpen] = useState(Boolean(query));

  return (
    <header className="sticky top-0 z-20 mb-5 flex flex-col gap-4 rounded-b-[24px] border-b border-line bg-white pb-3 pt-[env(safe-area-inset-top)] shadow-card lg:static lg:mb-7 lg:flex-row lg:items-center lg:justify-between lg:border-b-0 lg:bg-transparent lg:pb-0 lg:pt-0 lg:shadow-none">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-ink/45">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-ink shadow-card transition hover:-translate-y-0.5 hover:border-ink/20"
            aria-label="返回上一页"
          >
            <ArrowLeft size={17} />
          </button>
          <span className="h-2 w-2 rounded-full bg-ink" />
          Humi
        </div>
        <h1 className="mt-2 max-w-3xl text-2xl font-black tracking-normal md:text-3xl">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-3">
        {searchOpen ? (
          <div className="flex items-center gap-3 rounded-[22px] border border-line bg-white px-4 py-3 shadow-card lg:w-[390px]">
            <Search size={18} className="text-ink/38" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-ink/35"
              placeholder="搜索菜名、食材、标签"
              autoFocus
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="grid h-12 w-12 place-items-center rounded-full border border-line bg-white text-ink shadow-card transition hover:-translate-y-0.5 hover:border-ink/20"
            aria-label="展开搜索"
          >
            <Search size={18} />
          </button>
        )}
        <AccountAvatar session={session} onClick={onOpenUserCenter} />
      </div>
    </header>
  );
}

export function MobileTabbar({ activeView, onChange }) {
  return (
    <nav
      className="fixed inset-x-3 z-30 grid grid-cols-3 rounded-[26px] border border-line bg-white p-2 shadow-lift transition-transform duration-300 lg:hidden"
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
            {active && <span className="absolute inset-x-4 top-1 h-0.5 rounded-full bg-ink" />}
            <Icon size={18} className={active ? "text-white" : ""} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
