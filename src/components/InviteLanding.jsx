import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, MessageCircleHeart, UsersRound } from "lucide-react";
import {
  isHumiApiSession,
  joinHouseholdInvite,
  loadHouseholdInvite,
  submitHouseholdInviteWant,
} from "../lib/humiApi";
import { requestWechatLoginFromMiniProgram } from "../lib/humiIdentity";
import { isWechatMiniProgramWebView } from "../lib/runtime";
import { HumiScene } from "./ui/HumiScene";

const PARTICIPANT_KEY = "humi:invite-participant-key:v1";

export function InviteLanding({ token, humiSession, onJoined, onClose }) {
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState("");
  const [wantTitle, setWantTitle] = useState("");
  const [wantName, setWantName] = useState("");
  const [wantSaving, setWantSaving] = useState(false);
  const [wantSubmitted, setWantSubmitted] = useState(false);
  const [wantStatus, setWantStatus] = useState("");
  const participantKey = useMemo(() => getParticipantKey(), []);
  const joinAttemptedRef = useRef(false);

  useEffect(() => {
    let active = true;
    async function loadInvite() {
      setLoading(true);
      setStatus("");
      try {
        const data = await loadHouseholdInvite(token);
        if (!active) return;
        setInvite(data.invite);
      } catch (error) {
        if (!active) return;
        setStatus(error.message || "这个家庭邀请暂时打不开。");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadInvite();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!invite || !isHumiApiSession(humiSession) || joinAttemptedRef.current) return;
    joinAttemptedRef.current = true;
    joinInvite();
  }, [humiSession, invite, participantKey, token]);

  async function joinInvite() {
    if (!isHumiApiSession(humiSession)) {
      if (isWechatMiniProgramWebView() && requestWechatLoginFromMiniProgram()) {
        setStatus("正在唤起微信登录，登录后会自动加入这个家。");
        return;
      }
      setStatus("请从微信小程序里打开这个邀请，登录后就能加入。");
      return;
    }
    setJoining(true);
    setStatus("正在加入这个家...");
    try {
      const data = await joinHouseholdInvite(token, humiSession, {
        memberName: humiSession.user?.displayName || "家人",
        participantKey,
      });
      setInvite(data.invite || invite);
      setJoined(true);
      setStatus("已加入这个家，菜单、清单和征集都能一起看了。");
      onJoined?.(data);
    } catch (error) {
      setStatus(error.message || "暂时没加入成功，请稍后重试。");
      joinAttemptedRef.current = false;
    } finally {
      setJoining(false);
    }
  }

  async function submitWant(event) {
    event.preventDefault();
    const title = wantTitle.trim();
    if (!title) {
      setWantStatus("先写一道想吃的菜。");
      return;
    }
    setWantSaving(true);
    setWantStatus("");
    try {
      await submitHouseholdInviteWant(token, {
        participantKey,
        title,
        memberName: wantName.trim() || "家人",
      });
      setWantSubmitted(true);
      setWantStatus(`“${title}”已放进这个家的想吃池。`);
    } catch (error) {
      setWantStatus(error.message || "这次没送到主厨那里，请稍后再试。");
    } finally {
      setWantSaving(false);
    }
  }

  if (loading) {
    return (
      <FullScreenShell>
        <div className="grid min-h-screen place-items-center px-6 text-center">
          <div>
            <Loader2 className="mx-auto animate-spin" size={28} />
            <p className="mt-4 text-sm font-black text-ink/52">正在打开家庭邀请</p>
          </div>
        </div>
      </FullScreenShell>
    );
  }

  if (!invite) {
    return (
      <FullScreenShell>
        <div className="mx-auto grid min-h-screen max-w-md place-items-center px-6 text-center">
          <div>
            <p className="text-2xl font-black tracking-[-0.04em]">这个邀请暂时不可用</p>
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
      <main className="mx-auto grid min-h-screen w-full max-w-2xl content-start px-5 py-8 sm:content-center">
        <section className="rounded-[32px] border border-line bg-white p-5 shadow-lift sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/38">
                Humi 我的家
              </p>
              <h1 className="mt-3 text-4xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">
                加入 {invite.householdName || "这个家"}
              </h1>
              <p className="mt-3 text-sm font-bold leading-6 text-ink/52">
                {invite.inviterName || "主厨"}邀请你一起看菜单、清单和今晚征集。加入后才会成为正式家庭成员。
              </p>
            </div>
            <HumiScene scene={joined ? "inviteAccepted" : "inviteJoin"} size="sm" className="shrink-0" decorative />
          </div>

          <div className="mt-6 rounded-[24px] bg-canvas p-5">
            {joined ? <CheckCircle2 size={28} /> : <UsersRound size={28} />}
            <h2 className="mt-3 text-2xl font-black tracking-[-0.04em]">
              {joined ? "已经加入" : "一家人的饭放在一起"}
            </h2>
            <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
              {joined ? "现在回到 Humi，就能看到这个家的菜单和协作记录。" : "不用重建菜单，也不用重复发清单。点一下就加入当前家庭空间。"}
            </p>
            {!joined && (
              <form onSubmit={submitWant} className="mt-5 border-t border-line pt-5">
                <div className="flex items-start gap-3">
                  <MessageCircleHeart className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
                  <div>
                    <h3 className="text-base font-black">先留一道想吃的</h3>
                    <p className="mt-1 text-xs font-bold leading-5 text-ink/48">不用登录，主厨会在想吃池里看到。</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_10rem]">
                  <input
                    value={wantTitle}
                    onChange={(event) => {
                      setWantTitle(event.target.value);
                      setWantSubmitted(false);
                    }}
                    maxLength={40}
                    placeholder="例如：牛肉面"
                    className="min-w-0 rounded-2xl border border-line bg-white px-4 py-3 text-sm font-bold outline-none focus:border-ink"
                  />
                  <input
                    value={wantName}
                    onChange={(event) => setWantName(event.target.value)}
                    maxLength={32}
                    placeholder="怎么称呼你？"
                    className="min-w-0 rounded-2xl border border-line bg-white px-4 py-3 text-sm font-bold outline-none focus:border-ink"
                  />
                </div>
                <button
                  type="submit"
                  disabled={wantSaving}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-ink bg-white px-6 py-3 text-sm font-black text-ink disabled:border-line disabled:text-ink/42"
                >
                  {wantSubmitted ? <CheckCircle2 size={17} aria-hidden="true" /> : <MessageCircleHeart size={17} aria-hidden="true" />}
                  {wantSaving ? "正在送达" : wantSubmitted ? "已告诉主厨" : "告诉主厨"}
                </button>
                {wantStatus && <p className="mt-2 text-xs font-bold leading-5 text-ink/52" role="status">{wantStatus}</p>}
              </form>
            )}
            {status && <p className="mt-3 text-sm font-bold leading-6 text-ink/52">{status}</p>}
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={joined ? onClose : joinInvite} disabled={joining} className="rounded-full bg-ink px-6 py-3 text-sm font-black text-white disabled:opacity-60">
                {joined ? "回到 Humi" : joining ? "正在加入" : "加入这个家"}
              </button>
              {!joined && (
                <button type="button" onClick={onClose} className="rounded-full border border-line bg-white px-6 py-3 text-sm font-black text-ink">
                  先看看
                </button>
              )}
            </div>
          </div>
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
  const next = `invite-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  window.localStorage.setItem(PARTICIPANT_KEY, next);
  return next;
}
