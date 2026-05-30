import { Cloud, KeyRound, Link, LogOut, Mail, Plus, ShieldCheck } from "lucide-react";
import { getSupabase, isSupabaseConfigured } from "../../lib/supabase/client";

export function CloudAccount({
  authEmail,
  setAuthEmail,
  authPassword,
  setAuthPassword,
  authStatus,
  setAuthStatus,
  session,
  family,
  familyName,
  setFamilyName,
  cloudLoading,
  onPasswordAuth,
  onCreateFamily,
  onSignOut,
  showNotice,
}) {
  async function requestMagicLink(event) {
    event.preventDefault();
    const email = authEmail.trim();
    if (!email) return;

    if (!isSupabaseConfigured) {
      setAuthStatus("请先配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY");
      return;
    }

    setAuthStatus("正在发送登录链接...");
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.href,
      },
    });

    if (error) {
      setAuthStatus(error.message);
      return;
    }

    setAuthStatus("登录链接已发送，请检查邮箱。");
    showNotice("FamilyOS 登录链接已发送");
  }

  return (
    <section className="rounded-[28px] border border-line bg-white p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink text-acid">
          <Cloud size={20} />
        </span>
        <div>
          <p className="eyebrow">Family cloud</p>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">云同步准备就绪</h3>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            邮箱登录作为第一版入口；微信登录字段和入口已预留，后续接开放平台配置。
          </p>
        </div>
      </div>

      {session?.user ? (
        <div className="mt-5 grid gap-3">
          <div className="rounded-[22px] bg-canvas p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">Signed in</p>
            <p className="mt-1 text-sm font-black">{session.user.email}</p>
          </div>
          {family ? (
            <div className="rounded-[22px] border border-line bg-canvas p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">Family space</p>
              <p className="mt-1 text-xl font-black tracking-[-0.04em]">{family.name}</p>
              <p className="mt-2 text-xs font-bold leading-5 text-ink/48">
                这个家庭空间会承接后续菜单、库存和购物清单云同步。
              </p>
            </div>
          ) : (
            <form
              className="grid gap-2 sm:grid-cols-[1fr_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                onCreateFamily();
              }}
            >
              <input
                value={familyName}
                onChange={(event) => setFamilyName(event.target.value)}
                className="min-h-12 min-w-0 rounded-full border border-line bg-canvas px-4 text-sm font-bold outline-none focus:border-ink/30"
                placeholder="家庭空间名称"
              />
              <button
                type="submit"
                disabled={cloudLoading}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-acid px-5 text-sm font-black text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={17} />
                创建家庭
              </button>
            </form>
          )}
          <button
            type="button"
            onClick={onSignOut}
            disabled={cloudLoading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-black text-ink/62 transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogOut size={16} />
            退出登录
          </button>
        </div>
      ) : (
        <div className="mt-5 grid gap-3">
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onPasswordAuth("signin");
            }}
          >
            <label className="flex min-h-12 items-center gap-2 rounded-full border border-line bg-canvas px-4">
              <Mail size={17} className="text-ink/38" />
              <input
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                type="email"
                className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-ink/35"
                placeholder="邮箱"
                autoComplete="email"
              />
            </label>
            <label className="flex min-h-12 items-center gap-2 rounded-full border border-line bg-canvas px-4">
              <KeyRound size={17} className="text-ink/38" />
              <input
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                type="password"
                className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-ink/35"
                placeholder="密码，至少 6 位"
                autoComplete="current-password"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="submit"
                disabled={cloudLoading}
                className="min-h-12 rounded-full bg-ink px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                密码登录
              </button>
              <button
                type="button"
                onClick={() => onPasswordAuth("signup")}
                disabled={cloudLoading}
                className="min-h-12 rounded-full bg-acid px-5 text-sm font-black text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                注册账号
              </button>
            </div>
          </form>
          <form className="grid gap-2 sm:grid-cols-[1fr_auto]" onSubmit={requestMagicLink}>
            <p className="text-xs font-bold leading-5 text-ink/45 sm:col-span-2">
              Magic link 仍然保留；如果遇到发送频率限制，优先用密码登录继续测试。
            </p>
            <button
              type="submit"
              disabled={cloudLoading}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-black text-ink/62 transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
            >
              <Link size={16} />
              发送邮箱登录链接
            </button>
          </form>
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-[20px] bg-canvas p-4 text-xs font-bold leading-5 text-ink/52">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ink" />
        {cloudLoading
          ? "正在同步云端状态..."
          : isSupabaseConfigured
          ? authStatus || "Supabase 已配置，可发送 magic link。"
          : authStatus || "当前是本地模式：配置 Supabase 环境变量后启用云同步。"}
      </div>
    </section>
  );
}
