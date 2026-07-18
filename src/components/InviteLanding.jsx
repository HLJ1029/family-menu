import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, UsersRound } from "lucide-react";
import { isHumiApiSession, joinHouseholdInvite, loadHouseholdInvite } from "../lib/humiApi";
import { requestWechatLoginFromMiniProgram } from "../lib/humiIdentity";
import { isWechatMiniProgramWebView } from "../lib/runtime";
import { HumiScene } from "./ui/HumiScene";

export function InviteLanding({ token, humiSession, onJoined, onClose }) {
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState("");
  const joinAttemptedRef = useRef(false);

  useEffect(() => {
    let active = true;
    async function loadInvite() {
      setLoading(true);
      setStatus("");
      try {
        const data = await loadHouseholdInvite(token);
        if (active) setInvite(data.invite);
      } catch (error) {
        if (active) setStatus(error.message || "这个家庭邀请暂时打不开。");
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
    void joinInvite();
  }, [humiSession, invite]);

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
            <h1 className="text-2xl font-black">这个邀请暂时不可用</h1>
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
      <main data-testid="invite-share-landing" className="mx-auto grid min-h-screen w-full max-w-2xl content-center px-5 py-8">
        <section className="rounded-[28px] border border-line bg-white p-5 shadow-lift sm:p-8">
          <div className="grid gap-4 sm:grid-cols-[1fr_150px] sm:items-start">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/38">Humi 我的家</p>
              <h1 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">加入 {invite.householdName || "这个家"}</h1>
              <p className="mt-3 text-sm font-bold leading-6 text-ink/52">
                {invite.inviterName || "主厨"}邀请你一起看菜单、清单和今晚征集。加入后才会成为正式家庭成员。
              </p>
            </div>
            <HumiScene scene={joined ? "inviteAccepted" : "inviteJoin"} size="md" className="hidden sm:grid" eager />
          </div>
          <div className="mt-6 rounded-[24px] bg-canvas p-5">
            {joined ? <CheckCircle2 size={28} /> : <UsersRound size={28} />}
            <h2 className="mt-3 text-2xl font-black">{joined ? "已经加入" : "一家人的饭放在一起"}</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
              {joined ? "现在回到 Humi，就能看到这个家的菜单和协作记录。" : "不用重建菜单，也不用重复发清单。点一下就加入当前家庭空间。"}
            </p>
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
