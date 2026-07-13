import { Check, ShieldAlert } from "lucide-react";
import { getPlanningMode, profileOptions } from "../lib/profile";
import { HumiBrandIllustration } from "./ui/HumiBrandIllustration";

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

  function finish() {
    onComplete({
      ...draft,
      planningMode: getPlanningMode(draft.planningMode).id,
    });
  }

  const hasAvoidRules = draft.allergies.length > 0 || draft.dislikes.length > 0;
  const buddyText = hasAvoidRules
    ? "这些会作为硬约束避开，先保证家里人不能吃的别被推上桌。"
    : "没有忌口也可以直接开始。其他口味会从感觉征集和做饭记录里慢慢学。";

  return (
    <main className="min-h-screen bg-canvas px-4 py-5 text-ink">
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] w-full max-w-[960px] content-center gap-5">
        <section className="overflow-hidden rounded-[32px] border border-line bg-white p-6 text-ink shadow-card md:p-8">
          <div className="grid gap-6 md:grid-cols-[1fr_170px] md:items-end">
            <div className="flex items-start justify-between gap-4 md:block">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.24em] text-ink/40">HUMI</p>
                <h1 className="mt-5 max-w-2xl text-4xl font-black tracking-[-0.04em] md:text-6xl">
                  先记住家里不能吃的。
                </h1>
                <p className="mt-4 max-w-xl text-sm font-bold leading-7 text-ink/58">
                  忌口会作为硬约束避开；没有也可以直接开始。其他口味以后从自然使用里慢慢学。
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
            <ProfileBlock icon={ShieldAlert} title="家里不能吃什么">
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

          </div>

          <div className="mt-5 rounded-[22px] bg-canvas p-4">
            <p className="text-xs font-black text-ink/38">其他口味不用填</p>
            <p className="mt-2 text-sm font-bold leading-6 text-ink/62">
              Humi 会从家人点的感觉、真正做过的菜和想吃池子里慢慢学，不需要维护口味表。
            </p>
          </div>

          <button
            type="button"
            onClick={finish}
            className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-base font-black text-white transition hover:-translate-y-0.5"
          >
            <Check size={18} />
            {hasAvoidRules ? "保存忌口，开始使用" : "没有忌口，直接开始"}
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
