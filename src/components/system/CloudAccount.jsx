import { Cloud, KeyRound, Link, LogOut, Mail, Plus, ShieldCheck } from "lucide-react";
import { getSupabase, isSupabaseConfigured } from "../../lib/supabase/client";
import { HumiPeek } from "../ui/HumiBrandIllustration";

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
  hideAuthEntry = false,
  compactTitle = false,
}) {
  const signedIn = Boolean(session?.user);

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
    showNotice("Humi 登录链接已发送");
  }

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-line bg-white p-5 shadow-card">
      {!compactTitle && (
        <HumiPeek
          variant={family ? "family-taste-talk" : "profile"}
          size="sm"
          className="absolute right-4 top-4 opacity-85"
          contextKey="cloud-account-peek"
        />
      )}
      {!compactTitle && (
        <div className="flex items-start gap-3 pr-16">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink text-white">
            <Cloud size={20} />
          </span>
          <div>
            <p className="eyebrow">我的家</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">保存家里的吃饭习惯</h3>
            <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
              {signedIn
                ? family
                  ? "Humi 会把菜单、清单和你家的口味偏好保存在这里。"
                  : "已经登录。创建我的家后，菜单、清单和口味偏好会一起保存。"
                : "创建我的家后，Humi 会记住菜单、清单和口味偏好。也可以先直接体验。"}
            </p>
          </div>
        </div>
      )}

      {signedIn ? (
        <div className="mt-5 grid gap-3">
          <div className="rounded-[22px] bg-canvas p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">已登录</p>
            <p className="mt-1 text-sm font-black">已登录 Humi</p>
          </div>
          {family ? (
            <div className="relative overflow-hidden rounded-[22px] bg-canvas/70 p-4 pr-20">
              <HumiPeek
                variant="family-taste-talk"
                size="sm"
                className="absolute -bottom-2 right-3 opacity-90"
                contextKey="cloud-account-family-card"
              />
              <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">当前家庭空间</p>
              <p className="mt-1 text-xl font-black tracking-[-0.04em]">{family.name}</p>
              <p className="mt-2 text-xs font-bold leading-5 text-ink/48">
                已连接。菜单、清单和口味偏好会自动保存在这里。
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
                placeholder="我的家名称"
              />
              <button
                type="submit"
                disabled={cloudLoading}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={17} />
                创建我的家
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
            退出账号
          </button>
        </div>
      ) : hideAuthEntry ? (
        <div className="mt-5 rounded-[22px] bg-canvas p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">游客体验</p>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/58">
            现在可以直接安排晚饭、保存今晚菜单和食材清单。小程序正式验证前会接入微信登录，
            这里先不放账号入口。
          </p>
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
                className="min-h-12 rounded-full bg-ink px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                注册账号
              </button>
            </div>
          </form>
          <form className="grid gap-2 sm:grid-cols-[1fr_auto]" onSubmit={requestMagicLink}>
            <p className="text-xs font-bold leading-5 text-ink/45 sm:col-span-2">
              也可以用邮箱登录链接；如果发送太频繁，先用密码登录。
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
          ? "正在保存状态..."
          : signedIn
          ? family
            ? "已连接我的家。"
            : "创建我的家后，就能把这台设备上的菜单和清单保存起来。"
          : hideAuthEntry
          ? "当前先保存在本机。"
          : isSupabaseConfigured
          ? authStatus || "创建我的家后，可以把家里的菜单和清单保存起来。"
          : authStatus || "当前会先保存在本机。"}
      </div>
    </section>
  );
}
