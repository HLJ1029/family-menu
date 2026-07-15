export function MetricCard({ icon: Icon, label, value, note, action, onClick }) {
  const Wrapper = onClick ? "button" : "section";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`rounded-[20px] border border-line bg-white p-5 text-left shadow-card transition ${
        onClick ? "hover:-translate-y-1 hover:shadow-lift" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{label}</p>
          <h3 className="mt-3 text-3xl font-black tracking-[-0.04em]">{value}</h3>
          <p className="mt-2 text-sm leading-6 text-ink/52">{note}</p>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-white">
          <Icon size={20} />
        </div>
      </div>
      {action && (
        <span className="mt-6 inline-flex rounded-full bg-ink px-4 py-2 text-sm font-black text-white transition hover:-translate-y-0.5">
          {action}
        </span>
      )}
    </Wrapper>
  );
}

export function Stat({ label, value }) {
  return (
    <div className="rounded-[20px] bg-canvas p-4">
      <p className="text-3xl font-black tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-ink/38">{label}</p>
    </div>
  );
}

export function StatBlock({ label, value, tone = "dark" }) {
  const light = tone === "light";
  return (
    <div className={`rounded-[22px] p-4 ${light ? "bg-canvas" : "bg-white/10"}`}>
      <p className="text-3xl font-black tracking-[-0.04em]">{value}</p>
      <p className={`mt-1 text-xs font-black uppercase tracking-[0.16em] ${light ? "text-ink/42" : "text-white/45"}`}>{label}</p>
    </div>
  );
}

export function BalanceRow({ label, value, total }) {
  const percent = Math.round((value / total) * 100);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm font-black">
        <span>{label}</span>
        <span className="text-ink/45">{percent}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-canvas">
        <div className="h-full rounded-full bg-ink" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
