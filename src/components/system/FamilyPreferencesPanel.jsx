import { Heart, Save, ShieldAlert, Target, UserRound } from "lucide-react";

const fields = [
  { key: "likes", label: "喜欢", placeholder: "番茄、牛肉、清淡", icon: Heart },
  { key: "dislikes", label: "不喜欢", placeholder: "香菜、太辣、肥肉", icon: UserRound },
  { key: "allergies", label: "忌口/过敏", placeholder: "花生、海鲜、乳糖", icon: ShieldAlert },
  { key: "goals", label: "饮食目标", placeholder: "高蛋白、少油、控糖", icon: Target },
];

export function FamilyPreferencesPanel({
  family,
  members,
  draft,
  loading,
  status,
  onDraftChange,
  onSavePreference,
  onRefreshPreferences,
}) {
  if (!family) return null;

  return (
    <section className="rounded-[28px] border border-line bg-white p-5 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">Family preferences</p>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">家庭成员偏好</h3>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            先把口味、忌口和目标存下来，下一阶段推荐引擎会读取这些信息。
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
        {loading ? "正在同步家庭偏好..." : status}
      </p>

      <div className="mt-5 grid gap-4">
        {members.length > 0 ? (
          members.map((member) => (
            <article key={member.id} className="rounded-[22px] border border-line bg-canvas p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black">{member.email ?? "家庭成员"}</p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-ink/35">
                    {member.role} · {member.status}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSavePreference(member.id)}
                  disabled={loading}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full bg-ink px-4 text-xs font-black text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Save size={14} className="text-acid" />
                  保存偏好
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
