import { Crown, UserMinus, UsersRound } from "lucide-react";

export function HouseholdMembersPage({
  family,
  members = [],
  canManageHousehold,
  onBack,
  onInvite,
  onRemoveMember,
  onTransferOwnership,
}) {
  const formalMembers = members.filter((member) => !member?.status || member.status === "formal" || member.status === "正式成员");

  function removeMember(member) {
    if (window.confirm(`确认将${member.name || member.nickname || "这位家人"}移出${family?.name || "这个家"}吗？`)) {
      onRemoveMember?.(member.memberId || member.id);
    }
  }

  function transferOwnership(member) {
    if (window.confirm(`确认把主厨交给${member.name || member.nickname || "这位家人"}吗？`)) {
      onTransferOwnership?.(member.memberId || member.id);
    }
  }

  return (
    <section data-testid="household-members-page" className="mx-auto grid max-w-3xl gap-4 text-ink">
      <PageHeader eyebrow="家庭成员" title={family?.name || "我的家"} onBack={onBack} />
      <section className="rounded-[28px] border border-line bg-white p-5 shadow-card sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black">已加入的家人</h3>
            <p className="mt-1 text-sm font-bold text-ink/58">{formalMembers.length} 位正式成员，菜单和协作会一起同步。</p>
          </div>
          {canManageHousehold && (
            <button type="button" onClick={onInvite} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 text-sm font-black text-white">
              <UsersRound size={16} /> 邀请家人
            </button>
          )}
        </div>
        <div className="mt-4 grid gap-3">
          {formalMembers.map((member) => {
            const isOwner = member.role === "owner" || member.role === "主厨";
            const label = member.name || member.nickname || "家人";
            return (
              <article key={member.memberId || member.id || label} className="flex flex-wrap items-center gap-3 rounded-[22px] bg-canvas p-4">
                <MemberAvatar member={member} label={label} />
                <div className="min-w-0 flex-1">
                  <h4 className="font-black">{label}</h4>
                  <p className="mt-1 text-xs font-bold text-ink/52">{isOwner ? "主厨" : "家人"} · {formatJoinedAt(member.joinedAt)}</p>
                </div>
                {isOwner && <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-black"><Crown size={13} /> 主厨</span>}
                {canManageHousehold && !isOwner && (
                  <div className="flex w-full gap-2 sm:w-auto">
                    <button type="button" onClick={() => transferOwnership(member)} className="min-h-10 rounded-full border border-line bg-white px-3 text-xs font-black">转让主厨</button>
                    <button type="button" onClick={() => removeMember(member)} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-line bg-white px-3 text-xs font-black"><UserMinus size={14} /> 移除成员</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function MemberAvatar({ member, label }) {
  if (member.avatarUrl) {
    return <img src={member.avatarUrl} alt={`${label}的头像`} className="h-11 w-11 rounded-2xl bg-white object-cover" />;
  }
  return <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-sm font-black">{label.slice(0, 1)}</span>;
}

export function PageHeader({ eyebrow, title, onBack }) {
  return (
    <header className="rounded-[28px] border border-line bg-white p-5 shadow-card sm:p-6">
      <p className="eyebrow">{eyebrow}</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-3xl font-black tracking-[-0.04em]">{title}</h2>
        <button type="button" onClick={onBack} className="min-h-11 rounded-full border border-line bg-white px-4 text-sm font-black">返回家庭客厅</button>
      </div>
    </header>
  );
}

function formatJoinedAt(value) {
  if (!value) return "已加入这个家";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "已加入这个家";
  return `加入于 ${date.toLocaleDateString("zh-CN")}`;
}
