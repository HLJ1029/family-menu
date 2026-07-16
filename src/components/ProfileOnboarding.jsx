import { Check, ShieldAlert, Users } from "lucide-react";
import { formatHardProfileSummary, profileOptions } from "../lib/profile";
import { HumiScene } from "./ui/HumiScene";

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
      hardAvoidReviewed: true,
    });
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-5 text-ink">
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] w-full max-w-[760px] content-center">
        <section className="rounded-[28px] border border-line bg-white p-5 shadow-card md:p-7">
          <div className="grid gap-4 sm:grid-cols-[1fr_180px] sm:items-start">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.24em] text-ink/40">HUMI</p>
              <h1 className="mt-3 max-w-2xl text-3xl font-black tracking-[-0.04em] md:text-4xl">
                先确认家里不能吃的
              </h1>
              <p className="mt-3 max-w-xl text-sm font-bold leading-6 text-ink/52">
                人数影响份量，忌口影响安全。喜欢什么不用填，Humi 会从日常选择里慢慢学。
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={onSignOut}
                className="shrink-0 rounded-full border border-line px-4 py-2 text-xs font-black text-ink/58 transition hover:border-ink hover:text-ink"
              >
                退出
              </button>
              <HumiScene scene="user" size="md" className="hidden sm:grid" />
            </div>
          </div>

          <div className="mt-6 grid gap-6">
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

            <ProfileBlock icon={ShieldAlert} title="绝不想吃 / 不能吃">
              <p className="mb-2 text-xs font-bold text-ink/42">这类今晚不要推</p>
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
            <p className="text-xs font-black text-ink/38">目前了解的偏好</p>
            <p className="mt-2 text-sm font-bold leading-6 text-ink/62">{formatHardProfileSummary(draft)}</p>
          </div>

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
