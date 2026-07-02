import { MailPlus, Save, ShieldAlert, UserRound } from "lucide-react";

const fields = [
  { key: "dislikes", label: "不喜欢", placeholder: "香菜、太辣、肥肉", icon: UserRound },
  { key: "allergies", label: "忌口/过敏", placeholder: "花生、海鲜、乳糖", icon: ShieldAlert },
];

export function FamilyPreferencesPanel({
  family,
  members,
  draft,
  loading,
  status,
  inviteEmail,
  setInviteEmail,
  onDraftChange,
  onInviteMember,
  onSavePreference,
  onRefreshPreferences,
}) {
  if (!family) return null;

  return (
    <section className="rounded-[28px] border border-line bg-white p-5 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">Avoid</p>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">成员忌口</h3>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            这里只保留不想吃和不能吃的硬约束，其他口味让 Humi 从每顿饭里慢慢学。
          </p>
        </div>
        <button
          type="button"
          onClick={onRefreshPreferences}
          disabled={loading}
          className="min-h-11 rounded-full border border-line bg-canvas px-4 text-sm font-black text-ink/62 transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
        >
          刷新
        </button>
      </div>

      <p className="mt-4 rounded-[20px] bg-canvas p-4 text-xs font-bold leading-5 text-ink/50">
        {loading ? "正在保存成员忌口..." : status}
      </p>

      <form
        className="mt-4 grid gap-2 rounded-[22px] border border-line bg-canvas p-4 sm:grid-cols-[1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          onInviteMember();
        }}
      >
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">Family</span>
          <input
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            type="email"
            className="min-h-12 rounded-full border border-line bg-white px-4 text-sm font-bold outline-none focus:border-ink/30"
            placeholder="输入家庭成员邮箱"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex min-h-12 items-center justify-center gap-2 self-end rounded-full bg-ink px-5 text-sm font-black text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <MailPlus size={17} />
          加入我的家
        </button>
      </form>

      <div className="mt-5 grid gap-4">
        {members.length > 0 ? (
          members.map((member) => (
            <article key={member.id} className="rounded-[22px] border border-line bg-canvas p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black">{member.email ?? "家庭成员"}</p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-ink/35">
                    {formatMemberMeta(member)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSavePreference(member.id)}
                  disabled={loading}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full bg-ink px-4 text-xs font-black text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Save size={14} className="text-white" />
                  保存忌口
                </button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {fields.map((field) => (
                  <PreferenceField
                    key={field.key}
                    field={field}
                    value={draft[member.id]?.[field.key] ?? ""}
                    onChange={(value) => onDraftChange(member.id, field.key, value)}
                  />
                ))}
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-[22px] border border-line bg-canvas p-4 text-sm font-bold text-ink/50">
            暂未读取到家庭成员。请确认家庭空间已创建。
          </div>
        )}
      </div>
    </section>
  );
}

function formatMemberMeta(member) {
  const role = member.role === "owner" ? "管理员" : "成员";
  const status = member.status === "active" ? "已加入" : "待接受邀请";
  return `${role} · ${status}`;
}

function PreferenceField({ field, value, onChange }) {
  const Icon = field.icon;
  return (
    <label className="grid gap-2">
      <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-ink/38">
        <Icon size={14} />
        {field.label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-20 resize-none rounded-[18px] border border-line bg-white px-4 py-3 text-sm font-bold leading-6 outline-none focus:border-ink/30"
        placeholder={field.placeholder}
      />
    </label>
  );
}
