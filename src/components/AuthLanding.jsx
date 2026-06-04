import { ChefHat, ShoppingBasket, Sparkles } from "lucide-react";
import { CloudAccount } from "./system/CloudAccount";
import { PwaLaunchPanel } from "./system/PwaLaunchPanel";

export function AuthLanding({ authProps, onContinueGuest }) {
  return (
    <main className="min-h-screen bg-canvas px-4 py-5 text-ink">
      <section className="mx-auto grid min-h-[calc(100vh-40px)] max-w-xl content-center gap-5">
        <div className="rounded-[32px] bg-ink p-6 text-white shadow-lift">
          <p className="text-sm font-black uppercase tracking-[0.24em] text-acid">呼米</p>
          <h1 className="mt-4 text-5xl font-black tracking-[-0.05em]">
            今晚吃什么？
          </h1>
          <p className="mt-4 text-sm font-bold leading-7 text-white/62">
            今天的晚饭，我们帮你先想。想保存家里的菜单和口味，再登录也不迟。
          </p>
          <div className="mt-6 grid grid-cols-3 gap-2">
            <FeaturePill icon={Sparkles} label="推荐" />
            <FeaturePill icon={ChefHat} label="菜谱" />
            <FeaturePill icon={ShoppingBasket} label="清单" />
          </div>
        </div>

        <CloudAccount {...authProps} />
        <PwaLaunchPanel compact />

        <button
          type="button"
          onClick={onContinueGuest}
          className="min-h-12 rounded-full border border-line bg-white px-5 text-sm font-black text-ink/62 shadow-card transition hover:text-ink"
        >
          先体验部分功能
        </button>
      </section>
    </main>
  );
}

function FeaturePill({ icon: Icon, label }) {
  return (
    <div className="grid place-items-center rounded-[20px] bg-white/8 p-3 text-xs font-black text-white/72">
      <Icon size={18} className="mb-2 text-acid" />
      {label}
    </div>
  );
}
