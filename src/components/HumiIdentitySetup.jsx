import { MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { updateHumiIdentityProfile } from "../lib/humiApi";
import { requestWechatLoginFromMiniProgram } from "../lib/humiIdentity";
import { isWechatMiniProgramWebView } from "../lib/runtime";
import { IcpFooter } from "./AppShell";
import { humiAvatarScenes } from "./ui/brandScenes";

export function HumiIdentitySetup({ session, onComplete }) {
  const currentName = session?.user?.displayName === "微信用户" ? "" : session?.user?.displayName || "";
  const [displayName, setDisplayName] = useState(currentName);
  const [avatarKey, setAvatarKey] = useState(session?.user?.avatarKey || humiAvatarScenes[0].id);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const nativeTimerRef = useRef(null);
  const isMiniProgram = isWechatMiniProgramWebView();

  useEffect(() => () => globalThis.clearTimeout(nativeTimerRef.current), []);

  async function saveIdentity(event) {
    event.preventDefault();
    const normalizedName = displayName.trim();
    if (!normalizedName) {
      setStatus("请先填写你的昵称。");
      return;
    }
    setPending(true);
    setStatus("正在保存你的身份...");
    try {
      const data = await updateHumiIdentityProfile(session, { displayName: normalizedName, avatarKey });
      onComplete(data.user);
    } catch (error) {
      setStatus(error.message || "身份暂时没有保存成功，请重试。");
      setPending(false);
    }
  }

  function openWechatIdentity() {
    const recover = () => {
      globalThis.clearTimeout(nativeTimerRef.current);
      setStatus("当前版本没有打开微信身份页，你仍可在这里填写昵称和选择头像。");
    };
    setStatus("正在打开微信头像和昵称...");
    if (!requestWechatLoginFromMiniProgram({ reuseSession: true, onFailure: recover })) {
      recover();
      return;
    }
    nativeTimerRef.current = globalThis.setTimeout(recover, 4500);
  }

  return (
    <main className="min-h-screen bg-canvas px-6 py-8 text-ink">
      <section className="mx-auto grid max-w-md gap-6">
        <header className="pt-6 text-center">
          <p className="text-5xl font-black tracking-[0.02em]">HUMI</p>
          <h1 className="mt-3 text-sm font-black tracking-[0.12em] text-ink/48">完善你的身份</h1>
          <p className="mt-3 text-sm font-bold leading-6 text-ink/52">家人会通过昵称和头像认出你，只需要设置一次。</p>
        </header>

        <form onSubmit={saveIdentity} className="grid gap-5 rounded-[28px] border border-line bg-white p-5 shadow-card">
          <label className="grid gap-2 text-sm font-black">
            你的昵称
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={32}
              autoComplete="nickname"
              placeholder="例如：小禾"
              className="min-h-12 rounded-2xl border border-line bg-canvas px-4 text-base font-bold outline-none focus:border-ink/35"
            />
          </label>

          <fieldset className="grid gap-3">
            <legend className="text-sm font-black">选择一个头像</legend>
            <div className="grid grid-cols-4 gap-3">
              {humiAvatarScenes.map((avatar, index) => (
                <button
                  key={avatar.id}
                  type="button"
                  aria-label={`选择头像 ${index + 1}`}
                  aria-pressed={avatarKey === avatar.id}
                  onClick={() => setAvatarKey(avatar.id)}
                  className={`aspect-square overflow-hidden rounded-full border-2 bg-canvas transition ${avatarKey === avatar.id ? "border-ink ring-2 ring-ink/12" : "border-transparent"}`}
                >
                  <img src={avatar.src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={pending}
            className="min-h-14 rounded-full bg-ink px-5 text-base font-black text-white disabled:opacity-55"
          >
            {pending ? "正在保存" : "保存并进入 Humi"}
          </button>

          {isMiniProgram && (
            <button type="button" onClick={openWechatIdentity} className="inline-flex min-h-11 items-center justify-center gap-2 text-xs font-black text-ink/48">
              <MessageCircle size={16} />
              使用微信头像和昵称
            </button>
          )}

          {status && <p role="status" className="text-center text-xs font-bold leading-5 text-ink/48">{status}</p>}
        </form>
      </section>
      <IcpFooter compact />
    </main>
  );
}
