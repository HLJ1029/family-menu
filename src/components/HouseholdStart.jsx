import { Home, Send, UsersRound } from "lucide-react";
import { useState } from "react";

export function HouseholdStart({
  familyName,
  onFamilyNameChange,
  onCreate,
  pending = false,
  status = "",
  onOpenInvite,
}) {
  const [selection, setSelection] = useState(null);
  const nameRequired = status === "请填写家庭名称。";

  function selectInvite() {
    setSelection("invite");
    onOpenInvite?.();
  }

  return (
    <section data-testid="household-start" className="mx-auto grid max-w-2xl gap-4 rounded-[28px] border border-line bg-white p-5 text-ink shadow-card sm:p-8">
      <div>
        <p className="eyebrow">我的家</p>
        <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">从一个真实的家开始</h2>
        <p className="mt-3 text-sm font-bold leading-7 text-ink/58">共享菜单、一起决定想吃什么、协作买菜。</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setSelection("create")}
          aria-pressed={selection === "create"}
          className={`rounded-[22px] border p-4 text-left transition ${selection === "create" ? "border-ink bg-ink text-white" : "border-line bg-canvas text-ink"}`}
        >
          <Home size={20} />
          <span className="mt-3 block text-lg font-black">创建我的家</span>
          <span className="mt-1 block text-sm font-bold leading-6 opacity-70">由你主动命名，再邀请家人一起加入。</span>
        </button>
        <button
          type="button"
          onClick={selectInvite}
          aria-pressed={selection === "invite"}
          className={`rounded-[22px] border p-4 text-left transition ${selection === "invite" ? "border-ink bg-ink text-white" : "border-line bg-canvas text-ink"}`}
        >
          <UsersRound size={20} />
          <span className="mt-3 block text-lg font-black">通过邀请加入</span>
          <span className="mt-1 block text-sm font-bold leading-6 opacity-70">加入家人已经创建好的家庭空间。</span>
        </button>
      </div>

      {selection === "create" && (
        <div className="rounded-[22px] border border-line bg-canvas p-4">
          <label className="block text-sm font-black" htmlFor="household-name">给这个家起个名字</label>
          <input
            id="household-name"
            value={familyName}
            onChange={(event) => onFamilyNameChange?.(event.target.value)}
            placeholder="例如：我们家"
            maxLength={32}
            aria-invalid={nameRequired}
            aria-describedby={nameRequired ? "household-name-error" : undefined}
            className="mt-3 min-h-12 w-full rounded-full border border-line bg-white px-5 text-sm font-black outline-none focus:border-ink/30"
          />
          <button
            type="button"
            onClick={onCreate}
            disabled={pending}
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "正在创建" : "确认创建"}
          </button>
        </div>
      )}

      {selection === "invite" && (
        <div className="rounded-[22px] border border-line bg-canvas p-4">
          <div className="flex items-center gap-2 text-sm font-black"><Send size={16} /> 需要一张邀请卡片或邀请链接</div>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/58">请让家人从 Humi 发来邀请，再用那张卡片或链接打开并加入；这里不会替你生成邀请码。</p>
          <button type="button" onClick={onOpenInvite} className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full border border-ink bg-white px-4 text-sm font-black">
            打开邀请
          </button>
        </div>
      )}

      {status && <p id={nameRequired ? "household-name-error" : undefined} className="text-sm font-bold leading-6 text-ink/52">{status}</p>}
    </section>
  );
}
