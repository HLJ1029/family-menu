import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, MessageCircleHeart } from "lucide-react";
import { feelingTags } from "../lib/collaboration";
import { loadCraveRequest, submitCraveVote } from "../lib/humiApi";
import { requestWechatLoginFromMiniProgram } from "../lib/humiIdentity";
import { isWechatMiniProgramWebView } from "../lib/runtime";

const PARTICIPANT_KEY = "humi:crave-participant-key:v1";

export function CraveLanding({ token, onClose }) {
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [selectedFeeling, setSelectedFeeling] = useState("随便都行");
  const [memberName, setMemberName] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const participantKey = useMemo(() => getParticipantKey(), []);

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
  }, [token]);

  async function submitVote(event) {
    event.preventDefault();
    setStatus("");
    try {
      const data = await submitCraveVote(token, {
        participantKey,
        memberName: memberName.trim() || "家人",
        feelingTag: selectedFeeling,
        note,
        temporary: true,
      });
      setRequest(data.request);
      setSubmitted(true);
    } catch (error) {
      setStatus(error.message || "暂时没发出去，请稍后再试。");
    }
  }

  function joinHousehold() {
    if (isWechatMiniProgramWebView() && requestWechatLoginFromMiniProgram()) {
      setStatus("正在帮你加入这个家。授权后就能回来看今晚最后定了什么。");
      return;
    }
    onClose();
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
            <p className="text-2xl font-black tracking-[-0.04em]">这个链接暂时不可用</p>
            <p className="mt-3 text-sm font-bold leading-6 text-ink/52">{status}</p>
            <button type="button" onClick={onClose} className="mt-5 rounded-full bg-ink px-6 py-3 text-sm font-black text-white">
              回到 Humi
            </button>
          </div>
        </div>
      </FullScreenShell>
    );
  }

  return (
    <FullScreenShell>
      <main className="mx-auto grid min-h-screen w-full max-w-2xl content-center px-5 py-8">
        <section className="rounded-[32px] border border-line bg-white p-5 shadow-lift sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/38">
                {request.householdName || "我家"} · 今晚
              </p>
              <h1 className="mt-3 text-4xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">
                你想吃点啥？
              </h1>
              <p className="mt-3 text-sm font-bold leading-6 text-ink/52">
                不用想菜名，点一个感觉就行。
              </p>
            </div>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink text-white">
              <MessageCircleHeart size={22} />
            </span>
          </div>

          {submitted ? (
            <div className="mt-6 rounded-[24px] bg-canvas p-5">
              <CheckCircle2 size={28} />
              <h2 className="mt-3 text-2xl font-black tracking-[-0.04em]">收到！</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
                {request.initiatorName || "主厨"}会看着安排。想看今晚最后定了什么，可以加入这个家。
              </p>
              {status && <p className="mt-3 text-sm font-bold leading-6 text-ink/52">{status}</p>}
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={joinHousehold} className="rounded-full bg-ink px-6 py-3 text-sm font-black text-white">
                  加入这个家看结果
                </button>
                <button type="button" onClick={onClose} className="rounded-full border border-line bg-white px-6 py-3 text-sm font-black text-ink">
                  先不用
                </button>
              </div>
            </div>
          ) : (
            <form className="mt-6 grid gap-4" onSubmit={submitVote}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {feelingTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedFeeling(tag)}
                    className={`min-h-12 rounded-full border px-3 text-sm font-black transition ${
                      selectedFeeling === tag
                        ? "border-ink bg-ink text-white"
                        : "border-line bg-white text-ink hover:border-ink/30"
                    } ${tag === "随便都行" ? "col-span-2 sm:col-span-3" : ""}`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
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
                placeholder="想补一句？可不填"
              />
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
  return <div className="min-h-screen bg-canvas text-ink">{children}</div>;
}

function getParticipantKey() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(PARTICIPANT_KEY);
  if (existing) return existing;
  const next = `participant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  window.localStorage.setItem(PARTICIPANT_KEY, next);
  return next;
}
