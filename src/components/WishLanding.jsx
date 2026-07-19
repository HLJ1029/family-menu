import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, Heart, Loader2 } from "lucide-react";
import { getGuestParticipantId } from "../lib/collaborationIdentity";
import { isHumiApiSession, loadWishShareRequest, submitWishShareEntry } from "../lib/humiApi";
import { HumiScene } from "./ui/HumiScene";

export function WishLanding({ token, humiSession, onClose, onBindParticipation }) {
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [dishName, setDishName] = useState("");
  const [note, setNote] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [participant, setParticipant] = useState(null);

  useEffect(() => {
    let active = true;
    async function loadRequest() {
      setLoading(true);
      setStatus("");
      try {
        const data = await loadWishShareRequest(token);
        if (!active) return;
        setRequest(data.request);
      } catch (error) {
        if (active) setStatus(error.message || "这个想吃入口暂时打不开。");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadRequest();
    return () => {
      active = false;
    };
  }, [token, reloadKey]);

  async function submitWish(event) {
    event.preventDefault();
    const safeDishName = dishName.trim();
    if (!safeDishName) {
      setStatus("先写一道想吃的菜。");
      return;
    }
    setStatus("");
    try {
      const guestParticipantId = isHumiApiSession(humiSession) ? "" : getGuestParticipantId("wish", token);
      const data = await submitWishShareEntry(token, {
        ...(guestParticipantId ? { guestParticipantId } : {}),
        dishName: safeDishName,
        note: note.trim(),
      }, humiSession);
      setRequest(data.request);
      setParticipant(data.participant || null);
      setSubmitted(true);
    } catch (error) {
      setStatus(error.message || "暂时没发出去，请稍后再试。");
    }
  }

  if (loading) {
    return (
      <FullScreenShell>
        <div className="grid min-h-[60vh] place-items-center text-center">
          <div>
            <Loader2 className="mx-auto animate-spin" size={28} />
            <p className="mt-4 text-sm font-black text-ink/52">正在打开想吃入口</p>
          </div>
        </div>
      </FullScreenShell>
    );
  }

  if (!request) {
    return (
      <FullScreenShell>
        <div className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-5 text-center">
          <div>
            <h1 className="text-2xl font-black tracking-[-0.04em]">这个入口暂时不可用</h1>
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

  return (
    <FullScreenShell>
      <main data-testid="wish-share-landing" className="mx-auto grid min-h-screen w-full max-w-2xl content-center px-5 py-8">
        <section className="relative overflow-hidden rounded-[32px] border border-line bg-white p-5 shadow-lift sm:p-8">
          <div className="absolute right-5 top-5 hidden rounded-full bg-canvas px-4 py-2 text-xs font-black text-ink/48 sm:block">
            免登录 · 写一道
          </div>
          <div className="grid gap-5 sm:grid-cols-[1fr_150px] sm:items-start">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/38">
                Humi 想吃征集单
              </p>
              <h1 className="mt-3 text-4xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">
                {request.initiatorName || "主厨"}想攒一点家里想吃的。
              </h1>
              <p className="mt-3 text-sm font-bold leading-6 text-ink/52">
                写一道菜就行。{request.householdName ? `这是${request.householdName}在收集最近想吃的菜。` : ""} 主厨回到 Humi 刷新后会看到。
              </p>
            </div>
            <HumiScene scene={submitted ? "wishSubmitted" : "wishWrite"} size="md" className="hidden sm:grid" eager />
          </div>

          {submitted ? (
            <div className="mt-6 rounded-[24px] bg-canvas p-5">
              <CheckCircle2 size={28} />
              <h2 className="mt-3 text-2xl font-black tracking-[-0.04em]">收到，已经记下了。</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
                “{participant?.displayName || "这次参与"}”推荐的“{dishName.trim()}”已经记下，{request.initiatorName || "主厨"}刷新后会看到。
              </p>
              {participant?.type === "guest" && <p className="mt-2 text-sm font-bold leading-6 text-ink/52">登录只会把这次参与关联到你的 Humi 身份，不会自动成为家庭成员；加入家庭需要另行接受家庭邀请。</p>}
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {participant?.type === "guest" && <button type="button" onClick={() => onBindParticipation?.({ type: "wish", token, guestParticipantId: participant.id, actionId: participant.actionId || "", householdName: request.householdName || "我家", initiatorName: request.initiatorName || "主厨", dishWish: dishName.trim(), note: note.trim() })} className="min-h-12 rounded-full bg-ink px-6 py-3 text-sm font-black text-white">登录 Humi，保存这次参与</button>}
                <button type="button" onClick={onClose} className="min-h-12 rounded-full border border-ink bg-white px-6 py-3 text-sm font-black text-ink">
                  {participant?.type === "guest" ? "先这样" : "回到 Humi"}
                </button>
              </div>
            </div>
          ) : (
            <form className="mt-6 grid gap-4" onSubmit={submitWish}>
              <div className="rounded-[26px] border border-line bg-canvas p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-ink">
                    <Heart size={19} />
                  </span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">最近想吃</p>
                    <h2 className="mt-1 text-2xl font-black tracking-[-0.04em]">你最近想吃什么？</h2>
                  </div>
                </div>
                <input
                  value={dishName}
                  onChange={(event) => setDishName(event.target.value)}
                  className="mt-4 w-full rounded-[20px] border border-line bg-white px-4 py-4 text-base font-black outline-none focus:border-ink/30"
                  placeholder="比如：糖醋排骨、番茄牛腩、凉拌黄瓜"
                  maxLength={40}
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen((current) => !current)}
                className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-line bg-canvas px-4 text-sm font-black text-ink/62 transition hover:border-ink/20 hover:text-ink"
              >
                补一句，可不填
                <ChevronDown size={16} className={`transition ${detailsOpen ? "rotate-180" : ""}`} />
              </button>
              {detailsOpen && (
                <div className="grid gap-3 rounded-[24px] border border-line bg-white p-3">
                  <input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className="rounded-full border border-line bg-canvas px-4 py-3 text-sm font-bold outline-none focus:border-ink/30"
                    placeholder="补一句：少辣、想清淡、周末再做..."
                    maxLength={60}
                  />
                </div>
              )}
              {status && <p className="text-sm font-bold text-ink/52">{status}</p>}
              <button type="submit" className="min-h-13 rounded-full bg-ink px-6 py-3 text-base font-black text-white">
                发给主厨
              </button>
            </form>
          )}
        </section>
      </main>
    </FullScreenShell>
  );
}

function FullScreenShell({ children }) {
  return <div className="min-h-screen bg-white text-ink">{children}</div>;
}
