import { Cloud, Database, UserRound } from "lucide-react";
import { CloudAccount } from "./system/CloudAccount";
import { CloudSyncPanel } from "./system/CloudSyncPanel";
import { FamilyPreferencesPanel } from "./system/FamilyPreferencesPanel";
import { PwaLaunchPanel } from "./system/PwaLaunchPanel";
import { Card } from "./ui/Card";

export function UserCenter({ authProps, cloudMenuProps, preferenceProps, session, family }) {
  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_0.85fr]">
      <div className="grid gap-5">
        <section className="rounded-[32px] bg-ink p-6 text-white shadow-lift md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.24em] text-acid">我的家</p>
          <h2 className="mt-4 max-w-2xl text-4xl font-black tracking-[-0.04em] md:text-6xl">
            把家里的吃饭习惯存下来。
          </h2>
          <p className="mt-4 max-w-xl text-sm font-bold leading-7 text-white/62">
            先体验也可以。想让菜单、清单和口味一直跟着你，再登录保存。
          </p>
        </section>

        <CloudAccount {...authProps} />
        <CloudSyncPanel {...cloudMenuProps} />
        <FamilyPreferencesPanel {...preferenceProps} />
      </div>

      <aside className="grid content-start gap-5">
        <PwaLaunchPanel compact />

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">我的家</p>
              <h3 className="card-title">当前状态</h3>
            </div>
            <UserRound size={22} />
          </div>
          <div className="mt-5 grid gap-3">
            <StatusRow label="登录" value={session?.user?.email ?? "未登录"} />
            <StatusRow label="我的家" value={family?.name ?? "未创建"} />
            <StatusRow
              label="保存方式"
              value={getSyncModeLabel({ family, cloudMenuProps })}
            />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">接下来</p>
              <h3 className="card-title">接下来</h3>
            </div>
            <Database size={22} />
          </div>
          <p className="mt-4 text-sm font-bold leading-7 text-ink/52">
            现在可以先用食间安排晚饭。下一步准备小程序入口，让家里人更容易打开。
          </p>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-acid">
              <Cloud size={20} />
            </span>
            <div>
              <p className="font-black">微信登录准备中</p>
              <p className="mt-1 text-xs font-bold leading-5 text-ink/45">
                当前先不放不可用按钮。等小程序和正式域名准备好，再接微信登录。
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <a
              href="/family-menu/privacy.html"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-line bg-canvas px-3 text-xs font-black text-ink/58 transition hover:text-ink"
            >
              隐私政策
            </a>
            <a
              href="/family-menu/terms.html"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-line bg-canvas px-3 text-xs font-black text-ink/58 transition hover:text-ink"
            >
              用户协议
            </a>
          </div>
        </Card>
      </aside>
    </section>
  );
}

function getSyncModeLabel({ family, cloudMenuProps }) {
  if (!family) return "先保存在本机";
  if (cloudMenuProps?.cloudMenuEnabled && cloudMenuProps?.cloudGroceryEnabled) return "已保存到我的家";
  if (cloudMenuProps?.cloudMenuEnabled || cloudMenuProps?.cloudGroceryEnabled) return "部分已保存";
  return "待保存";
}

function StatusRow({ label, value }) {
  return (
    <div className="rounded-[18px] bg-canvas p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">{label}</p>
      <p className="mt-1 break-all text-sm font-black">{value}</p>
    </div>
  );
}
