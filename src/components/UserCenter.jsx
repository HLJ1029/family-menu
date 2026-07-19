import { useMemo, useState } from "react";
import { FamilyLivingRoom } from "./FamilyLivingRoom";
import { FamilyActivityPage } from "./FamilyActivityPage";
import { HumiAccountPage } from "./HumiAccountPage";
import { HouseholdMembersPage } from "./HouseholdMembersPage";
import { HouseholdSettingsPage } from "./HouseholdSettingsPage";
import { HouseholdStart } from "./HouseholdStart";

export function UserCenter({
  authProps,
  humiSession,
  family,
  householdMembers = [],
  familyProfile = {},
  activeCraveRequest,
  activeGroceryShareRequest,
  activeWishShareRequest,
  onCreateHouseholdInvite,
  onStartWishShare,
  canManageHousehold = true,
  households = [],
  onSwitchHousehold,
  onRenameHousehold,
  onRemoveMember,
  onTransferOwnership,
  onLeaveHousehold,
  onSaveFamilyProfile,
  mealLogs = {},
}) {
  const signedIn = Boolean(humiSession?.user?.profileStatus === "complete");
  const [pageId, setPageId] = useState("home");
  const formalMembers = useMemo(
    () => resolveFormalMembers(family, householdMembers),
    [family, householdMembers],
  );
  const activeCollaborations = useMemo(
    () => buildActiveCollaborations({ activeCraveRequest, activeGroceryShareRequest, activeWishShareRequest }),
    [activeCraveRequest, activeGroceryShareRequest, activeWishShareRequest],
  );

  function openInviteGuidance() {
    if (typeof authProps?.onOpenInvite === "function") {
      authProps.onOpenInvite();
      return;
    }
    authProps?.showNotice?.("请使用家人发来的邀请卡片或链接打开 Humi。");
  }

  if (!signedIn) {
    return <GuestFamilyExplanation />;
  }

  if (!family) {
    return (
      <HouseholdStart
        familyName={authProps?.familyName || ""}
        onFamilyNameChange={authProps?.setFamilyName}
        onCreate={authProps?.onCreateFamily}
        pending={authProps?.cloudLoading}
        status={authProps?.authStatus}
        onOpenInvite={openInviteGuidance}
      />
    );
  }

  const commonPageProps = { onBack: () => setPageId("home") };
  if (pageId === "members") {
    return <HouseholdMembersPage {...commonPageProps} family={family} members={formalMembers} canManageHousehold={canManageHousehold} onInvite={onCreateHouseholdInvite} onRemoveMember={onRemoveMember} onTransferOwnership={onTransferOwnership} />;
  }
  if (pageId === "settings") {
    return <HouseholdSettingsPage {...commonPageProps} family={family} households={households} familyProfile={familyProfile} canManageHousehold={canManageHousehold} onSwitchHousehold={onSwitchHousehold} onRenameHousehold={onRenameHousehold} onLeaveHousehold={onLeaveHousehold} onSaveFamilyProfile={onSaveFamilyProfile} />;
  }
  if (pageId === "activity") {
    return <FamilyActivityPage {...commonPageProps} activeCraveRequest={activeCraveRequest} activeGroceryShareRequest={activeGroceryShareRequest} activeWishShareRequest={activeWishShareRequest} mealLogs={mealLogs} />;
  }
  if (pageId === "account") {
    return <HumiAccountPage {...commonPageProps} humiSession={humiSession} onSignOut={authProps?.onSignOut} />;
  }

  return (
    <FamilyLivingRoom
      family={family}
      formalMembers={formalMembers}
      activeCollaborations={activeCollaborations}
      preferenceSummary={buildPreferenceSummary(familyProfile)}
      activePageId={pageId}
      onNavigate={setPageId}
      onInvite={onCreateHouseholdInvite}
      onStartWishShare={onStartWishShare}
      canInvite={canManageHousehold}
    />
  );
}

function GuestFamilyExplanation() {
  return (
    <section data-testid="guest-family-explanation" className="mx-auto max-w-2xl rounded-[28px] border border-line bg-white p-6 text-ink shadow-card sm:p-8">
      <p className="eyebrow">我的家</p>
      <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">先安排今晚，也可以稍后再登录</h2>
      <p className="mt-3 text-sm font-bold leading-7 text-ink/58">
        游客模式不会创建家庭。登录后，你可以主动创建自己的家，或通过家人发来的邀请加入。
      </p>
    </section>
  );
}

function resolveFormalMembers(family, householdMembers) {
  const members = Array.isArray(family?.members) && family.members.length > 0
    ? family.members
    : householdMembers;
  return members.filter((member) => !member?.status || member.status === "formal" || member.status === "正式成员");
}

function buildActiveCollaborations({ activeCraveRequest, activeGroceryShareRequest, activeWishShareRequest }) {
  const collaborations = [];
  if (activeCraveRequest?.token) {
    const votes = activeCraveRequest.votes?.length || 0;
    collaborations.push({
      id: activeCraveRequest.id || "crave",
      task: "今晚想吃什么",
      progress: votes > 0 ? `已收到 ${votes} 个回复` : "等待家人回复",
      nextAction: votes > 0 ? "看看大家的想法" : "提醒家人打开征集",
    });
  }
  if (activeGroceryShareRequest?.token) {
    const items = activeGroceryShareRequest.items || [];
    const checked = items.filter((item) => item.checked).length;
    collaborations.push({
      id: activeGroceryShareRequest.id || "grocery",
      task: "一起买菜",
      progress: `已买 ${checked}/${items.length} 项`,
      nextAction: checked === items.length && items.length > 0 ? "清单已准备好" : "看看谁来买",
    });
  }
  if (activeWishShareRequest?.token) {
    const wishes = activeWishShareRequest.wishes?.length || 0;
    collaborations.push({
      id: activeWishShareRequest.id || "wish",
      task: "最近想吃",
      progress: wishes > 0 ? `收到了 ${wishes} 个想法` : "等家人写下想吃的菜",
      nextAction: wishes > 0 ? "把想法放进菜单" : "分享给家人填写",
    });
  }
  return collaborations.slice(0, 3);
}

function buildPreferenceSummary(profile) {
  const values = [
    ...(Array.isArray(profile?.dislikes) ? profile.dislikes : []),
    ...(Array.isArray(profile?.allergies) ? profile.allergies : []),
  ].map((item) => String(item || "").trim()).filter(Boolean);
  return values.length > 0
    ? `已记住：${values.slice(0, 3).join("、")}`
    : "还没有特别标记，慢慢从每次一起吃饭里了解彼此。";
}
