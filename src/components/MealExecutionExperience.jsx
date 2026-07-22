import { Check, ChevronRight, Clock3, Flame, HandHeart, LoaderCircle, TimerReset, UtensilsCrossed } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { effortTiers } from "../lib/mealExecution";
import { remainingLocalTimerSeconds } from "../lib/mealRun";

const tierDetails = {
  quick_15: "一锅或一盘，先把饭开起来",
  easy_30: "简单一主一配，最多两件厨具",
  normal: "今天有精力，照完整节奏来",
};

const feedbackOptions = [
  { id: "want_again", label: "下次还想吃" },
  { id: "change_next_time", label: "可以换换" },
  { id: "too_much_effort", label: "太费劲" },
];

export function MealExecutionExperience({
  effortTier,
  onSelectEffortTier,
  planRecipes = [],
  mealRun,
  weeklyCompletedCount = 0,
  canAcceptPlan = true,
  signedIn = false,
  online = true,
  pending = false,
  status = "",
  onAcceptPlan,
  onStart,
  onProgress,
  onComplete,
  onAbandon,
  onDowngrade,
  onFeedback,
  onCreateTask,
  onScheduleReminder,
}) {
  const [downgradeOpen, setDowngradeOpen] = useState(false);
  const [now, setNow] = useState(() => new Date().toISOString());
  const [reminderAt, setReminderAt] = useState("");
  const timeline = mealRun?.timeline?.steps ?? [];
  const currentStepIndex = Math.max(0, timeline.findIndex((step) => step.id === mealRun?.currentStepId));
  const currentStep = timeline[currentStepIndex] ?? null;
  const nextStep = timeline[currentStepIndex + 1] ?? null;
  const timerSeconds = remainingLocalTimerSeconds(mealRun, now);
  const totalMinutes = useMemo(() => (
    mealRun?.timeline?.totalSeconds
      ? Math.ceil(mealRun.timeline.totalSeconds / 60)
      : Math.max(...planRecipes.map((recipe) => recipe.cookAssist?.totalMinutes ?? recipe.timeMinutes ?? 0), 0)
  ), [mealRun?.timeline?.totalSeconds, planRecipes]);
  const cookware = useMemo(() => [...new Set(planRecipes.flatMap((recipe) => recipe.cookAssist?.cookware ?? []))], [planRecipes]);
  const selectedFeedback = mealRun?.feedback?.find((entry) => entry.userId === "guest")?.value
    || mealRun?.feedback?.at(-1)?.value
    || "";

  useEffect(() => {
    if (mealRun?.status !== "cooking" || !mealRun?.timerEndsAt) return undefined;
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => window.clearInterval(timer);
  }, [mealRun?.status, mealRun?.timerEndsAt]);

  if (mealRun?.status === "cooking") {
    return (
      <div data-testid="meal-execution-experience" className="fixed inset-0 z-[80] overflow-y-auto bg-canvas text-ink">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-5 pb-8 pt-[max(28px,env(safe-area-inset-top))]">
          <header className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-ink/40">正在做今晚这顿</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">跟着这一条时间线走</h2>
            </div>
            <span className="rounded-full border border-line bg-white px-3 py-2 text-xs font-black">{online ? "已保存" : "离线可继续"}</span>
          </header>

          <section data-testid="meal-cooking-timeline" className="mt-6 flex-1 rounded-[30px] border border-line bg-white p-5 shadow-card">
            <div className="flex items-center justify-between gap-3 text-xs font-black text-ink/42">
              <span>步骤 {Math.min(currentStepIndex + 1, timeline.length)} / {timeline.length}</span>
              <span>整顿约 {totalMinutes || 15} 分钟</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink/8">
              <div className="h-full rounded-full bg-ink transition-all" style={{ width: `${timeline.length ? ((currentStepIndex + 1) / timeline.length) * 100 : 0}%` }} />
            </div>

            {currentStep && (
              <div className="mt-8">
                <div className="flex items-center gap-2 text-sm font-black text-ink/45">
                  {currentStep.attention === "passive" ? <TimerReset size={18} /> : <Flame size={18} />}
                  {currentStep.recipeName}
                </div>
                <h3 data-testid="meal-current-step" className="mt-4 text-3xl font-black leading-tight tracking-[-0.04em]">{currentStep.text}</h3>
                {currentStep.attention === "passive" && (
                  <div className="mt-6 rounded-[24px] bg-ink px-5 py-5 text-white">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-white/55">计时中</p>
                    <p className="mt-2 text-4xl font-black tabular-nums">{formatSeconds(timerSeconds)}</p>
                    <p className="mt-2 text-sm font-bold text-white/68">退到微信聊天也没关系，回来按结束时间继续。</p>
                  </div>
                )}
                {currentStep.rescueTip && (
                  <p className="mt-5 rounded-[20px] border border-line bg-canvas px-4 py-3 text-sm font-bold leading-6 text-ink/60">没按预期也别慌：{currentStep.rescueTip}</p>
                )}
              </div>
            )}

            {nextStep && (
              <div className="mt-7 border-t border-line pt-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">下一步</p>
                <p className="mt-2 text-sm font-bold leading-6 text-ink/58">{nextStep.recipeName} · {nextStep.text}</p>
              </div>
            )}

            <div className="mt-8 grid gap-3">
              {nextStep ? (
                <button type="button" onClick={() => onProgress?.(nextStep)} disabled={pending} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-ink px-6 text-base font-black text-white disabled:opacity-45">
                  {pending ? <LoaderCircle className="animate-spin" size={19} /> : <ChevronRight size={19} />}
                  下一步
                </button>
              ) : (
                <p className="rounded-[20px] bg-canvas px-4 py-3 text-center text-sm font-black">步骤走完了，确认饭菜真的上桌后再记录。</p>
              )}
              <button type="button" onClick={onComplete} disabled={pending} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-ink bg-white px-6 text-base font-black disabled:opacity-45">
                <Check size={19} />上桌了
              </button>
              <button type="button" onClick={() => setDowngradeOpen((value) => !value)} className="min-h-11 text-sm font-black text-ink/55">太累了</button>
            </div>

            {downgradeOpen && (
              <div className="mt-3 grid gap-2 rounded-[24px] border border-line bg-canvas p-3">
                <p className="px-2 py-1 text-xs font-bold leading-5 text-ink/52">少做一点不算失败，选一个最省力的改法。</p>
                {mealRun.recipeIds.length > 1 && <DowngradeButton label="去掉可选配菜" onClick={() => onDowngrade?.("remove_optional_side")} />}
                <DowngradeButton label="换成更省力的菜" onClick={() => onDowngrade?.("lower_effort_recipe")} />
                <DowngradeButton label="主食改现成" onClick={() => onDowngrade?.("ready_staple")} />
              </div>
            )}
            {mealRun.readyStaple && <p className="mt-4 text-center text-sm font-black">主食：{mealRun.readyStaple}</p>}
          </section>
        </div>
      </div>
    );
  }

  if (mealRun?.status === "completed") {
    return (
      <section data-testid="meal-execution-experience" className="mt-6">
        <div data-testid="meal-completion-sheet" className="rounded-[28px] bg-ink p-5 text-white">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/50">真的上桌了</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">这顿算数。</h2>
          <p className="mt-3 text-sm font-bold leading-6 text-white/68">本周做成 {weeklyCompletedCount} 顿。没有连续打卡，也不用补作业。</p>
        </div>
        <div className="mt-4 rounded-[26px] border border-line bg-white p-4">
          <p className="text-sm font-black">家里觉得这顿怎么样？</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {feedbackOptions.map((option) => (
              <button key={option.id} type="button" onClick={() => onFeedback?.(option.id)} className={`min-h-12 rounded-[18px] border px-2 text-xs font-black ${selectedFeedback === option.id ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{option.label}</button>
            ))}
          </div>
        </div>
        {signedIn ? (
          <div className="mt-4 rounded-[26px] border border-line bg-white p-4">
            <p className="text-sm font-black">想好下一次做饭时间再提醒</p>
            <input type="datetime-local" value={reminderAt} onChange={(event) => setReminderAt(event.target.value)} className="mt-3 min-h-12 w-full rounded-[16px] border border-line px-3 text-sm font-bold" />
            <button type="button" disabled={!reminderAt || pending} onClick={() => onScheduleReminder?.(reminderAt)} className="mt-3 min-h-12 w-full rounded-full bg-ink px-4 text-sm font-black text-white disabled:opacity-35">预约下一顿</button>
          </div>
        ) : (
          <div data-testid="meal-reminder-guest-gate" className="mt-4 rounded-[24px] border border-line bg-white px-4 py-4 text-sm font-bold leading-6 text-ink/58">登录后可以自己选下一次做饭时间，再决定是否接受一条微信提醒。</div>
        )}
      </section>
    );
  }

  if (mealRun?.status === "planned") {
    return (
      <section data-testid="meal-execution-experience" className="mt-6 rounded-[28px] border border-line bg-white p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/38">今晚已经少想一步</p>
        <h2 className="mt-3 text-2xl font-black tracking-[-0.04em]">{planRecipes.map((recipe) => recipe.name).join(" + ")}</h2>
        <p className="mt-3 text-sm font-bold text-ink/55">约 {totalMinutes || 15} 分钟 · {cookwareLabel(cookware)}{mealRun.readyStaple ? ` · ${mealRun.readyStaple}` : ""}</p>
        <button type="button" onClick={onStart} disabled={pending} className="mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-ink px-6 text-base font-black text-white disabled:opacity-45">
          {pending ? <LoaderCircle className="animate-spin" size={19} /> : <Flame size={19} />}开始做
        </button>
        <div data-testid="meal-task-suggestion" className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onCreateTask?.("buy")} className="min-h-11 rounded-full border border-line px-3 text-xs font-black"><HandHeart className="mr-1 inline" size={15} />请家人买一样</button>
          <button type="button" onClick={() => onCreateTask?.("prep")} className="min-h-11 rounded-full border border-line px-3 text-xs font-black"><UtensilsCrossed className="mr-1 inline" size={15} />请家人帮备菜</button>
        </div>
        <button type="button" onClick={() => onAbandon?.("plans_changed")} className="mt-3 min-h-10 w-full text-xs font-black text-ink/45">今晚改计划</button>
        {status && <p className="mt-3 text-center text-xs font-bold text-ink/48">{status}</p>}
      </section>
    );
  }

  return (
    <section data-testid="meal-execution-experience" className="mt-6 rounded-[28px] border border-line bg-white p-4 md:p-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/38">今天还有多少行动力</p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">先选省事程度，再看今晚做什么</h2>
        </div>
        <span className="shrink-0 text-xs font-black text-ink/45">本周 {weeklyCompletedCount}/2 顿</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {effortTiers.map((tier) => (
          <button
            data-testid="meal-effort-tier"
            key={tier.id}
            type="button"
            onClick={() => onSelectEffortTier?.(tier.id)}
            aria-pressed={effortTier === tier.id}
            className={`rounded-[20px] border p-3 text-left transition ${effortTier === tier.id ? "border-ink bg-ink text-white" : "border-line bg-canvas text-ink"}`}
          >
            <span className="block text-sm font-black">{tier.label}</span>
            <span className={`mt-2 block text-xs font-bold leading-5 ${effortTier === tier.id ? "text-white/65" : "text-ink/45"}`}>{tierDetails[tier.id]}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 rounded-[22px] bg-canvas p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-ink/35">今晚最低行动力方案</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {planRecipes.map((recipe) => <span key={recipe.id} className="rounded-full bg-white px-3 py-2 text-sm font-black">{recipe.name}</span>)}
            </div>
          </div>
          <Clock3 className="shrink-0 text-ink/35" size={22} />
        </div>
        <p className="mt-3 text-xs font-bold leading-5 text-ink/48">约 {totalMinutes || 15} 分钟 · {cookwareLabel(cookware)}{effortTier === "quick_15" ? " · 不腌制、不多锅" : ""}</p>
      </div>
      {canAcceptPlan ? (
        <button type="button" onClick={onAcceptPlan} disabled={pending || planRecipes.length === 0} className="mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-ink px-6 text-base font-black text-white disabled:opacity-40">
          {pending ? <LoaderCircle className="animate-spin" size={19} /> : <Check size={19} />}就做这顿
        </button>
      ) : (
        <p className="mt-4 rounded-[18px] border border-line px-4 py-3 text-sm font-bold leading-6 text-ink/55">主厨选定今晚菜单后，你也可以直接开始做、推进步骤和确认上桌。</p>
      )}
      {status && <p className="mt-3 text-center text-xs font-bold text-ink/48">{status}</p>}
    </section>
  );
}

function DowngradeButton({ label, onClick }) {
  return <button type="button" onClick={onClick} className="min-h-11 rounded-[16px] bg-white px-4 text-left text-sm font-black">{label}</button>;
}

function formatSeconds(seconds) {
  const safe = Math.max(0, Number(seconds || 0));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function cookwareLabel(cookware) {
  const labels = { board: "砧板", wok: "炒锅", pot: "汤锅", steamer: "蒸锅", rice_cooker: "电饭锅" };
  return cookware.length > 0 ? cookware.map((item) => labels[item] || item).join("、") : "少洗锅";
}
