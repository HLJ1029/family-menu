import { Check, HandHeart, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { claimHumiMealTask, completeHumiMealTask, isHumiApiSession, loadHumiMealTask } from "../lib/humiApi";
import { HumiScene } from "./ui/HumiScene";

export function MealTaskLanding({ token, humiSession, onLogin, onClose }) {
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const signedIn = isHumiApiSession(humiSession) && humiSession.user?.profileStatus === "complete";

  useEffect(() => {
    if (!signedIn || !token) return undefined;
    let active = true;
    setLoading(true);
    loadHumiMealTask(humiSession, token)
      .then((data) => {
        if (active) setTask(data.task);
      })
      .catch((error) => {
        if (active) setStatus(error.message || "这件家庭任务暂时打不开。" );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [humiSession, signedIn, token]);

  async function claimTask() {
    setPending(true);
    setStatus("");
    try {
      const data = await claimHumiMealTask(humiSession, token);
      setTask(data.task);
    } catch (error) {
      setStatus(error.message || "暂时没能认领，请确认你已经加入这个家。" );
    } finally {
      setPending(false);
    }
  }

  async function finishTask() {
    setPending(true);
    setStatus("");
    try {
      const data = await completeHumiMealTask(humiSession, token);
      setTask(data.task);
    } catch (error) {
      setStatus(error.message || "暂时没能标记完成。" );
    } finally {
      setPending(false);
    }
  }

  return (
    <main data-testid="meal-task-landing" className="mx-auto grid min-h-screen w-full max-w-xl content-center bg-canvas px-5 py-10 text-ink">
      <section className="rounded-[32px] border border-line bg-white p-6 shadow-lift sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-ink/38">HUMI · 今晚协作</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_140px] sm:items-start">
          <div>
            <h1 className="text-4xl font-black leading-tight tracking-[-0.04em]">
              {!signedIn ? "家人请你搭把手" : loading ? "正在打开任务" : task?.label || "这件任务暂时不可用"}
            </h1>
            <p className="mt-3 text-sm font-bold leading-6 text-ink/55">
              {!signedIn
                ? "登录后会确认你是不是这个家的正式成员，不会把游客自动加入家庭。"
                : task?.status === "completed"
                  ? "已经完成。做饭的人回到 Humi 后会看到。"
                  : "这是一件具体的小事；即使没人认领，也不会卡住做饭流程。"}
            </p>
          </div>
          <HumiScene scene={task?.status === "completed" ? "groceryBought" : "groceryClaim"} size="md" className="hidden sm:grid" eager />
        </div>

        {status && <p className="mt-5 rounded-[18px] bg-canvas px-4 py-3 text-sm font-bold leading-6 text-ink/58">{status}</p>}

        <div className="mt-6 grid gap-3">
          {!signedIn && (
            <button type="button" onClick={onLogin} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-ink px-6 text-base font-black text-white">
              <HandHeart size={19} />微信登录后认领
            </button>
          )}
          {signedIn && task?.status === "open" && (
            <button type="button" disabled={pending} onClick={claimTask} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-ink px-6 text-base font-black text-white disabled:opacity-45">
              {pending ? <LoaderCircle className="animate-spin" size={19} /> : <HandHeart size={19} />}我来帮忙
            </button>
          )}
          {signedIn && task?.status === "claimed" && task.claimedBy === humiSession.user?.id && (
            <button type="button" disabled={pending} onClick={finishTask} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-ink px-6 text-base font-black text-white disabled:opacity-45">
              {pending ? <LoaderCircle className="animate-spin" size={19} /> : <Check size={19} />}已经做好
            </button>
          )}
          <button type="button" onClick={onClose} className="min-h-12 rounded-full border border-ink bg-white px-6 text-sm font-black">返回 Humi</button>
        </div>
      </section>
    </main>
  );
}
