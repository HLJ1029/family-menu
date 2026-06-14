import { MessageCircle, Phone } from "lucide-react";
import { useState } from "react";
import { photoFor, recipes } from "../lib/recipes";
import { isWechatMiniProgramWebView } from "../lib/runtime";
import { CloudAccount } from "./system/CloudAccount";

export function AuthLanding({ authProps, onContinueGuest }) {
  const isWechatMiniProgram = isWechatMiniProgramWebView();
  const showDevEmailAuth =
    !isWechatMiniProgram &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("devAuth") === "email";
  const featuredRecipe = recipes[0];

  return (
    <main className="min-h-screen overflow-hidden bg-canvas px-6 py-8 text-ink">
      <section className="mx-auto grid min-h-[calc(100vh-64px)] max-w-md content-between gap-8">
        <div className="pt-8 text-center">
          <p className="text-5xl font-black uppercase tracking-[0.02em] text-ink">HUMI</p>
          <p className="mt-3 text-sm font-bold tracking-[0.12em] text-ink/42">今晚吃什么</p>
        </div>

        {showDevEmailAuth ? (
          <div className="grid gap-3 rounded-[28px] border border-white/10 bg-white p-4 text-ink shadow-lift">
            <div className="rounded-[22px] bg-canvas p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">Dev auth</p>
              <p className="mt-1 text-sm font-bold leading-6 text-ink/56">
                开发测试入口：仅用于验证云端同步和家庭空间。
              </p>
            </div>
            <CloudAccount {...authProps} compactTitle />
          </div>
        ) : (
          <>
            <div className="relative mx-auto grid aspect-square w-full max-w-[360px] place-items-center">
              <div className="absolute inset-8 rounded-full bg-acid/35 blur-3xl" />
              <div className="absolute inset-1 rounded-full bg-apricot/12 blur-2xl" />
              <img
                src={photoFor(featuredRecipe)}
                alt=""
                loading="eager"
                decoding="async"
                className="relative h-[82%] w-[82%] rounded-full bg-white object-cover shadow-[0_30px_90px_rgba(17,17,17,0.12)]"
              />
              <div className="absolute bottom-5 left-5 rounded-[22px] border border-line bg-white/88 px-4 py-3 text-left shadow-card backdrop-blur-xl">
                <p className="text-sm font-black text-ink">先安排今晚</p>
                <p className="mt-1 text-xs font-bold text-ink/42">Humi</p>
              </div>
            </div>

            <MobileAuthChoices onContinueGuest={onContinueGuest} />
          </>
        )}
      </section>
    </main>
  );
}

function MobileAuthChoices({ onContinueGuest }) {
  const [status, setStatus] = useState("");

  function showComingSoon(method) {
    setStatus(`${method}正在接入。现在可以先体验 Humi，菜单和清单会保存在本机。`);
  }

  return (
    <div className="grid gap-4 pb-2">
      <div className="grid gap-3">
        <button
          type="button"
          onClick={() => showComingSoon("微信登录")}
          className="group flex min-h-14 items-center justify-center gap-2 rounded-full bg-ink px-5 text-base font-black text-white shadow-card transition hover:-translate-y-0.5"
        >
          <MessageCircle size={19} className="text-acid" />
          微信登录
        </button>
        <button
          type="button"
          onClick={() => showComingSoon("手机号登录")}
          className="min-h-11 rounded-full text-xs font-black text-ink/42 transition hover:text-ink"
        >
          <span className="inline-flex items-center gap-2">
            <Phone size={14} />
            手机号登录
          </span>
        </button>
        <button
          type="button"
          onClick={onContinueGuest}
          className="min-h-11 rounded-full text-xs font-black text-ink/42 transition hover:text-ink"
        >
          先体验 Humi
        </button>
      </div>

      <div className="px-5 text-center text-xs font-bold leading-5 text-ink/36">
        {status || "微信和手机号登录正在接入。现在可以先体验 Humi，菜单和清单会保存在本机。"}
      </div>
    </div>
  );
}
