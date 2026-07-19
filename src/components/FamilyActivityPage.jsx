import { useEffect, useMemo, useState } from "react";
import { loadHouseholdCollaborations } from "../lib/humiApi";
import { PageHeader } from "./HouseholdMembersPage";

export function FamilyActivityPage({
  onBack,
  humiSession,
  householdId,
  activeCraveRequest,
  activeGroceryShareRequest,
  activeWishShareRequest,
  mealLogs = {},
}) {
  const [status, setStatus] = useState("loading");
  const [events, setEvents] = useState([]);
  const [retryVersion, setRetryVersion] = useState(0);
  const localActivities = useMemo(
    () => buildLocalActivities({ activeCraveRequest, activeGroceryShareRequest, activeWishShareRequest, mealLogs }),
    [activeCraveRequest, activeGroceryShareRequest, activeWishShareRequest, mealLogs],
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setStatus("loading");
    setEvents([]);
    loadHouseholdCollaborations(humiSession, householdId, 50, { signal: controller.signal })
      .then((response) => {
        if (!active) return;
        setEvents(Array.isArray(response?.events) ? response.events : []);
        setStatus("ready");
      })
      .catch(() => {
        if (!active || controller.signal.aborted) return;
        setStatus("error");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [humiSession, householdId, retryVersion]);

  return (
    <section data-testid="family-activity-page" className="mx-auto grid max-w-3xl gap-4 text-ink">
      <PageHeader eyebrow="协作记录" title="一起完成的事" onBack={onBack} />
      <section className="rounded-[28px] border border-line bg-white p-5 shadow-card sm:p-6">
        {status === "loading" ? <p className="rounded-[20px] bg-canvas p-4 text-sm font-bold leading-6 text-ink/58">正在读取家庭协作记录…</p> : null}
        {status === "ready" && events.length === 0 ? <p className="rounded-[20px] bg-canvas p-4 text-sm font-bold leading-6 text-ink/58">还没有云端协作记录</p> : null}
        {status === "ready" && events.length > 0 ? <ActivityRows activities={events.map(toReadableServerActivity)} /> : null}
        {status === "error" ? (
          <div className="grid gap-3">
            <div className="rounded-[20px] bg-canvas p-4 text-sm font-bold leading-6 text-ink/58">
              <p>协作记录暂时无法读取。</p>
              <button type="button" className="mt-3 rounded-full border border-line bg-white px-4 py-2 text-sm font-black text-ink" onClick={() => setRetryVersion((value) => value + 1)}>重试</button>
            </div>
            {localActivities.length > 0 ? (
              <section className="grid gap-3" aria-label="当前设备记录">
                <p className="px-1 text-xs font-black tracking-[0.12em] text-ink/45">当前设备记录</p>
                <ActivityRows activities={localActivities} />
              </section>
            ) : null}
          </div>
        ) : null}
      </section>
    </section>
  );
}

function ActivityRows({ activities }) {
  return (
    <div className="grid gap-3">
      {activities.map((item) => (
        <article key={item.id} className="flex gap-3 rounded-[20px] bg-canvas p-4">
          <ParticipantAvatar name={item.displayName} avatarUrl={item.avatarUrl} />
          <div className="min-w-0 flex-1">
            <h3 className="font-black">{item.title}</h3>
            {item.detail ? <p className="mt-1 text-sm font-bold text-ink/58">{item.detail}</p> : null}
            <time className="mt-2 block text-xs font-bold text-ink/42">{formatActivityTime(item.at)}</time>
          </div>
        </article>
      ))}
    </div>
  );
}

function ParticipantAvatar({ name = "家人", avatarUrl = "" }) {
  if (avatarUrl) return <img className="h-10 w-10 shrink-0 rounded-full object-cover" src={avatarUrl} alt={`${name}的头像`} />;
  return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-black text-ink/58" aria-label={`${name}的头像`}>{String(name).slice(0, 1) || "家"}</span>;
}

function toReadableServerActivity(event = {}) {
  const displayName = safeText(event.participant?.displayName, "家人");
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
  if (event.actionType === "crave_vote") {
    const dishWish = safeText(payload.dishWish);
    return {
      id: safeText(event.id, `${event.createdAt}:crave`),
      at: event.createdAt,
      displayName,
      avatarUrl: safeText(event.participant?.avatarUrl),
      title: dishWish ? `${displayName}想吃${dishWish}` : `${displayName}留下了今晚想吃的想法`,
      detail: safeText(payload.note || payload.feelingTag),
    };
  }
  if (event.actionType === "grocery_claim") {
    const itemCount = Array.isArray(payload.itemIds) ? payload.itemIds.length : 0;
    const declined = payload.status === "declined";
    return {
      id: safeText(event.id, `${event.createdAt}:grocery`),
      at: event.createdAt,
      displayName,
      avatarUrl: safeText(event.participant?.avatarUrl),
      title: declined ? `${displayName} 暂时不方便认领买菜` : itemCount > 0 ? `${displayName} 已认领 ${itemCount} 项买菜` : `${displayName} 认领了买菜清单`,
      detail: safeText(payload.note),
    };
  }
  const dishName = safeText(payload.dishName);
  return {
    id: safeText(event.id, `${event.createdAt}:wish`),
    at: event.createdAt,
    displayName,
    avatarUrl: safeText(event.participant?.avatarUrl),
    title: dishName ? `${displayName}写下想吃：${dishName}` : `${displayName}写下了一道想吃`,
    detail: safeText(payload.note),
  };
}

function buildLocalActivities({ activeCraveRequest, activeGroceryShareRequest, activeWishShareRequest, mealLogs }) {
  return [
    activeCraveRequest?.createdAt && { id: `crave:${activeCraveRequest.id}`, at: activeCraveRequest.createdAt, displayName: "家人", title: "发起了今晚想吃征集", detail: `${activeCraveRequest.votes?.length || 0} 位家人已回复` },
    activeGroceryShareRequest?.createdAt && { id: `grocery:${activeGroceryShareRequest.id}`, at: activeGroceryShareRequest.createdAt, displayName: "家人", title: "分享了一起买菜清单", detail: `${activeGroceryShareRequest.items?.length || 0} 项待买食材` },
    activeWishShareRequest?.createdAt && { id: `wish:${activeWishShareRequest.id}`, at: activeWishShareRequest.createdAt, displayName: "家人", title: "发起了最近想吃", detail: `${activeWishShareRequest.wishes?.length || 0} 个想吃回复` },
    ...Object.entries(mealLogs).filter(([, log]) => log?.updatedAt).map(([date, log]) => ({ id: `meal:${date}`, at: log.updatedAt, displayName: "家人", title: "确认了一顿饭", detail: log.dinnerSource ? `晚餐：${log.dinnerSource}` : "已记下今天的吃饭安排" })),
  ].filter(Boolean).sort((left, right) => new Date(right.at) - new Date(left.at));
}

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatActivityTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "刚刚" : date.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
}
