import { PageHeader } from "./HouseholdMembersPage";

export function HumiAccountPage({ humiSession, onBack, onSignOut, onOpenEatingHabits }) {
  const user = humiSession?.user || {};
  const displayName = user.displayName || "Humi 用户";
  const phoneState = user.phoneVerified && user.phoneMasked ? user.phoneMasked : "未绑定";

  return (
    <section data-testid="humi-account-page" className="mx-auto grid max-w-3xl gap-4 text-ink">
      <PageHeader eyebrow="账号设置" title="我的 Humi" onBack={onBack} />
      <section className="rounded-[28px] border border-line bg-white p-5 shadow-card sm:p-6">
        <div className="flex items-center gap-3">
          {user.avatarUrl
            ? <img src={user.avatarUrl} alt={`${displayName}的头像`} className="h-14 w-14 rounded-2xl bg-canvas object-cover" />
            : <span className="grid h-14 w-14 place-items-center rounded-2xl bg-canvas text-xl font-black">{displayName.slice(0, 1)}</span>}
          <div><h3 className="text-lg font-black">{displayName}</h3><p className="mt-1 text-sm font-bold text-ink/58">微信账号</p></div>
        </div>
        <p className="mt-5 rounded-[20px] bg-canvas p-4 text-sm font-bold">手机号：{phoneState}</p>
      </section>
      <section className="rounded-[28px] border border-line bg-white p-5 shadow-card sm:p-6">
        <div className="grid gap-2 text-sm font-black">
          <button type="button" onClick={onOpenEatingHabits} className="min-h-11 rounded-[18px] bg-canvas px-4 py-3 text-left">查看吃饭习惯</button>
          <a href="/privacy.html" className="min-h-11 rounded-[18px] bg-canvas px-4 py-3">隐私政策</a>
          <a href="/terms.html" className="min-h-11 rounded-[18px] bg-canvas px-4 py-3">用户协议</a>
        </div>
        <button type="button" onClick={onSignOut} className="mt-5 min-h-11 rounded-full border border-line bg-white px-5 text-sm font-black">退出登录</button>
      </section>
    </section>
  );
}
