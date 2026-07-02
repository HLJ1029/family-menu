import { Check, ShieldAlert, SlidersHorizontal, Sparkles, Users } from "lucide-react";
import { formatProfileSummary, getPlanningMode, planningModes, profileOptions, withPlanningModeDefaults } from "../lib/profile";
import { HumiBrandCallout, HumiBrandIllustration } from "./ui/HumiBrandIllustration";

export function ProfileOnboarding({ profile, onComplete, onSignOut }) {
  const draft = {
    familySize: 2,
    hasChildren: false,
    tastePreferences: [],
    goals: [],
    dislikes: [],
    allergies: [],
    shoppingTolerance: "medium",
    planningMode: "daily_family",
    ...profile,
  };

  function updateProfile(nextPatch) {
    onComplete({ ...draft, ...nextPatch }, { stayOnboarding: true });
  }

  function toggleListValue(key, value) {
    const values = new Set(draft[key] ?? []);
    if (values.has(value)) values.delete(value);
    else values.add(value);
    updateProfile({ [key]: [...values] });
  }

  function chooseMode(modeId) {
    onComplete(withPlanningModeDefaults(draft, modeId), { stayOnboarding: true });
  }

  function finish() {
    onComplete({
      ...draft,
      planningMode: getPlanningMode(draft.planningMode).id,
    });
  }

  const hasAvoidRules = draft.allergies.length > 0 || draft.dislikes.length > 0;
  const buddyText = hasAvoidRules
    ? "这些会作为硬约束避开，先保证家里人不能吃的别被推上桌。"
    : draft.hasChildren
    ? "孩子爱吃和大人省心会一起进入推荐条件。"
    : draft.goals.length > 0
      ? `先按“${draft.goals[0]}”来安排，后面还能随时改。`
      : "先点不能吃的，其他口味 Humi 会从以后每顿饭里慢慢学。";

  return (
    <main className="min-h-screen bg-canvas px-4 py-5 text-ink">
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] w-full max-w-[960px] content-center gap-5">
        <section className="overflow-hidden rounded-[32px] border border-line bg-white p-6 text-ink shadow-card md:p-8">
          <div className="grid gap-6 md:grid-cols-[1fr_170px] md:items-end">
            <div className="flex items-start justify-between gap-4 md:block">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.24em] text-ink/40">HUMI</p>
                <h1 className="mt-5 max-w-2xl text-4xl font-black tracking-[-0.04em] md:text-6xl">
                  先告诉 Humi 怎么为你安排菜单。
                </h1>
                <p className="mt-4 max-w-xl text-sm font-bold leading-7 text-ink/58">
                  先点家里不能吃的，Humi 会把它当成硬约束避开。其他口味以后会从每顿饭里慢慢学。
                </p>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="shrink-0 rounded-full border border-ink/16 px-4 py-2 text-xs font-black text-ink/58 transition hover:border-ink/28 hover:text-ink md:mt-6"
              >
                退出
              </button>
            </div>
            <div className="rounded-[28px] border border-line bg-canvas p-4">
              <HumiBrandIllustration
                variant="profile-preferences"
                size="xl"
                className="mx-auto"
                title="家庭画像生活场景"
                contextKey="profile-onboarding-hero"
              />
              <p className="mt-2 text-center text-sm font-black text-ink">家庭菜单画像</p>
              <p className="mt-1 text-center text-xs font-bold leading-5 text-ink/52">{buddyText}</p>
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-line bg-white p-5 shadow-card md:p-6">
          <div className="grid gap-5">
            <ProfileBlock icon={Sparkles} title="这次主要想规划什么">
              <div className="grid gap-3 md:grid-cols-2">
                {planningModes.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => chooseMode(mode.id)}
                    className={`rounded-[22px] border p-4 text-left transition ${
                      draft.planningMode === mode.id
                        ? "border-ink bg-ink text-white"
                        : "border-line bg-canvas text-ink hover:border-ink/20"
                    }`}
                  >
                    <p className="text-base font-black">{mode.label}</p>
                    <p className={`mt-2 text-xs font-bold leading-5 ${draft.planningMode === mode.id ? "text-white/58" : "text-ink/45"}`}>
                      {mode.description}
                    </p>
                  </button>
                ))}
              </div>
            </ProfileBlock>

            <ProfileBlock icon={Users} title="家里几个人吃饭">
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((size) => (
                  <ChoiceButton
                    key={size}
                    active={Number(draft.familySize) === size}
                    label={size === 4 ? "4人+" : `${size}人`}
                    onClick={() => updateProfile({ familySize: size })}
                  />
                ))}
              </div>
              <label className="mt-3 flex min-h-12 cursor-pointer items-center justify-between rounded-[18px] bg-canvas px-4">
                <span className="text-sm font-black">有孩子一起吃</span>
                <input
                  type="checkbox"
                  checked={Boolean(draft.hasChildren)}
                  onChange={(event) => updateProfile({ hasChildren: event.target.checked })}
                  className="h-5 w-5 accent-black"
                />
              </label>
            </ProfileBlock>

            <ProfileBlock icon={ShieldAlert} title="不想吃 / 不能吃">
              <p className="mb-2 text-xs font-bold text-ink/42">这些会被 Humi 当成硬约束避开</p>
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
            </ProfileBlock>

            <ProfileBlock icon={SlidersHorizontal} title="晚饭目标">
              <p className="mb-2 text-xs font-bold text-ink/42">这次更在意</p>
              <TagChoices
                options={profileOptions.goals}
                values={draft.goals}
                onToggle={(value) => toggleListValue("goals", value)}
              />
            </ProfileBlock>
          </div>

          <div className="mt-5 rounded-[22px] bg-canvas p-4">
            <p className="text-xs font-black text-ink/38">当前画像</p>
            <p className="mt-2 text-sm font-bold leading-6 text-ink/62">{formatProfileSummary(draft)}</p>
          </div>

          <HumiBrandCallout
            variant={hasAvoidRules ? "profile-preferences" : "weekly"}
            title={hasAvoidRules ? "我会避开这些" : "画像快好了"}
            text={buddyText}
            className="mt-4"
            compact
            contextKey={hasAvoidRules ? "profile-avoid-callout" : "profile-ready-callout"}
          />

          <button
            type="button"
            onClick={finish}
            className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-base font-black text-white transition hover:-translate-y-0.5"
          >
            <Check size={18} />
            开始使用 Humi
          </button>
        </section>
      </div>
    </main>
  );
}

function ProfileBlock({ icon: Icon, title, children }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-ink text-white">
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

function ChoiceButton({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-black transition ${
        active ? "border-ink bg-ink text-white" : "border-line bg-canvas text-ink/58 hover:border-ink/20 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
