import { ChevronRight, Heart, Settings, UserRound, UsersRound } from "lucide-react";

export function FamilyLivingRoom({
  family,
  formalMembers = [],
  activeCollaborations = [],
  preferenceSummary,
  activePageId = "home",
  onNavigate,
  onInvite,
  onStartWishShare,
  canInvite = true,
}) {
  const memberCount = formalMembers.length || family?.members?.length || 1;
  const currentRole = family?.role === "owner" ? "主厨" : "家人";

  return (
    <section data-testid="family-living-room" className="mx-auto grid max-w-3xl gap-4 text-ink">
      <section className="rounded-[28px] border border-line bg-white p-5 shadow-card sm:p-6">
        <p className="eyebrow">当前家庭</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-black tracking-[-0.04em]">{family?.name || "我的家"}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span data-testid="current-family-role" className="rounded-full bg-canvas px-3 py-1.5 text-xs font-black">{currentRole}</span>
              <span data-testid="current-family-member-count" className="text-sm font-bold text-ink/58">{memberCount} 位家人</span>
              <div data-testid="current-family-member-avatars" className="flex -space-x-2" aria-label={`${memberCount} 位家人的头像`}>
                {formalMembers.map((member) => (
                  <LivingRoomMemberAvatar key={member.memberId || member.id || member.nickname || member.name} member={member} />
                ))}
              </div>
            </div>
            <p className="mt-2 text-sm font-bold text-ink/58">菜单和协作都留在这个家里。</p>
          </div>
          {canInvite && (
            <button type="button" onClick={onInvite} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-black text-white">
              <UsersRound size={17} /> 邀请家人
            </button>
          )}
        </div>
      </section>

      <section className="rounded-[28px] border border-line bg-white p-5 shadow-card">
        <p className="eyebrow">家庭操作</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <LivingRoomAction label="成员管理" detail="查看谁已加入" icon={UsersRound} onClick={() => onNavigate?.("members")} />
          <LivingRoomAction label="家庭设置" detail="调整家的基本信息" icon={Settings} onClick={() => onNavigate?.("settings")} />
          <LivingRoomAction label="协作记录" detail="回看一起完成的事" icon={Heart} onClick={() => onNavigate?.("activity")} />
          <LivingRoomAction label="账号设置" detail="维护自己的账号" icon={UserRound} onClick={() => onNavigate?.("account")} />
        </div>
        <p className="sr-only" aria-live="polite">{activePageId === "home" ? "家庭客厅" : `已打开 ${activePageId} 页面`}</p>
      </section>

      <section className="rounded-[28px] border border-line bg-white p-5 shadow-card">
        <p className="eyebrow">正在一起做</p>
        <div className="mt-3 grid gap-2">
          {activeCollaborations.length > 0 ? activeCollaborations.slice(0, 3).map((item) => (
            <article key={item.id} className="rounded-[20px] bg-canvas p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-black">{item.task}</h3>
                  <p className="mt-1 text-sm font-bold text-ink/58">进度：{item.progress}</p>
                  <p className="mt-1 text-sm font-bold text-ink/58">下一步：{item.nextAction}</p>
                </div>
              </div>
            </article>
          )) : (
            <p className="rounded-[20px] bg-canvas p-4 text-sm font-bold leading-6 text-ink/58">还没有进行中的协作，今晚可以先问问大家。</p>
          )}
        </div>
        {canInvite && typeof onStartWishShare === "function" && (
          <button type="button" onClick={onStartWishShare} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border border-ink bg-white px-4 text-sm font-black text-ink">
            邀请家人写想吃
          </button>
        )}
      </section>

      <button
        type="button"
        data-testid="family-preference-action"
        onClick={() => onNavigate?.("settings")}
        className="rounded-[28px] border border-line bg-white p-5 text-left shadow-card transition hover:border-ink/25"
      >
        <p className="eyebrow">家庭偏好</p>
        <div className="mt-2 flex items-center gap-3">
          <p className="min-w-0 flex-1 text-sm font-bold leading-6 text-ink/58">{preferenceSummary}</p>
          <ChevronRight size={18} className="shrink-0 text-ink/42" />
        </div>
      </button>
    </section>
  );
}

function LivingRoomMemberAvatar({ member }) {
  const label = member.name || member.nickname || "家人";
  if (member.avatarUrl) {
    return <img src={member.avatarUrl} alt={`${label}的头像`} className="h-9 w-9 rounded-full border-2 border-white bg-canvas object-cover" />;
  }
  return <span data-testid="member-avatar-fallback" aria-label={`${label}的默认头像`} className="grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-canvas text-xs font-black">{label.slice(0, 1)}</span>;
}

function LivingRoomAction({ label, detail, icon: Icon, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-16 items-center gap-3 rounded-[18px] border border-line bg-canvas p-3 text-left transition hover:border-ink/25">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white"><Icon size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black">{label}</span>
        <span className="mt-1 block text-xs font-bold text-ink/52">{detail}</span>
      </span>
      <ChevronRight size={17} className="shrink-0 text-ink/42" />
    </button>
  );
}
