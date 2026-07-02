import { Trash2 } from "lucide-react";
import { formatExpiry, getExpiryState } from "../../lib/pantry";

export function PantryChip({ item, onRemove }) {
  const expiryState = getExpiryState(item.expiresOn);
  const expiryClass =
    expiryState === "expired"
      ? "bg-ink text-white"
      : expiryState === "soon"
        ? "bg-white text-ink"
        : "bg-canvas text-ink/45";

  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-black text-ink/62 transition hover:bg-ink hover:text-ink"
      aria-label={`从后台已有移除 ${item.name}`}
    >
      <span>{item.name}</span>
      {item.amount && <span className="text-ink/38">{item.amount}</span>}
      {item.expiresOn && (
        <span className={`rounded-full px-2 py-0.5 ${expiryClass}`}>
          {formatExpiry(item.expiresOn, expiryState)}
        </span>
      )}
      <Trash2 size={12} />
    </button>
  );
}
