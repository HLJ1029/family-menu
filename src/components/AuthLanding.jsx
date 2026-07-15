import { MessageCircle, Phone } from "lucide-react";
import { useState } from "react";
import { requestWechatLoginFromMiniProgram } from "../lib/humiIdentity";
import { isWechatLoginEnabled, isWechatMiniProgramWebView } from "../lib/runtime";
import { IcpFooter } from "./AppShell";
import { CloudAccount } from "./system/CloudAccount";
import { HumiScene } from "./ui/HumiScene";

export function AuthLanding({ authProps, onContinueGuest }) {
  const isWechatMiniProgram = isWechatMiniProgramWebView();
  const showDevEmailAuth =
    !isWechatMiniProgram &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("devAuth") === "email";

  return (
    <main className="min-h-screen overflow-hidden bg-canvas px-6 py-8 text-ink">
      <section className="mx-auto grid min-h-[calc(100vh-112px)] max-w-md content-between gap-8">
        <div className="pt-8 text-center">
          <p className="text-5xl font-black uppercase tracking-[0.02em] text-ink">HUMI</p>
          <p className="mt-3 text-sm font-bold tracking-[0.12em] text-ink/42">今晚吃什么</p>
        </div>

        {showDevEmailAuth ? (
          <div className="grid gap-3 rounded-[28px] border border-white/10 bg-white p-4 text-ink shadow-lift">
            <div className="rounded-[22px] bg-canvas p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">Account</p>
              <p className="mt-1 text-sm font-bold leading-6 text-ink/56">
                账号入口：用于保存云端同步和家庭空间。
              </p>
            </div>
            <CloudAccount {...authProps} compactTitle />
          </div>
        ) : (
          <>
            <div className="mx-auto grid w-full max-w-[420px] justify-items-center gap-4 text-center">
              <HumiScene scene="wechatLogin" size="hero" className="w-full" eager />
              <div>
                <p className="text-2xl font-black tracking-normal text-ink">先安排今晚</p>
                <p className="mt-2 text-sm font-bold leading-6 text-ink/48">登录后，菜单、清单和家里的口味会一起保存。</p>
              </div>
            </div>

            <MobileAuthChoices onContinueGuest={onContinueGuest} />
          </>
        )}
      </section>
      <IcpFooter compact />
    </main>
  );
}

function MobileAuthChoices({ onContinueGuest }) {
  const [status, setStatus] = useState("");
  const isWechatMiniProgram = isWechatMiniProgramWebView();
  const wechatLoginEnabled = isWechatLoginEnabled();

  function handleWechatLogin() {
    if (isWechatMiniProgram && requestWechatLoginFromMiniProgram()) {
      setStatus("正在唤起微信登录。登录后菜单、清单和家里现有会保存到微信账号。");
      return;
    }
    setStatus("微信登录正在接入。现在可以先体验 Humi，菜单和清单会保存在本机。");
  }

  function showPhoneReserved() {
    setStatus("手机号绑定会用于换设备找回，本轮先不强制。现在可以先体验 Humi。");
  }

  return (
    <div className="grid gap-4 pb-2">
      {wechatLoginEnabled ? (
        <div className="grid gap-3">
          <button
            type="button"
            onClick={handleWechatLogin}
            className="group flex min-h-14 items-center justify-center gap-2 rounded-full bg-ink px-5 text-base font-black text-white shadow-card transition hover:-translate-y-0.5"
          >
            <MessageCircle size={19} className="text-white" />
            微信登录
          </button>
          {!isWechatMiniProgram && (
            <>
              <button
                type="button"
                onClick={showPhoneReserved}
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
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={onContinueGuest}
          className="group flex min-h-14 items-center justify-center gap-2 rounded-full bg-ink px-5 text-base font-black text-white shadow-card transition hover:-translate-y-0.5"
        >
          先体验 Humi
        </button>
      )}

      <div className="px-5 text-center text-xs font-bold leading-5 text-ink/36">
        {status || (
          isWechatMiniProgram
            ? "微信登录后，菜单、画像、清单和家里现有会跟着账号保存。"
            : wechatLoginEnabled
              ? "可以先体验 Humi。创建我的家后，菜单、画像和清单会跟着账号保存。"
              : "首发先不要求登录。菜单、计划和清单会保存在当前设备。"
        )}
      </div>
    </div>
  );
}
