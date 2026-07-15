import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, MessageCircleHeart } from "lucide-react";
import { feelingTags } from "../lib/collaboration";
import { loadCraveRequest, submitCraveVote } from "../lib/humiApi";
import { HumiScene } from "./ui/HumiScene";

const PARTICIPANT_KEY = "humi:crave-participant-key:v1";

export function CraveLanding({ token, onClose, onJoinFamily }) {
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [selectedFeeling, setSelectedFeeling] = useState("随便都行");
  const [memberName, setMemberName] = useState("");
  const [dishWish, setDishWish] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const participantKey = useMemo(() => getParticipantKey(), []);
  const primaryFeelingTags = feelingTags.filter((tag) => tag !== "随便都行");

  useEffect(() => {
    let active = true;
    async function loadRequest() {
      setLoading(true);
      setStatus("");
      try {
        const data = await loadCraveRequest(token);
        if (!active) return;
        setRequest(data.request);
      } catch (error) {
        if (!active) return;
        setStatus(error.message || "这个征集链接暂时打不开。");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadRequest();
    return () => {
      active = false;
    };
  }, [token, reloadKey]);

  async function submitVote(event) {
    event.preventDefault();
    setStatus("");
    if (request?.status === "closed") {
      setStatus("这次征集已经收口，主厨正在安排菜单。");
      return;
    }
    try {
      const data = await submitCraveVote(token, {
        participantKey,
        memberName: memberName.trim() || "家人",
        feelingTag: selectedFeeling,
        dishWish: dishWish.trim(),
        note,
        temporary: true,
      });
      setRequest(data.request);
      if (data.request?.status === "closed") {
        setStatus("这次征集已经收口，主厨正在安排菜单。");
        setSubmitted(false);
        return;
      }
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
            <p className="mt-4 text-sm font-black text-ink/52">正在打开今晚的征集</p>
          </div>
        </div>
      </FullScreenShell>
    );
  }

  if (!request) {
    return (
      <FullScreenShell>
        <div className="mx-auto grid min-h-[60vh] max-w-md place-items-center text-center">
          <div>
            <h1 className="text-2xl font-black tracking-[-0.04em]">这个链接暂时不可用</h1>
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
      <main className="mx-auto grid min-h-screen w-full max-w-2xl content-center px-5 py-8">
        <section className="relative overflow-hidden rounded-[32px] border border-line bg-white p-5 shadow-lift sm:p-8">
          <div className="absolute right-5 top-5 hidden rounded-full bg-canvas px-4 py-2 text-xs font-black text-ink/48 sm:block">
            免登录 · 点一下
          </div>
          <div className="grid gap-5 sm:grid-cols-[1fr_150px] sm:items-start">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/38">
                {(request.initiatorName || "主厨")}家今晚要做饭
              </p>
              <h1 className="mt-3 text-4xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">
                你想吃点啥？
              </h1>
              <p className="mt-3 text-sm font-bold leading-6 text-ink/52">
                不用登录，不用想菜名，点一个感觉就行。{request.householdName ? `这是${request.householdName}的今晚菜单征集。` : ""}
              </p>
            </div>
            <HumiScene scene={submitted || request.status === "closed" ? "craveSubmitted" : "craveThinking"} size="md" className="hidden sm:grid" eager />
          </div>

          {request.status === "closed" ? (
            <div className="mt-6 rounded-[24px] bg-canvas p-5">
              <CheckCircle2 size={28} />
              <h2 className="mt-3 text-2xl font-black tracking-[-0.04em]">这次已经收口</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
                {request.initiatorName || "主厨"}已经开始安排今晚菜单。晚到也没关系，回到 Humi 还能继续看今晚安排和菜品库。
              </p>
              {status && <p className="mt-3 text-sm font-bold text-ink/52">{status}</p>}
              <button type="button" onClick={onClose} className="mt-5 min-h-12 w-full rounded-full bg-ink px-6 py-3 text-sm font-black text-white">
                回到 Humi
              </button>
            </div>
          ) : submitted ? (
            <div className="mt-6 rounded-[24px] bg-canvas p-5">
              <CheckCircle2 size={28} />
              <h2 className="mt-3 text-2xl font-black tracking-[-0.04em]">收到！</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
                {request.initiatorName || "主厨"}会看着安排。你已经参与完成了，关掉也没关系；想看今晚最后定了什么，可以加入这个家。
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
                      type: "crave",
                      token,
                      participantKey,
                      householdName: request.householdName || "我家",
                      initiatorName: request.initiatorName || "主厨",
                      memberName: memberName.trim() || "家人",
                      feelingTag: selectedFeeling,
                      dishWish: dishWish.trim(),
                    });
                  }}
                  className="min-h-12 rounded-full bg-ink px-6 py-3 text-sm font-black text-white"
                >
                  加入这个家，看今晚定了啥
                </button>
                <button type="button" onClick={onClose} className="min-h-12 rounded-full border border-ink bg-white px-6 py-3 text-sm font-black text-ink">
                  先这样
                </button>
              </div>
            </div>
          ) : (
            <form className="mt-6 grid gap-4" onSubmit={submitVote}>
              <div className="rounded-[26px] border border-line bg-canvas p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-ink">
                    <MessageCircleHeart size={19} />
                  </span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">今晚想吃什么感觉</p>
                    <h2 className="mt-1 text-2xl font-black tracking-[-0.04em]">点一个感觉就行</h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFeeling("随便都行")}
                  className={`mt-4 min-h-14 w-full rounded-[20px] border px-4 text-base font-black transition ${
                    selectedFeeling === "随便都行"
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-white text-ink hover:border-ink/30"
                  }`}
                >
                  随便，都行
                </button>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {primaryFeelingTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedFeeling(tag)}
                    className={`min-h-12 rounded-full border px-3 text-sm font-black transition ${
                      selectedFeeling === tag
                        ? "border-ink bg-ink text-white"
                        : "border-line bg-white text-ink hover:border-ink/30"
                    }`}
                  >
                    {tag}
                  </button>
                  ))}
                </div>
              </div>
              <div className="rounded-[24px] border border-line bg-white">
                <button
                  type="button"
                  onClick={() => setDetailsOpen((current) => !current)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm font-black text-ink/62"
                  aria-expanded={detailsOpen}
                >
                  想补一句？选填
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
                      value={dishWish}
                      onChange={(event) => setDishWish(event.target.value)}
                      className="rounded-full border border-line bg-canvas px-4 py-3 text-sm font-bold outline-none focus:border-ink/30"
                      placeholder="有特别想吃的菜？可不填"
                    />
                    <input
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      className="rounded-full border border-line bg-canvas px-4 py-3 text-sm font-bold outline-none focus:border-ink/30"
                      placeholder="比如：别太辣、想快一点"
                    />
                  </div>
                )}
              </div>
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

function getParticipantKey() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(PARTICIPANT_KEY);
  if (existing) return existing;
  const next = `participant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  window.localStorage.setItem(PARTICIPANT_KEY, next);
  return next;
}
