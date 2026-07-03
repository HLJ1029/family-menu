import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { CraveClosedSheet, CraveSubmittedSheet, CraveVoteSheet } from "./CraveSheet";
import { isHumiApiSession, joinCraveRequest, loadCraveRequest, submitCraveVote } from "../lib/humiApi";
import { requestWechatLoginFromMiniProgram } from "../lib/humiIdentity";
import { isWechatMiniProgramWebView } from "../lib/runtime";

const PARTICIPANT_KEY = "humi:crave-participant-key:v1";
const PARTICIPANT_VOTES_KEY = "humi:crave-participant-votes:v1";

export function CraveLanding({ token, humiSession, onJoined, onClose }) {
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [selectedFeeling, setSelectedFeeling] = useState("随便都行");
  const [memberName, setMemberName] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const participantKey = useMemo(() => getParticipantKey(), []);
  const joinAttemptedRef = useRef(false);

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

  useEffect(() => {
    if (!request || !isHumiApiSession(humiSession) || joinAttemptedRef.current) return;
    if (!hasLocalVote(token, participantKey)) return;
    joinAttemptedRef.current = true;
    let active = true;
    async function claimTemporaryVote() {
      setStatus("正在把你刚才的选择加入这个家...");
      try {
        const data = await joinCraveRequest(token, humiSession, {
          participantKey,
          memberName: memberName.trim() || humiSession.user?.displayName || "家人",
        });
        if (!active) return;
        setRequest(data.request);
        setSubmitted(true);
        markLocalVote(token, participantKey, { joined: true });
        onJoined?.(data);
        setStatus("已加入这个家，主厨能看到你刚才的选择。");
      } catch (error) {
        if (!active) return;
        setStatus(error.message || "已登录，但这次选择暂时没合并成功。");
      }
    }
    claimTemporaryVote();
    return () => {
      active = false;
    };
  }, [humiSession, memberName, participantKey, request, token]);

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
      if (data.request?.status === "closed") {
        setSubmitted(false);
        setStatus("这次征集刚刚结束，你的选择没有再写入。");
        return;
      }
      markLocalVote(token, participantKey, { joined: false });
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

  const closed = request.status === "closed";

  return (
    <FullScreenShell>
      <main className="mx-auto grid min-h-screen w-full max-w-2xl content-center px-5 py-8">
        {submitted ? (
          <CraveSubmittedSheet request={request} status={status} onJoinHousehold={joinHousehold} onClose={onClose} />
        ) : closed ? (
          <CraveClosedSheet request={request} status={status} onClose={onClose} />
        ) : (
          <CraveVoteSheet
            request={request}
            selectedFeeling={selectedFeeling}
            onSelectFeeling={setSelectedFeeling}
            memberName={memberName}
            onMemberNameChange={(event) => setMemberName(event.target.value)}
            note={note}
            onNoteChange={(event) => setNote(event.target.value)}
            status={status}
            onSubmit={submitVote}
          />
        )}
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

function hasLocalVote(token, participantKey) {
  if (typeof window === "undefined" || !token || !participantKey) return false;
  try {
    const votes = JSON.parse(window.localStorage.getItem(PARTICIPANT_VOTES_KEY) || "{}");
    const vote = votes[token];
    return vote?.participantKey === participantKey && vote.joined !== true;
  } catch {
    return false;
  }
}

function markLocalVote(token, participantKey, patch = {}) {
  if (typeof window === "undefined" || !token || !participantKey) return;
  try {
    const votes = JSON.parse(window.localStorage.getItem(PARTICIPANT_VOTES_KEY) || "{}");
    votes[token] = {
      participantKey,
      updatedAt: new Date().toISOString(),
      ...patch,
    };
    window.localStorage.setItem(PARTICIPANT_VOTES_KEY, JSON.stringify(votes));
  } catch {
    // Local markers only improve the join-after-vote flow; vote submission remains authoritative.
  }
}
