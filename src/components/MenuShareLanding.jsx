import { useEffect, useState } from "react";
import { ChefHat, Loader2, ShoppingBasket, Utensils } from "lucide-react";
import { loadMenuShareRequest } from "../lib/humiApi";
import { HumiScene } from "./ui/HumiScene";

export function MenuShareLanding({ token, onClose }) {
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadRequest() {
      setLoading(true);
      setStatus("");
      try {
        const data = await loadMenuShareRequest(token);
        if (!active) return;
        setRequest(data.request);
      } catch (error) {
        if (!active) return;
        setStatus(error.message || "这个菜单链接暂时打不开。");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadRequest();
    return () => {
      active = false;
    };
  }, [token, reloadKey]);

  if (loading) {
    return (
      <FullScreenShell>
        <div className="grid min-h-[70vh] place-items-center px-5 text-center">
          <div>
            <Loader2 className="mx-auto animate-spin" size={28} />
            <p className="mt-4 text-sm font-black text-ink/52">正在打开今晚菜单</p>
          </div>
        </div>
      </FullScreenShell>
    );
  }

  if (!request) {
    return (
      <FullScreenShell>
        <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-5 text-center">
          <div>
            <h1 className="text-2xl font-black tracking-[-0.04em]">这个菜单暂时不可用</h1>
            <p className="mt-3 text-sm font-bold leading-6 text-ink/52">{status}</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setReloadKey((current) => current + 1)} className="min-h-12 rounded-full bg-ink px-6 py-3 text-sm font-black text-white">
                重试
              </button>
              <button type="button" onClick={onClose} className="min-h-12 rounded-full border border-ink bg-white px-6 py-3 text-sm font-black text-ink">
                回到 Humi
              </button>
            </div>
          </div>
        </div>
      </FullScreenShell>
    );
  }

  const dishes = request.dishes ?? [];
  const dishNames = dishes.map((dish) => dish.name).join("、");

  return (
    <FullScreenShell>
      <main data-testid="menu-share-landing" className="mx-auto grid min-h-screen w-full max-w-2xl content-center px-5 py-8">
        <section className="overflow-hidden rounded-[32px] border border-line bg-white p-5 shadow-lift sm:p-8">
          <div className="grid gap-5 sm:grid-cols-[1fr_140px] sm:items-start">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/38">Humi 今晚菜单</p>
              <h1 className="mt-3 text-4xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">
                {request.householdName || "我家"}今晚安排好了。
              </h1>
              <p className="mt-3 text-sm font-bold leading-6 text-ink/52">
                {dishNames || request.title || "家人已经在 Humi 里排好今晚这顿。"}
              </p>
            </div>
            <HumiScene scene="menuShare" size="md" className="hidden sm:grid" eager />
          </div>

          <div className="mt-6 grid gap-3">
            {dishes.length > 0 ? dishes.map((dish) => (
              <article key={dish.id || dish.recipeId || dish.name} className="flex items-center gap-3 rounded-[22px] border border-line bg-canvas p-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-ink">
                  <Utensils size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-black">{dish.name}</p>
                  <p className="mt-1 text-xs font-bold text-ink/48">
                    {dish.category || "今晚菜单"}{dish.timeMinutes ? ` · ${dish.timeMinutes} min` : ""} · {dish.quantity || 1} 份
                  </p>
                </div>
              </article>
            )) : (
              <div className="rounded-[22px] border border-line bg-canvas p-4 text-sm font-bold leading-6 text-ink/52">
                这份菜单暂时没有具体菜名，可以回 Humi 看今晚安排。
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-line bg-canvas p-4">
              <ChefHat size={18} />
              <p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-ink/35">安排人</p>
              <p className="mt-1 text-sm font-black">{request.initiatorName || "主厨"}</p>
            </div>
            <div className="rounded-[22px] border border-line bg-canvas p-4">
              <ShoppingBasket size={18} />
              <p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-ink/35">待买食材</p>
              <p className="mt-1 text-sm font-black">{request.groceryCount || 0} 项</p>
            </div>
          </div>

          <button type="button" onClick={onClose} className="mt-5 min-h-12 w-full rounded-full bg-ink px-6 py-3 text-sm font-black text-white">
            回到 Humi
          </button>
        </section>
      </main>
    </FullScreenShell>
  );
}

function FullScreenShell({ children }) {
  return <div className="min-h-screen bg-white text-ink">{children}</div>;
}
