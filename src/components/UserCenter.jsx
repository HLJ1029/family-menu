import { useMemo, useState } from "react";
import { Check, Cloud, Database, Heart, ShieldAlert, SlidersHorizontal, UserRound, Users } from "lucide-react";
import { CloudAccount } from "./system/CloudAccount";
import { CloudSyncPanel } from "./system/CloudSyncPanel";
import { FamilyPreferencesPanel } from "./system/FamilyPreferencesPanel";
import { PwaLaunchPanel } from "./system/PwaLaunchPanel";
import { Card } from "./ui/Card";

const profileOptions = {
  tastePreferences: ["家常", "清淡", "微辣", "下饭", "汤汤水水", "少油", "重口味", "新鲜感"],
  goals: ["省时", "少买菜", "高蛋白", "多吃蔬菜", "控油", "控热量", "孩子爱吃", "适合带饭"],
  dislikes: ["肥肠", "鸡爪", "太辣", "油炸", "海鲜", "香菜", "内脏", "甜口"],
  allergies: ["花生", "海鲜", "乳糖", "坚果", "鸡蛋", "豆制品"],
};

export function UserCenter({ authProps, cloudMenuProps, preferenceProps, session, family, familyProfile, setFamilyProfile }) {
  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_0.85fr]">
      <div className="grid gap-5">
        <section className="rounded-[32px] bg-ink p-6 text-white shadow-lift md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.24em] text-acid">我的家</p>
          <h2 className="mt-4 max-w-2xl text-4xl font-black tracking-[-0.04em] md:text-6xl">
            把家里的吃饭习惯存下来。
          </h2>
          <p className="mt-4 max-w-xl text-sm font-bold leading-7 text-white/62">
            先体验也可以。想让菜单、清单和口味一直跟着你，再登录保存。
          </p>
        </section>

        <CloudAccount {...authProps} />
        <FamilyProfilePanel
          session={session}
          profile={familyProfile}
          setProfile={setFamilyProfile}
        />
        <CloudSyncPanel {...cloudMenuProps} />
        <FamilyPreferencesPanel {...preferenceProps} />
      </div>

      <aside className="grid content-start gap-5">
        <PwaLaunchPanel compact />

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">我的家</p>
              <h3 className="card-title">当前状态</h3>
            </div>
            <UserRound size={22} />
          </div>
          <div className="mt-5 grid gap-3">
            <StatusRow label="登录" value={session?.user?.email ?? "未登录"} />
            <StatusRow label="我的家" value={family?.name ?? "未创建"} />
            <StatusRow
              label="保存方式"
              value={getSyncModeLabel({ family, cloudMenuProps })}
            />
          </div>
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
            现在可以先用呼米安排晚饭。下一步准备小程序入口，让家里人更容易打开。
          </p>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-acid">
              <Cloud size={20} />
            </span>
            <div>
              <p className="font-black">微信登录准备中</p>
              <p className="mt-1 text-xs font-bold leading-5 text-ink/45">
                当前先不放不可用按钮。等小程序和正式域名准备好，再接微信登录。
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <a
              href="/family-menu/privacy.html"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-line bg-canvas px-3 text-xs font-black text-ink/58 transition hover:text-ink"
            >
              隐私政策
            </a>
            <a
              href="/family-menu/terms.html"
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

function FamilyProfilePanel({ session, profile, setProfile }) {
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
          <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">让呼米更懂你家</h3>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            先选几个常用习惯，推荐时会压缩成一份简短画像，少传废话，也更贴近你家。
          </p>
        </div>
        <span className="rounded-full bg-acid px-3 py-1 text-xs font-black text-ink">
          {completedCount}/5 已完成
        </span>
      </div>

      {!session?.user && (
        <div className="mt-4 rounded-[20px] bg-canvas p-4 text-sm font-bold leading-6 text-ink/52">
          可以先填写体验；登录后再把菜单、库存和画像一起保存到我的家。
        </div>
      )}

      <div className="mt-5 grid gap-4">
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
        <Check size={17} className="text-acid" />
        保存家庭画像
      </button>
    </section>
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

function getProfileCompletedCount(profile = {}) {
  return [
    profile.familySize,
    profile.tastePreferences?.length,
    profile.goals?.length,
    profile.dislikes?.length || profile.allergies?.length,
    profile.shoppingTolerance,
  ].filter(Boolean).length;
}

function formatProfileSummary(profile = {}) {
  const parts = [
    `${profile.familySize ?? 2}人吃饭`,
    profile.hasChildren ? "有孩子一起吃" : "",
    listSummary("偏好", profile.tastePreferences),
    listSummary("目标", profile.goals),
    listSummary("避开", [...(profile.dislikes ?? []), ...(profile.allergies ?? [])]),
    shoppingLabel(profile.shoppingTolerance),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("；") : "还没填写画像，呼米会先按通用家庭晚饭来安排。";
}

function listSummary(label, values = []) {
  return values.length > 0 ? `${label} ${values.slice(0, 4).join("、")}` : "";
}

function shoppingLabel(value) {
  if (value === "low") return "尽量少买菜";
  if (value === "high") return "愿意为好吃专门买";
  return "可以买2-3样主食材";
}

function getSyncModeLabel({ family, cloudMenuProps }) {
  if (!family) return "先保存在本机";
  if (cloudMenuProps?.cloudMenuEnabled && cloudMenuProps?.cloudGroceryEnabled) return "已保存到我的家";
  if (cloudMenuProps?.cloudMenuEnabled || cloudMenuProps?.cloudGroceryEnabled) return "部分已保存";
  return "待保存";
}

function StatusRow({ label, value }) {
  return (
    <div className="rounded-[18px] bg-canvas p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">{label}</p>
      <p className="mt-1 break-all text-sm font-black">{value}</p>
    </div>
  );
}
