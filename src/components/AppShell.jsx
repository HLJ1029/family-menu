import { ChefHat, Search } from "lucide-react";
import { navItems } from "./navigation";
import { DoodlePot } from "./ui/Doodles";

export function Sidebar({ activeView, onChange }) {
  return (
    <aside className="sticky top-6 hidden h-[calc(100vh-48px)] w-72 shrink-0 flex-col rounded-[28px] border border-line/80 bg-white/78 p-5 shadow-card backdrop-blur-xl lg:flex">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-acid">
          <ChefHat size={22} />
        </div>
        <div>
          <p className="text-sm font-black uppercase tracking-[0.22em]">Family</p>
          <p className="-mt-1 text-2xl font-black tracking-tight">Menu</p>
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
                active ? "bg-ink text-white" : "text-ink/62 hover:bg-ink/[0.04] hover:text-ink"
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
        <p className="mt-4 text-sm font-black">Smart pantry beta</p>
        <p className="mt-1 text-xs leading-5 text-ink/52">
          当前版本用 30 道菜测试菜单、计划和购物清单体验。
        </p>
      </div>
    </aside>
  );
}

export function Topbar({ query, setQuery }) {
  return (
    <header className="mb-5 flex flex-col gap-4 lg:mb-7 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-ink/45">
          <span className="h-2 w-2 rounded-full bg-acid" />
          Urban family kitchen
        </div>
        <h1 className="mt-2 max-w-3xl text-5xl font-black tracking-[-0.04em] md:text-7xl">
          Eat well, plan lightly.
        </h1>
      </div>
      <div className="flex items-center gap-3 rounded-[22px] border border-line bg-white px-4 py-3 shadow-card lg:w-[390px]">
        <Search size={18} className="text-ink/38" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-ink/35"
          placeholder="搜索菜名、食材、标签"
        />
        <div className="hidden h-9 w-9 place-items-center rounded-full bg-ink text-xs font-black text-white sm:grid">
          H
        </div>
      </div>
    </header>
  );
}

export function MobileTabbar({ activeView, onChange }) {
  return (
    <nav
      className="fixed inset-x-3 bottom-3 z-30 grid rounded-[26px] border border-line bg-white/92 p-2 shadow-lift backdrop-blur-xl lg:hidden"
      style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeView;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`grid place-items-center gap-1 rounded-[20px] py-2 text-[11px] font-black transition ${
              active ? "bg-ink text-white" : "text-ink/45"
            }`}
          >
            <Icon size={18} className={active ? "text-acid" : ""} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
