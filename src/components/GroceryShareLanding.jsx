import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, Loader2, ShoppingBasket } from "lucide-react";
import { claimGroceryShareItem, loadGroceryShare } from "../lib/humiApi";
import { HumiScene } from "./ui/HumiScene";

const PARTICIPANT_KEY = "humi:grocery-participant-key:v1";

export function GroceryShareLanding({ token, humiSession, onClose }) {
  const [share, setShare] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [memberName, setMemberName] = useState("");
  const [pendingKey, setPendingKey] = useState("");
  const participantKey = useMemo(() => getParticipantKey(), []);

  useEffect(() => {
    let active = true;
    async function loadShare() {
      setLoading(true);
      setStatus("");
      try {
        const data = await loadGroceryShare(token);
        if (!active) return;
        setShare(data.share);
      } catch (error) {
        if (!active) return;
        setStatus(error.message || "这个买菜清单暂时打不开。");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadShare();
    return () => {
      active = false;
    };
  }, [token]);

  async function claimItem(item, nextStatus = "claimed") {
    setPendingKey(item.key);
    setStatus("");
    try {
      const data = await claimGroceryShareItem(token, {
        itemKey: item.key,
        participantKey,
        memberName: memberName.trim() || humiSession?.user?.displayName || "家人",
        status: nextStatus,
      }, humiSession);
      setShare(data.share);
      setStatus(nextStatus === "done" ? `${item.name} 已标记买到了。` : `${item.name} 已认领。`);
    } catch (error) {
      setStatus(error.message || "暂时没回传成功，请稍后重试。");
    } finally {
      setPendingKey("");
    }
  }

  if (loading) {
    return (
      <FullScreenShell>
        <div className="grid min-h-screen place-items-center px-6 text-center">
          <div>
            <Loader2 className="mx-auto animate-spin" size={28} />
            <p className="mt-4 text-sm font-black text-ink/52">正在打开买菜清单</p>
          </div>
        </div>
      </FullScreenShell>
    );
  }

  if (!share) {
    return (
      <FullScreenShell>
        <div className="mx-auto grid min-h-screen max-w-md place-items-center px-6 text-center">
          <div>
            <p className="text-2xl font-black tracking-[-0.04em]">这个清单暂时不可用</p>
            <p className="mt-3 text-sm font-bold leading-6 text-ink/52">{status}</p>
            <button type="button" onClick={onClose} className="mt-5 rounded-full bg-ink px-6 py-3 text-sm font-black text-white">
              回到 Humi
            </button>
          </div>
        </div>
      </FullScreenShell>
    );
  }

  const claims = share.claims ?? {};
  const openItems = (share.items ?? []).filter((item) => claims[item.key]?.status !== "done");
  const doneItems = (share.items ?? []).filter((item) => claims[item.key]?.status === "done");
  const currentParticipantId = getCurrentParticipantId({ participantKey, humiSession });

  return (
    <FullScreenShell>
      <main className="mx-auto grid min-h-screen w-full max-w-2xl content-center px-5 py-8">
        <section className="rounded-[32px] border border-line bg-white p-5 shadow-lift sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/38">
                {share.householdName || "我家"} · 买菜清单
              </p>
              <h1 className="mt-3 text-4xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">
                顺路带这些
              </h1>
              <p className="mt-3 text-sm font-bold leading-6 text-ink/52">
                {share.initiatorName || "主厨"}发来的清单。点“我来买”就会回传到这个家，不用先做设置。
              </p>
            </div>
            <HumiScene
              scene={openItems.length === 0 ? "groceryBought" : "groceryClaim"}
              size="sm"
              className="shrink-0"
              decorative
            />
          </div>

          <input
            value={memberName}
            onChange={(event) => setMemberName(event.target.value)}
            className="mt-6 w-full rounded-full border border-line bg-canvas px-4 py-3 text-sm font-bold outline-none focus:border-ink/30"
            placeholder="怎么称呼你？可不填"
          />

          {status && <p className="mt-3 text-sm font-bold leading-6 text-ink/52">{status}</p>}

          <div className="mt-5 grid gap-3">
            {openItems.length > 0 ? openItems.map((item) => {
              const claim = claims[item.key];
              const pending = pendingKey === item.key;
              const claimed = Boolean(claim);
              const mine = claim?.memberId === currentParticipantId;
              return (
                <div key={item.key} className="rounded-[22px] border border-line bg-canvas p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-black text-ink">{item.name}</p>
                      <p className="mt-1 text-xs font-bold text-ink/45">{item.amount || "按需"}{item.source ? ` · ${item.source}` : ""}</p>
                      {claim && <p className="mt-2 text-xs font-black text-ink/55">{mine ? "你在买" : `${claim.memberName || "家人"}在买`}</p>}
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-ink/45">
                      {claimed ? mine ? "我认领了" : "已认领" : "待买"}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => claimItem(item, claimed ? "done" : "claimed")}
                      disabled={pending || (claimed && !mine)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-ink/12 disabled:text-ink/35"
                    >
                      {claimed ? <Check size={16} /> : <ShoppingBasket size={16} />}
                      {pending ? "回传中" : claimed ? mine ? "买到了" : "已有人在买" : "我来买"}
                    </button>
                    {!claimed && (
                      <button
                        type="button"
                        onClick={() => claimItem(item, "done")}
                        disabled={pending}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-white px-5 text-sm font-black text-ink disabled:opacity-60"
                      >
                        <CheckCircle2 size={16} />
                        已经买到
                      </button>
                    )}
                  </div>
                </div>
              );
            }) : (
              <div className="rounded-[24px] bg-canvas p-5 text-center">
                <HumiScene scene="groceryBought" size="md" className="mx-auto" decorative />
                <h2 className="mt-3 text-2xl font-black tracking-[-0.04em]">这份清单都处理好了</h2>
                <p className="mt-2 text-sm font-bold leading-6 text-ink/52">回到 Humi 就能看今晚菜单。</p>
              </div>
            )}
          </div>

          {doneItems.length > 0 && (
            <div className="mt-5 rounded-[22px] border border-line bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-ink/38">已买到</p>
              <div className="mt-3 grid gap-2">
                {doneItems.map((item) => (
                  <div key={item.key} className="flex items-center gap-2 text-sm font-bold text-ink/52">
                    <Check size={15} />
                    <span>{item.name}</span>
                    <span className="ml-auto text-xs">{claims[item.key]?.memberName || "家人"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button type="button" onClick={onClose} className="mt-5 w-full rounded-full border border-line bg-white px-6 py-3 text-sm font-black text-ink">
            回到 Humi
          </button>
        </section>
      </main>
    </FullScreenShell>
  );
}

function FullScreenShell({ children }) {
  return <div className="min-h-screen bg-canvas text-ink">{children}</div>;
}

function getParticipantKey() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(PARTICIPANT_KEY);
  if (existing) return existing;
  const next = `grocery-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  window.localStorage.setItem(PARTICIPANT_KEY, next);
  return next;
}

function getCurrentParticipantId({ participantKey, humiSession }) {
  if (humiSession?.user?.id) return humiSession.user.id;
  return participantKey ? `temporary:${participantKey}` : "";
}
