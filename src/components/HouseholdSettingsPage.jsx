import { useEffect, useState } from "react";
import { PageHeader } from "./HouseholdMembersPage";

export function HouseholdSettingsPage({
  family,
  households = [],
  familyProfile = {},
  canManageHousehold,
  onBack,
  onRenameHousehold,
  onSwitchHousehold,
  onLeaveHousehold,
  onSaveFamilyProfile,
}) {
  const [name, setName] = useState(family?.name || "我的家");
  const [constraints, setConstraints] = useState(() => getConstraints(familyProfile));
  const hasOtherFormalMembers = family?.members?.some(
    (member) => member.status === "formal" && member.memberId !== family.currentMemberId,
  );
  const ownerMustTransferBeforeLeaving = Boolean(canManageHousehold && hasOtherFormalMembers);

  useEffect(() => setName(family?.name || "我的家"), [family?.name]);
  useEffect(() => setConstraints(getConstraints(familyProfile)), [familyProfile]);

  function saveConstraints() {
    onSaveFamilyProfile?.({
      ...familyProfile,
      dislikes: splitConstraints(constraints.dislikes),
      allergies: splitConstraints(constraints.allergies),
    });
  }

  return (
    <section data-testid="household-settings-page" className="mx-auto grid max-w-3xl gap-4 text-ink">
      <PageHeader eyebrow="家庭设置" title={family?.name || "我的家"} onBack={onBack} />
      <section className="rounded-[28px] border border-line bg-white p-5 shadow-card sm:p-6">
        <p className="eyebrow">切换家庭</p>
        <div data-testid="household-switcher" className="mt-3 grid gap-2">
          <h3 className="text-lg font-black">{family?.name || "我的家"}</h3>
          <p className="text-sm font-bold leading-6 text-ink/58">每个家的菜单、清单和偏好独立保存。</p>
          {households.map((household) => (
            <button
              key={household.id}
              type="button"
              disabled={household.id === family?.id}
              onClick={() => onSwitchHousehold?.(household.id)}
              className="flex min-h-11 items-center justify-between rounded-[18px] border border-line bg-canvas px-4 text-left text-sm font-black disabled:bg-white disabled:text-ink"
            >
              <span>{household.name}</span><span className="text-xs text-ink/52">{household.id === family?.id ? "当前家庭" : "切换"}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-[28px] border border-line bg-white p-5 shadow-card sm:p-6">
        <p className="eyebrow">家庭偏好</p>
        {canManageHousehold ? (
          <div data-testid="family-constraints-editor" className="mt-3 grid gap-3">
            <label className="grid gap-2 text-sm font-black">家里不吃什么
              <input value={constraints.dislikes} onChange={(event) => setConstraints((current) => ({ ...current, dislikes: event.target.value }))} placeholder="例如：香菜、芹菜" className="min-h-11 rounded-full border border-line bg-canvas px-4 text-sm font-bold outline-none" />
            </label>
            <label className="grid gap-2 text-sm font-black">过敏或必须避开
              <input value={constraints.allergies} onChange={(event) => setConstraints((current) => ({ ...current, allergies: event.target.value }))} placeholder="例如：花生" className="min-h-11 rounded-full border border-line bg-canvas px-4 text-sm font-bold outline-none" />
            </label>
            <button type="button" onClick={saveConstraints} className="min-h-11 justify-self-start rounded-full bg-ink px-5 text-sm font-black text-white">保存家庭偏好</button>
          </div>
        ) : (
          <p className="mt-3 rounded-[20px] bg-canvas p-4 text-sm font-bold leading-6 text-ink/58">主厨统一维护家庭忌口和过敏信息；你可以查看，但不会在这里改动全家的安排。</p>
        )}
      </section>
      {canManageHousehold && (
        <section className="rounded-[28px] border border-line bg-white p-5 shadow-card sm:p-6">
          <p className="eyebrow">基本信息</p>
          <label className="mt-3 grid gap-2 text-sm font-black">家庭名称
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} className="min-h-11 rounded-full border border-line bg-canvas px-4 text-sm font-bold outline-none" />
          </label>
          <button type="button" onClick={() => onRenameHousehold?.(name)} className="mt-3 min-h-11 rounded-full border border-ink bg-white px-5 text-sm font-black">重命名家庭</button>
        </section>
      )}
      <section className="rounded-[28px] border border-line bg-white p-5 shadow-card sm:p-6">
        <p className="eyebrow">离开家庭</p>
        {ownerMustTransferBeforeLeaving && (
          <p className="mt-2 text-sm font-black text-ink/62">先转让主厨后再退出</p>
        )}
        <button type="button" disabled={ownerMustTransferBeforeLeaving} onClick={() => onLeaveHousehold?.()} className="mt-3 min-h-11 rounded-full border border-line bg-white px-5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-45">离开这个家</button>
      </section>
    </section>
  );
}

function getConstraints(profile = {}) {
  return {
    dislikes: (profile.dislikes || []).join("、"),
    allergies: (profile.allergies || []).join("、"),
  };
}

function splitConstraints(value) {
  return String(value || "").split(/[、,，]/).map((item) => item.trim()).filter(Boolean);
}
