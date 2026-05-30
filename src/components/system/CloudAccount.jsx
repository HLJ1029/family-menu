import { Cloud, Mail, ShieldCheck } from "lucide-react";
import { getSupabase, isSupabaseConfigured } from "../../lib/supabase/client";

export function CloudAccount({ authEmail, setAuthEmail, authStatus, setAuthStatus, showNotice }) {
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
            邮箱登录会作为第一版入口，微信登录字段和入口已预留，后续接开放平台配置。
          </p>
        </div>
      </div>

      <form className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]" onSubmit={requestMagicLink}>
        <label className="flex min-h-12 items-center gap-2 rounded-full border border-line bg-canvas px-4">
          <Mail size={17} className="text-ink/38" />
          <input
            value={authEmail}
            onChange={(event) => setAuthEmail(event.target.value)}
            type="email"
            className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-ink/35"
            placeholder="输入邮箱，发送登录链接"
          />
        </label>
        <button type="submit" className="min-h-12 rounded-full bg-ink px-5 text-sm font-black text-white">
          发送链接
        </button>
      </form>

      <div className="mt-4 flex items-start gap-2 rounded-[20px] bg-canvas p-4 text-xs font-bold leading-5 text-ink/52">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ink" />
        {isSupabaseConfigured
          ? authStatus || "Supabase 已配置，可发送 magic link。"
          : authStatus || "当前是本地模式：配置 Supabase 环境变量后启用云同步。"}
      </div>
    </section>
  );
}
