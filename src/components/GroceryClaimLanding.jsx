import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, XCircle } from "lucide-react";
import { loadGroceryShareRequest, submitGroceryShareClaim, updateGroceryShareItemChecked } from "../lib/humiApi";
import { HumiScene } from "./ui/HumiScene";

const PARTICIPANT_KEY = "humi:grocery-claim-participant-key:v1";

export function GroceryClaimLanding({ token, onClose, onJoinFamily }) {
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [memberName, setMemberName] = useState("");
  const [note, setNote] = useState("");
  const [claimed, setClaimed] = useState(false);
  const [claimStatus, setClaimStatus] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [checkingItemId, setCheckingItemId] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const participantKey = useMemo(() => getParticipantKey(), []);

  useEffect(() => {
    let active = true;
    async function loadRequest() {
      setLoading(true);
      setStatus("");
      try {
        const data = await loadGroceryShareRequest(token);
        if (active) {
          setRequest(data.request);
          setSelectedItemIds((data.request.items ?? []).map((item) => item.id));
        }
      } catch (error) {
        if (active) setStatus(error.message || "这份清单暂时打不开。");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadRequest();
    return () => {
      active = false;
    };
  }, [token, reloadKey]);

  async function submitClaim(event, nextStatus = "claimed") {
    event?.preventDefault();
    setSubmitting(true);
    setStatus("");
    try {
      const data = await submitGroceryShareClaim(token, {
        participantKey,
        memberName: memberName.trim() || "家人",
        status: nextStatus,
        itemIds: nextStatus === "declined" ? [] : selectedItemIds,
        note,
        temporary: true,
      });
      setRequest(data.request);
      setClaimed(true);
      setClaimStatus(nextStatus);
    } catch (error) {
      setStatus(error.message || "暂时没能告诉主厨，请稍后再试。");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleItem(itemId) {
    setSelectedItemIds((current) => (
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]
    ));
  }

  async function toggleCheckedItem(item) {
    if (checkingItemId) return;
    setCheckingItemId(item.id);
    setStatus("");
    try {
      const data = await updateGroceryShareItemChecked(token, item.id, !item.checked);
      setRequest(data.request);
    } catch (error) {
      setStatus(error.message || "暂时没同步成功，稍后再试。");
    } finally {
      setCheckingItemId("");
    }
  }

  if (loading) {
    return (
      <LandingShell>
        <div className="grid min-h-screen place-items-center px-5 text-center">
          <div>
            <Loader2 className="mx-auto animate-spin" size={28} />
            <p className="mt-4 text-sm font-black text-ink/52">正在打开这份清单</p>
          </div>
        </div>
      </LandingShell>
    );
  }

  if (!request) {
    return (
      <LandingShell>
        <div className="mx-auto grid min-h-screen max-w-md place-items-center px-5 text-center">
          <div>
            <h1 className="text-2xl font-black tracking-[-0.04em]">这份清单暂时不可用</h1>
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
      </LandingShell>
    );
  }

  const items = request.items ?? [];
  const claims = request.claims ?? [];
  const checkedCount = items.filter((item) => item.checked).length;
  const claimedCount = claims.filter((claim) => claim.status === "claimed").length;
  const shownItems = claimed && claimStatus !== "declined"
    ? items.filter((item) => selectedItemIds.includes(item.id))
    : items;

  return (
    <LandingShell>
      <main className="mx-auto grid min-h-screen w-full max-w-2xl content-center px-5 py-8">
        <section className="rounded-[32px] border border-line bg-white p-5 shadow-lift sm:p-8">
          <div className="grid gap-5 sm:grid-cols-[1fr_150px] sm:items-start">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/38">
                {request.householdName || "我家"} · 买菜清单
              </p>
              <h1 className="mt-3 text-4xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">
                顺路带这些就够了
              </h1>
              <p className="mt-3 text-sm font-bold leading-6 text-ink/52">
                不用登录。先选你方便买的，买到后照着勾；主厨刷新就能看到。
              </p>
            </div>
            <HumiScene
              scene={claimed ? claimStatus === "declined" ? "groceryDeclined" : "groceryBought" : "groceryClaim"}
              size="md"
              className="hidden sm:grid"
              eager
            />
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <SummaryPill label="清单" value={`${items.length} 项`} />
            <SummaryPill label="已买" value={`${checkedCount}/${items.length}`} />
            <SummaryPill label="有人去买" value={`${claimedCount} 人`} />
          </div>

          {claims.length > 0 && (
            <div className="mt-4 rounded-[22px] border border-line bg-canvas p-3">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">大家的进度</p>
              <div className="mt-2 grid gap-2">
                {claims.slice(0, 4).map((claim) => (
                  <div key={claim.id || claim.participantKey || claim.createdAt} className="flex items-center justify-between gap-3 rounded-[16px] bg-white px-3 py-2">
                    <span className="min-w-0 truncate text-sm font-black">{claim.memberName || "家人"}</span>
                    <span className="shrink-0 rounded-full bg-canvas px-3 py-1.5 text-xs font-black text-ink/58">
                      {claim.status === "declined" ? "这次不方便" : `负责 ${claim.itemIds?.length ?? 0} 项`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-2">
            {shownItems.length > 0 ? (
              shownItems.map((item) => {
                const active = claimed ? Boolean(item.checked) : selectedItemIds.includes(item.id);
                return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => (claimed ? toggleCheckedItem(item) : toggleItem(item.id))}
                  disabled={claimed && checkingItemId === item.id}
                  className={`flex items-center justify-between gap-3 rounded-[18px] border px-4 py-3 text-left transition ${
                    active
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-canvas text-ink"
                  } disabled:opacity-60`}
                >
                  <span className="min-w-0 truncate text-sm font-black">{item.name}</span>
                    <span className={`shrink-0 text-xs font-bold ${active ? "text-white/62" : "text-ink/45"}`}>
                      {claimed ? item.checked ? "已买" : "待买" : item.amount || item.category || "适量"}
                    </span>
                </button>
              );
              })
            ) : (
              <div className="rounded-[18px] bg-canvas px-4 py-3 text-sm font-bold leading-6 text-ink/52">
                这份清单暂时没有具体食材，可以先回 Humi 看今晚安排。
              </div>
            )}
          </div>

          {claimed ? (
            <div className="mt-6 rounded-[24px] bg-canvas p-5">
              {claimStatus === "declined" ? <XCircle size={28} /> : <CheckCircle2 size={28} />}
              <h2 className="mt-3 text-2xl font-black tracking-[-0.04em]">
                {claimStatus === "declined" ? "已经告诉主厨" : "好，这些你来买"}
              </h2>
              <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
                {claimStatus === "declined"
                  ? `${request.initiatorName || "主厨"}回到 Humi 后会看到你暂时买不了。后面想一起看清单，可以加入这个家。`
                  : `${request.initiatorName || "主厨"}回到 Humi 后就能看到你来买 ${selectedItemIds.length || items.length} 项。点一下食材可以标记已买，后面也可以加入这个家一起看。`}
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!onJoinFamily) {
                      onClose?.();
                      return;
                    }
                    onJoinFamily({
                      type: "grocery",
                      token,
                      participantKey,
                      householdName: request.householdName || "我家",
                      initiatorName: request.initiatorName || "主厨",
                      memberName: memberName.trim() || "家人",
                      claimStatus,
                      itemCount: claimStatus === "declined" ? 0 : selectedItemIds.length || items.length,
                    });
                  }}
                  className="min-h-12 rounded-full bg-ink px-6 py-3 text-sm font-black text-white"
                >
                  加入这个家
                </button>
                <button type="button" onClick={onClose} className="min-h-12 rounded-full border border-ink bg-white px-6 py-3 text-sm font-black text-ink">
                  先这样
                </button>
              </div>
            </div>
          ) : (
            <form className="mt-6 grid gap-3" onSubmit={(event) => submitClaim(event, "claimed")}>
              <div className="rounded-[24px] border border-line bg-white">
                <button
                  type="button"
                  onClick={() => setDetailsOpen((current) => !current)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm font-black text-ink/62"
                  aria-expanded={detailsOpen}
                >
                  补一句，可不填
                  <ChevronDown size={17} className={`transition ${detailsOpen ? "rotate-180" : ""}`} />
                </button>
                {detailsOpen && (
                  <div className="grid gap-2 border-t border-line p-3">
                    <input
                      value={memberName}
                      onChange={(event) => setMemberName(event.target.value)}
                      className="rounded-full border border-line bg-canvas px-4 py-3 text-sm font-bold outline-none focus:border-ink/30"
                      placeholder="怎么称呼你？可不填"
                    />
                    <input
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      className="rounded-full border border-line bg-canvas px-4 py-3 text-sm font-bold outline-none focus:border-ink/30"
                      placeholder="比如：下班路上买，可不填"
                    />
                  </div>
                )}
              </div>
              {status && <p className="text-sm font-bold text-ink/52">{status}</p>}
              <button type="submit" disabled={submitting || (items.length > 0 && selectedItemIds.length === 0)} className="min-h-13 rounded-full bg-ink px-6 py-3 text-base font-black text-white disabled:opacity-55">
                {submitting ? "正在认领" : selectedItemIds.length > 0 ? `我来买 ${selectedItemIds.length} 项` : "先选要买的"}
              </button>
              <button
                type="button"
                onClick={() => submitClaim(null, "declined")}
                disabled={submitting}
                className="min-h-12 rounded-full border border-ink bg-white px-6 py-3 text-sm font-black text-ink disabled:opacity-55"
              >
                这次我买不了
              </button>
            </form>
          )}
        </section>
      </main>
    </LandingShell>
  );
}

function SummaryPill({ label, value }) {
  return (
    <div className="rounded-[18px] border border-line bg-canvas px-3 py-3 text-center">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-ink/35">{label}</p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}

function LandingShell({ children }) {
  return <div className="min-h-screen bg-white text-ink">{children}</div>;
}

function getParticipantKey() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(PARTICIPANT_KEY);
  if (existing) return existing;
  const next = `grocery-participant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  window.localStorage.setItem(PARTICIPANT_KEY, next);
  return next;
}
