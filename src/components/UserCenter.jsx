import { useMemo, useState } from "react";
import { BarChart3, Check, ChefHat, Cloud, Database, Heart, LogOut, PackageCheck, Phone, ShieldAlert, SlidersHorizontal, Sparkles, UserRound, Users } from "lucide-react";
import { getDefaultNutritionGoals, normalizeNutritionGoals } from "../lib/insights";
import { formatProfileSummary, getProfileCompletedCount, planningModes, profileOptions, withPlanningModeDefaults } from "../lib/profile";
import { buildValidationSummary, readValidationEvents } from "../lib/validationEvents";
import { CloudAccount } from "./system/CloudAccount";
import { CloudSyncPanel } from "./system/CloudSyncPanel";
import { FamilyPreferencesPanel } from "./system/FamilyPreferencesPanel";
import { Card } from "./ui/Card";
import { HumiIllustrationPanel, HumiPeek } from "./ui/HumiBrandIllustration";
import { isWechatLoginEnabled, isWechatMiniProgramWebView } from "../lib/runtime";
import { requestPhoneBindFromMiniProgram } from "../lib/humiIdentity";

export function UserCenter({
  authProps,
  cloudMenuProps,
  preferenceProps,
  session,
  humiSession,
  family,
  familyProfile,
  setFamilyProfile,
  mealLogs = {},
  nutritionGoals,
  setNutritionGoals,
  recommendationFeedback = [],
  craveSignals = [],
  onExportValidationData,
  onViewChange,
}) {
  const isWechatMiniProgram = isWechatMiniProgramWebView();
  const wechatLoginEnabled = isWechatLoginEnabled();
  const signedIn = Boolean(session?.user || humiSession);
  const signOutLabel = humiSession ? "退出并重新验证微信登录" : "退出账号";
  const [activeSettings, setActiveSettings] = useState(null);
  const [phoneBindStatus, setPhoneBindStatus] = useState("");
  const phoneVerified = Boolean(humiSession?.user?.phoneVerified);
  const phoneMasked = humiSession?.user?.phoneMasked;
  const sourceSummary = Object.values(mealLogs).reduce(
    (summary, log) => {
      if (log?.source === "home") summary.home += 1;
      if (log?.source === "delivery") summary.delivery += 1;
      if (log?.source === "outside") summary.outside += 1;
      if (log?.confirmation === "all") summary.confirmed += 1;
      return summary;
    },
    { home: 0, delivery: 0, outside: 0, confirmed: 0 },
  );
  const validationSummary = buildValidationSummary(readValidationEvents());
  const topReasons = validationSummary.topRejectedReasons.length > 0
    ? validationSummary.topRejectedReasons
    : recommendationFeedback.slice(0, 3).map((item) => ({ label: item.reasonLabel, value: 1 }));
  const familyActivity = [
    ...craveSignals.slice(0, 4).map((item) => ({
      id: item.id,
      title: item.feelingTag === "随便都行" ? "有人说随便都行" : `有人想要：${item.feelingTag}`,
      meta: "感觉征集",
    })),
    ...recommendationFeedback.slice(0, 2).map((item) => ({
      id: item.id,
      title: `不想吃：${item.reasonLabel}`,
      meta: "晚饭反馈",
    })),
  ].slice(0, 5);

  function handleBindPhone() {
    if (!isWechatMiniProgram || !humiSession) {
      setPhoneBindStatus("手机号绑定只在微信小程序内通过用户主动授权完成。");
      return;
    }
    if (requestPhoneBindFromMiniProgram()) {
      setPhoneBindStatus("正在唤起微信手机号授权。拒绝授权也不影响继续使用 Humi。");
      return;
    }
    setPhoneBindStatus("当前环境暂时无法唤起手机号授权，请在微信小程序内重试。");
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_0.85fr]">
      <div className="grid gap-5">
        <section className="grid gap-5 rounded-[32px] bg-ink p-6 text-white shadow-lift md:grid-cols-[1fr_210px] md:items-center md:p-8">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.24em] text-white">我的家</p>
            <h2 className="mt-4 max-w-2xl text-4xl font-black tracking-[-0.04em] md:text-6xl">
              {signedIn ? "一家人的饭，放在一起商量。" : "先把今晚这顿顺起来。"}
            </h2>
            <p className="mt-4 max-w-xl text-sm font-bold leading-7 text-white/62">
              {signedIn
                ? family
                  ? "这里会沉淀家人点过的感觉、买菜协作和真实吃饭反馈。"
                  : "已经登录。创建我的家后，菜单、清单和家人反馈就会一起保存。"
                : "感觉、清单和画像先存在本机；要让家人一起用，再登录保存。"}
            </p>
          </div>
          <HumiIllustrationPanel
            variant="profile"
            title="家庭画像"
            size="lg"
            tone="dark"
            contextKey="user-center-hero"
          />
        </section>

        <CloudAccount
          {...authProps}
          session={session ?? (humiSession ? { user: humiSession.user } : authProps?.session)}
          family={family}
          hideAuthEntry={isWechatMiniProgram || Boolean(humiSession)}
        />
        <section className="relative overflow-hidden rounded-[28px] border border-line bg-white p-5 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">家庭动态</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">最近大家怎么想吃</h3>
              <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
                感觉征集、晚饭反馈和清单协作会沉淀在这里。设置放后面，需要改时再进。
              </p>
            </div>
            <button
              type="button"
              onClick={() => onViewChange("dashboard")}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 text-sm font-black text-white"
            >
              问问大家
            </button>
          </div>
          <div className="mt-4 grid gap-3">
            {familyActivity.length > 0 ? (
              familyActivity.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-[20px] border border-line bg-canvas p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-ink">{item.title}</p>
                    <p className="mt-1 text-xs font-bold text-ink/42">{item.meta}</p>
                  </div>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-ink" />
                </div>
              ))
            ) : (
              <div className="rounded-[20px] border border-line bg-canvas p-4 text-sm font-bold leading-6 text-ink/52">
                还没有协作动态。今晚先点一次“问问大家想吃啥”，这里就会开始长出你家的口味记录。
              </div>
            )}
          </div>
        </section>
        <section className="relative overflow-hidden rounded-[28px] border border-line bg-white p-5 pr-28 shadow-card">
          <HumiPeek
            variant="menu-rejected"
            size="sm"
            className="absolute right-4 top-12 opacity-85"
            contextKey="user-center-feedback-peek"
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">饮食画像</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">吃饭画像慢慢反射</h3>
              <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
                只有确认“全部吃了”的晚餐才进入营养分析；外卖和外食只记录来源。
              </p>
            </div>
            <span className="min-w-[92px] shrink-0 whitespace-nowrap rounded-full bg-ink px-3 py-2 text-center text-xs font-black leading-none text-white">
              已确认 {sourceSummary.confirmed} 次
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StatusRow label="在家做" value={`${sourceSummary.home} 次`} />
            <StatusRow label="点外卖" value={`${sourceSummary.delivery} 次`} />
            <StatusRow label="外面吃" value={`${sourceSummary.outside} 次`} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StatusRow label="推荐接受率" value={`${validationSummary.recommendationAcceptanceRate}%`} />
            <StatusRow label="拒绝原因采集" value={`${validationSummary.rejectedReasonCaptureRate}%`} />
            <StatusRow label="清单查看" value={`${validationSummary.groceryViewed} 次`} />
          </div>
          <div className="mt-4 rounded-[22px] border border-line bg-canvas p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-ink/38">晚饭反馈</p>
            <h4 className="mt-2 text-lg font-black">常见不想吃原因</h4>
            <div className="mt-3 flex flex-wrap gap-2">
              {topReasons.length > 0 ? (
                topReasons.map((reason) => (
                  <span key={reason.label} className="rounded-full bg-white px-3 py-2 text-xs font-black text-ink/60">
                    {reason.label} · {reason.value}
                  </span>
                ))
              ) : (
                <span className="text-sm font-bold text-ink/45">你标记“不想吃”后，这里会慢慢整理原因。</span>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onViewChange("dashboard")}
                className="inline-flex min-h-10 items-center justify-center rounded-full bg-ink px-4 text-xs font-black text-white"
              >
                继续安排今晚
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <UtilityButton icon={BarChart3} label="营养分析" onClick={() => onViewChange("stats")} />
            <UtilityButton icon={PackageCheck} label="家中已有" onClick={() => onViewChange("inventory")} />
            <UtilityButton icon={ChefHat} label="菜谱库" onClick={() => onViewChange("library")} />
          </div>
        </section>

        <section className="rounded-[28px] border border-line bg-white p-5 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">设置</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">需要改时再进入</h3>
              <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
                家庭画像和营养目标会自动保存。我的家默认展示结果，不把表单一直摊开。
              </p>
            </div>
            <span className="rounded-full bg-canvas px-3 py-1 text-xs font-black text-ink/45">
              {formatProfileSummary(familyProfile)}
            </span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <UtilityButton icon={UserRound} label="修改家庭画像" onClick={() => setActiveSettings(activeSettings === "profile" ? null : "profile")} />
            <UtilityButton icon={SlidersHorizontal} label="调整营养目标" onClick={() => setActiveSettings(activeSettings === "goals" ? null : "goals")} />
            <UtilityButton icon={Users} label="家人口味" onClick={() => setActiveSettings(activeSettings === "preferences" ? null : "preferences")} />
          </div>
        </section>

        {activeSettings === "profile" && (
          <FamilyProfilePanel
            session={session}
            signedIn={signedIn}
            profile={familyProfile}
            setProfile={setFamilyProfile}
          />
        )}
        {activeSettings === "goals" && (
          <NutritionGoalsPanel
            profile={familyProfile}
            goals={nutritionGoals}
            setGoals={setNutritionGoals}
          />
        )}
        <CloudSyncPanel {...cloudMenuProps} />
        {activeSettings === "preferences" && <FamilyPreferencesPanel {...preferenceProps} />}
      </div>

      <aside className="grid content-start gap-5">
        <Card className="relative overflow-hidden pr-24">
          <HumiPeek
            variant={family ? "profile" : "family-taste-talk"}
            size="sm"
            className="absolute right-4 top-4 opacity-85"
            contextKey="user-status-card-peek"
          />
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">我的家</p>
              <h3 className="card-title">当前状态</h3>
            </div>
            <UserRound size={22} />
          </div>
          <div className="mt-5 grid gap-3">
            <StatusRow label="登录" value={getIdentityLabel({ session, humiSession })} />
            {humiSession && (
              <StatusRow label="手机号" value={phoneVerified ? phoneMasked || "已绑定" : "未绑定"} />
            )}
            <StatusRow label="我的家" value={family?.name ?? (signedIn ? "待创建" : "未登录")} />
            <StatusRow
              label="保存方式"
              value={isWechatMiniProgram && !family ? "本机游客模式" : getSyncModeLabel({ family, cloudMenuProps, signedIn })}
            />
          </div>
          {signedIn && authProps?.onSignOut && (
            <button
              type="button"
              onClick={authProps.onSignOut}
              disabled={authProps.cloudLoading}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-black text-ink/62 transition hover:border-ink/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogOut size={16} />
              {signOutLabel}
            </button>
          )}
          {isWechatMiniProgram && humiSession && !phoneVerified && (
            <button
              type="button"
              onClick={handleBindPhone}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-black text-white transition hover:-translate-y-0.5"
            >
              <Phone size={16} />
              绑定手机号
            </button>
          )}
          {isWechatMiniProgram && humiSession && phoneVerified && (
            <div className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-full bg-canvas px-4 text-sm font-black text-ink/62">
              <Phone size={16} />
              手机号已绑定
            </div>
          )}
          {phoneBindStatus && (
            <p className="mt-3 text-xs font-bold leading-5 text-ink/42">{phoneBindStatus}</p>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">接下来</p>
              <h3 className="card-title">接下来</h3>
            </div>
            <Database size={22} />
          </div>
          <p className="mt-4 text-sm font-bold leading-7 text-ink/52">
            现在可以先用 Humi 安排晚饭。下一步准备小程序入口，让家里人更容易打开。
          </p>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-white">
              <Cloud size={20} />
            </span>
            <div>
              <p className="font-black">{humiSession ? "已通过微信登录" : wechatLoginEnabled ? "微信登录" : "游客模式"}</p>
              <p className="mt-1 text-xs font-bold leading-5 text-ink/45">
                {humiSession
                  ? "菜单、画像和清单会优先跟随 Humi 账号。"
                  : wechatLoginEnabled
                  ? "小程序内会使用微信身份登录；游客仍可先完成晚饭安排。"
                  : "首发先不要求登录；核心菜单、计划和清单保存在当前设备。"}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <a
              href="/privacy.html"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-line bg-canvas px-3 text-xs font-black text-ink/58 transition hover:text-ink"
            >
              隐私政策
            </a>
            <a
              href="/terms.html"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-line bg-canvas px-3 text-xs font-black text-ink/58 transition hover:text-ink"
            >
              用户协议
            </a>
          </div>
        </Card>
      </aside>
    </section>
  );
}

function FamilyProfilePanel({ session, signedIn, profile, setProfile }) {
  const [draft, setDraft] = useState(profile);
  const [status, setStatus] = useState("");
  const completedCount = useMemo(() => getProfileCompletedCount(profile), [profile]);

  function updateValue(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleListValue(key, value) {
    setDraft((current) => {
      const values = new Set(current[key] ?? []);
      if (values.has(value)) values.delete(value);
      else values.add(value);
      return { ...current, [key]: [...values] };
    });
  }

  function saveProfile() {
    setProfile(draft);
    setStatus("家庭画像已保存。之后推荐会优先参考这些习惯。");
  }

  return (
    <section className="rounded-[28px] border border-line bg-white p-5 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">家庭画像</p>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">让 Humi 更懂你家</h3>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            先选几个常用习惯，推荐时会压缩成一份简短画像，少传废话，也更贴近你家。
          </p>
        </div>
        <span className="rounded-full bg-ink px-3 py-1 text-xs font-black text-white">
          {completedCount}/5 已完成
        </span>
      </div>

      {!session?.user && !signedIn && (
        <div className="mt-4 rounded-[20px] bg-canvas p-4 text-sm font-bold leading-6 text-ink/52">
          可以先填写体验；创建我的家后，菜单、库存和画像会一起保存。
        </div>
      )}

      <div className="mt-5 grid gap-4">
        <ProfileStep icon={Sparkles} title="这次主要想规划什么">
          <div className="grid gap-2 sm:grid-cols-2">
            {planningModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setDraft((current) => withPlanningModeDefaults(current, mode.id))}
                className={`rounded-[20px] border p-4 text-left transition ${
                  draft.planningMode === mode.id
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-white text-ink/58 hover:text-ink"
                }`}
              >
                <p className="text-sm font-black">{mode.label}</p>
                <p className={`mt-1 text-xs font-bold leading-5 ${draft.planningMode === mode.id ? "text-white/58" : "text-ink/40"}`}>
                  {mode.description}
                </p>
              </button>
            ))}
          </div>
        </ProfileStep>

        <ProfileStep icon={Users} title="家里几个人吃饭">
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((size) => (
              <ChoiceButton
                key={size}
                active={Number(draft.familySize) === size}
                label={size === 4 ? "4人+" : `${size}人`}
                onClick={() => updateValue("familySize", size)}
              />
            ))}
          </div>
          <label className="mt-3 flex min-h-12 cursor-pointer items-center justify-between rounded-[18px] bg-canvas px-4">
            <span className="text-sm font-black">有孩子一起吃</span>
            <input
              type="checkbox"
              checked={Boolean(draft.hasChildren)}
              onChange={(event) => updateValue("hasChildren", event.target.checked)}
              className="h-5 w-5 accent-black"
            />
          </label>
        </ProfileStep>

        <ProfileStep icon={Heart} title="平时喜欢怎么吃">
          <TagChoices
            options={profileOptions.tastePreferences}
            values={draft.tastePreferences}
            onToggle={(value) => toggleListValue("tastePreferences", value)}
          />
        </ProfileStep>

        <ProfileStep icon={SlidersHorizontal} title="晚饭最在意什么">
          <TagChoices
            options={profileOptions.goals}
            values={draft.goals}
            onToggle={(value) => toggleListValue("goals", value)}
          />
        </ProfileStep>

        <ProfileStep icon={ShieldAlert} title="不想吃 / 不能吃">
          <p className="mb-2 text-xs font-bold text-ink/42">不喜欢</p>
          <TagChoices
            options={profileOptions.dislikes}
            values={draft.dislikes}
            onToggle={(value) => toggleListValue("dislikes", value)}
          />
          <p className="mb-2 mt-4 text-xs font-bold text-ink/42">忌口或过敏</p>
          <TagChoices
            options={profileOptions.allergies}
            values={draft.allergies}
            onToggle={(value) => toggleListValue("allergies", value)}
          />
        </ProfileStep>

        <ProfileStep icon={Database} title="买菜接受度">
          <div className="grid gap-2 sm:grid-cols-3">
            <ChoiceButton
              active={draft.shoppingTolerance === "low"}
              label="少买菜"
              note="优先用库存"
              onClick={() => updateValue("shoppingTolerance", "low")}
            />
            <ChoiceButton
              active={draft.shoppingTolerance === "medium"}
              label="可以买几样"
              note="2-3样主食材"
              onClick={() => updateValue("shoppingTolerance", "medium")}
            />
            <ChoiceButton
              active={draft.shoppingTolerance === "high"}
              label="愿意专门买"
              note="好吃优先"
              onClick={() => updateValue("shoppingTolerance", "high")}
            />
          </div>
        </ProfileStep>
      </div>

      <div className="mt-5 rounded-[20px] bg-canvas p-4">
        <p className="text-xs font-black text-ink/38">画像摘要</p>
        <p className="mt-2 text-sm font-bold leading-6 text-ink/62">{formatProfileSummary(draft)}</p>
      </div>

      {status && <p className="mt-3 text-xs font-bold text-ink/45">{status}</p>}

      <button
        type="button"
        onClick={saveProfile}
        className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-black text-white transition hover:-translate-y-0.5"
      >
        <Check size={17} className="text-white" />
        保存家庭画像
      </button>
    </section>
  );
}

function NutritionGoalsPanel({ profile, goals, setGoals }) {
  const normalizedGoals = normalizeNutritionGoals(profile, goals);
  const [draft, setDraft] = useState(normalizedGoals);
  const [status, setStatus] = useState("");

  function updateNumber(key, value) {
    setDraft((current) => ({ ...current, [key]: Number(value) }));
  }

  function resetToModeDefaults() {
    const defaults = getDefaultNutritionGoals(profile);
    setDraft(defaults);
    setGoals(defaults);
    setStatus("已恢复当前规划模式的默认目标。");
  }

  function saveGoals() {
    const nextGoals = {
      ...draft,
      caloriesKcalMax: Number(draft.caloriesKcalMax),
      proteinGMin: Number(draft.proteinGMin),
      fatGMax: Number(draft.fatGMax),
      carbsGMax: Number(draft.carbsGMax),
      vegetableRatioMin: Number(draft.vegetableRatioMin),
      proteinRatioMin: Number(draft.proteinRatioMin),
      quickRatioMin: Number(draft.quickRatioMin),
      homeCookRatioMin: Number(draft.homeCookRatioMin),
    };
    setGoals(nextGoals);
    setStatus("营养目标已保存在本机。");
  }

  return (
    <section className="rounded-[28px] border border-line bg-white p-5 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">营养目标</p>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">每顿晚餐参考目标</h3>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            这里只管理晚餐估算目标，不代表全天摄入，也不替代专业营养建议。
          </p>
        </div>
        <button
          type="button"
          onClick={resetToModeDefaults}
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full bg-canvas px-4 text-xs font-black text-ink/62 transition hover:text-ink"
        >
          使用模式默认
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <GoalInput label="热量上限" value={draft.caloriesKcalMax} unit="kcal" min={300} max={900} step={10} onChange={(value) => updateNumber("caloriesKcalMax", value)} />
        <GoalInput label="蛋白质下限" value={draft.proteinGMin} unit="g" min={8} max={50} step={1} onChange={(value) => updateNumber("proteinGMin", value)} />
        <GoalInput label="脂肪上限" value={draft.fatGMax} unit="g" min={8} max={45} step={1} onChange={(value) => updateNumber("fatGMax", value)} />
        <GoalInput label="碳水上限" value={draft.carbsGMax} unit="g" min={30} max={120} step={1} onChange={(value) => updateNumber("carbsGMax", value)} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <RatioInput label="蔬菜比例" value={draft.vegetableRatioMin} onChange={(value) => updateNumber("vegetableRatioMin", value)} />
        <RatioInput label="蛋白类比例" value={draft.proteinRatioMin} onChange={(value) => updateNumber("proteinRatioMin", value)} />
        <RatioInput label="省时菜比例" value={draft.quickRatioMin} onChange={(value) => updateNumber("quickRatioMin", value)} />
        <RatioInput label="在家做比例" value={draft.homeCookRatioMin} onChange={(value) => updateNumber("homeCookRatioMin", value)} />
      </div>

      {status && <p className="mt-3 text-xs font-bold text-ink/45">{status}</p>}

      <button
        type="button"
        onClick={saveGoals}
        className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-black text-white transition hover:-translate-y-0.5"
      >
        <Check size={17} className="text-white" />
        保存营养目标
      </button>
    </section>
  );
}

function GoalInput({ label, value, unit, min, max, step, onChange }) {
  return (
    <label className="rounded-[20px] bg-canvas p-4">
      <span className="flex items-center justify-between gap-3 text-sm font-black">
        <span>{label}</span>
        <span className="text-ink/48">{Math.round(value)}{unit}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 w-full accent-black"
      />
    </label>
  );
}

function RatioInput({ label, value, onChange }) {
  return (
    <label className="rounded-[20px] bg-canvas p-4">
      <span className="flex items-center justify-between gap-3 text-sm font-black">
        <span>{label}</span>
        <span className="text-ink/48">{Math.round(value * 100)}%</span>
      </span>
      <input
        type="range"
        min={0.1}
        max={0.8}
        step={0.05}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 w-full accent-black"
      />
    </label>
  );
}

function ProfileStep({ icon: Icon, title, children }) {
  return (
    <div className="rounded-[22px] border border-line bg-canvas p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-white text-ink">
          <Icon size={17} />
        </span>
        <p className="font-black">{title}</p>
      </div>
      {children}
    </div>
  );
}

function TagChoices({ options, values = [], onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <ChoiceButton
          key={option}
          active={values.includes(option)}
          label={option}
          onClick={() => onToggle(option)}
        />
      ))}
    </div>
  );
}

function ChoiceButton({ active, label, note, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-black transition ${
        active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/58 hover:text-ink"
      }`}
    >
      {label}
      {note && <span className={`ml-1 text-xs ${active ? "text-white/58" : "text-ink/38"}`}>{note}</span>}
    </button>
  );
}

function getSyncModeLabel({ family, cloudMenuProps, signedIn }) {
  if (!family) return signedIn ? "创建我的家后保存" : "先保存在本机";
  if (cloudMenuProps?.cloudMenuEnabled && cloudMenuProps?.cloudGroceryEnabled) return "已保存到我的家";
  if (cloudMenuProps?.cloudMenuEnabled || cloudMenuProps?.cloudGroceryEnabled) return "部分已保存";
  return "保存到我的家";
}

function getIdentityLabel({ session, humiSession }) {
  if (humiSession?.user) return humiSession.user.displayName ?? "微信用户";
  if (session?.user?.email) return session.user.email;
  return "未登录";
}

function StatusRow({ label, value }) {
  return (
    <div className="rounded-[18px] bg-canvas p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">{label}</p>
      <p className="mt-1 break-all text-sm font-black">{value}</p>
    </div>
  );
}

function UtilityButton({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-canvas px-4 text-sm font-black text-ink/62 transition hover:-translate-y-0.5 hover:bg-ink hover:text-ink"
    >
      <Icon size={17} />
      {label}
    </button>
  );
}
