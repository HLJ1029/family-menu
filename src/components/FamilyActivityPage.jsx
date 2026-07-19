import { PageHeader } from "./HouseholdMembersPage";

export function FamilyActivityPage({ onBack, activeCraveRequest, activeGroceryShareRequest, activeWishShareRequest, mealLogs = {} }) {
  const activities = [
    activeCraveRequest?.createdAt && { id: `crave:${activeCraveRequest.id}`, at: activeCraveRequest.createdAt, title: "发起了今晚想吃征集", detail: `${activeCraveRequest.votes?.length || 0} 位家人已回复` },
    activeGroceryShareRequest?.createdAt && { id: `grocery:${activeGroceryShareRequest.id}`, at: activeGroceryShareRequest.createdAt, title: "分享了一起买菜清单", detail: `${activeGroceryShareRequest.items?.length || 0} 项待买食材` },
    activeWishShareRequest?.createdAt && { id: `wish:${activeWishShareRequest.id}`, at: activeWishShareRequest.createdAt, title: "发起了最近想吃", detail: `${activeWishShareRequest.wishes?.length || 0} 个想吃回复` },
    ...Object.entries(mealLogs).filter(([, log]) => log?.updatedAt).map(([date, log]) => ({ id: `meal:${date}`, at: log.updatedAt, title: "确认了一顿饭", detail: log.dinnerSource ? `晚餐：${log.dinnerSource}` : "已记下今天的吃饭安排" })),
  ].filter(Boolean).sort((left, right) => new Date(right.at) - new Date(left.at));

  return (
    <section data-testid="family-activity-page" className="mx-auto grid max-w-3xl gap-4 text-ink">
      <PageHeader eyebrow="协作记录" title="一起完成的事" onBack={onBack} />
      <section className="rounded-[28px] border border-line bg-white p-5 shadow-card sm:p-6">
        <div className="grid gap-3">
          {activities.length > 0 ? activities.map((item) => (
            <article key={item.id} className="rounded-[20px] bg-canvas p-4">
              <h3 className="font-black">{item.title}</h3>
              <p className="mt-1 text-sm font-bold text-ink/58">{item.detail}</p>
              <time className="mt-2 block text-xs font-bold text-ink/42">{formatActivityTime(item.at)}</time>
            </article>
          )) : <p className="rounded-[20px] bg-canvas p-4 text-sm font-bold leading-6 text-ink/58">还没有协作记录。发起一次想吃征集或一起买菜后，会在这里留下自然的进展。</p>}
        </div>
      </section>
    </section>
  );
}

function formatActivityTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "刚刚" : date.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
}
