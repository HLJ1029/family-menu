import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";

export function CraveAudiencePicker({ members = [], onChange, className = "" }) {
  const people = useMemo(() => normalizeAudienceMembers(members), [members]);
  const audienceKey = people.map((person) => person.id).join("|");
  const [selectedIds, setSelectedIds] = useState(() => people.map((person) => person.id));
  const selectedPeople = people.filter((person) => selectedIds.includes(person.id));

  useEffect(() => {
    setSelectedIds(people.map((person) => person.id));
  }, [audienceKey]);

  useEffect(() => {
    onChange?.(selectedPeople);
  }, [audienceKey, selectedIds.join("|")]);

  function togglePerson(id) {
    setSelectedIds((current) => {
      if (current.includes(id) && current.length > 1) return current.filter((item) => item !== id);
      if (current.includes(id)) return current;
      return [...current, id];
    });
  }

  return (
    <section className={`rounded-[20px] border border-line bg-canvas p-3 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">今晚想问谁</p>
          <p className="mt-1 text-sm font-black text-ink">
            默认全选，家人点开卡片免登录参与
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-black text-ink/54">
          <Users size={13} />
          {selectedPeople.length}/{people.length}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {people.map((person) => {
          const selected = selectedIds.includes(person.id);
          return (
            <button
              key={person.id}
              type="button"
              onClick={() => togglePerson(person.id)}
              aria-pressed={selected}
              className={`min-h-14 rounded-[18px] border px-3 text-left transition ${
                selected
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-white text-ink hover:border-ink/30"
              }`}
            >
              <span className="block truncate text-sm font-black">{person.name}</span>
              <span className={`mt-1 block truncate text-xs font-bold ${selected ? "text-white/58" : "text-ink/45"}`}>
                {person.meta}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function normalizeAudienceMembers(members = []) {
  const normalized = members
    .filter(Boolean)
    .filter((member) => member.role !== "主厨" && member.role !== "owner")
    .map((member, index) => {
      const name = String(member.name || member.nickname || member.email || "家人").trim() || "家人";
      return {
        id: String(member.participantKey || member.memberId || member.id || `member:${index}:${name}`),
        name,
        meta: member.status === "正式成员" || member.status === "已加入"
          ? `${member.role || "家人"} · 已加入`
          : member.status || member.role || "家人",
      };
    });

  if (normalized.length > 0) return normalized;

  return [{
    id: "share-card-family",
    name: "家人",
    meta: "通过小程序卡片免登录参与",
  }];
}
