import { CheckCircle2, Clock3, MessageCircleHeart, Send, Sparkles, Users } from "lucide-react";
import { feelingTags, summarizeCraveVotes } from "../lib/collaboration";

export function CraveStarterSheet({
  selectedFeeling,
  onSelectFeeling,
  onStart,
  onDecideAlone,
  compact = false,
}) {
  return (
    <CraveSheetShell
      eyebrow="今晚征集单"
      title="今晚想问大家什么口味？"
      subtitle="先替这次征集定一个方向，家人打开卡片后只要点一个感觉。"
      statusLabel="未发送"
      compact={compact}
      footer={(
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={onStart} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-black text-white">
            <Send size={16} />
            生成征集卡片
          </button>
          <button type="button" onClick={onDecideAlone} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-line bg-white px-5 text-sm font-black text-ink">
            <Sparkles size={16} />
            我自己做主
          </button>
        </div>
      )}
    >
      <FeelingWall selectedFeeling={selectedFeeling} onSelectFeeling={onSelectFeeling} />
    </CraveSheetShell>
  );
}

export function CraveCollectingSheet({
  request,
  onCopyCraveLink,
  onRefreshCraveRequest,
  onGenerateFromCrave,
  compact = false,
}) {
  const votes = request?.votes ?? [];
  const summary = summarizeCraveVotes(votes);
  const deadlineLabel = formatCraveDeadline(request);

  return (
    <CraveSheetShell
      eyebrow="征集中"
      title="大家点了什么感觉"
      subtitle={votes.length > 0 ? `已收到 ${votes.length} 个回复，可以随时出菜单。` : "卡片已经准备好。没人回也可以直接让 Humi 出菜单。"}
      statusLabel={`已回 ${votes.length}`}
      compact={compact}
      footer={(
        <div className="grid gap-2 sm:grid-cols-3">
          <button type="button" onClick={onCopyCraveLink} className="min-h-11 rounded-full bg-ink px-4 text-sm font-black text-white">复制/分享</button>
          <button type="button" onClick={onRefreshCraveRequest} className="min-h-11 rounded-full border border-ink bg-white px-4 text-sm font-black text-ink">刷新回复</button>
          <button type="button" onClick={onGenerateFromCrave} className="min-h-11 rounded-full border border-ink bg-white px-4 text-sm font-black text-ink">现在出菜单</button>
        </div>
      )}
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          {summary.length > 0 ? summary.map((item) => (
            <span key={item.tag} className="rounded-full bg-ink px-3 py-2 text-xs font-black text-white">
              {item.tag}{item.count > 1 ? ` x${item.count}` : ""}
            </span>
          )) : (
            <span className="rounded-full border border-line bg-white px-3 py-2 text-xs font-black text-ink/52">
              等家人点一个感觉
            </span>
          )}
        </div>
        <div className="grid gap-2">
          {votes.length > 0 ? votes.slice(0, 5).map((vote, index) => (
            <VoteReceiptRow key={vote.id || `${vote.participantKey || "vote"}:${index}`} vote={vote} />
          )) : (
            <div className="rounded-[18px] border border-line bg-white p-3 text-sm font-bold leading-6 text-ink/52">
              在小程序里点右上角分享给家人；家人免登录点完后，回到这里刷新。
            </div>
          )}
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-black text-ink/45">
          <Clock3 size={14} />
          {deadlineLabel}
        </div>
      </div>
    </CraveSheetShell>
  );
}

export function CraveVoteSheet({
  request,
  selectedFeeling,
  onSelectFeeling,
  memberName,
  onMemberNameChange,
  note,
  onNoteChange,
  status,
  onSubmit,
}) {
  return (
    <form onSubmit={onSubmit}>
      <CraveSheetShell
        eyebrow={`${request?.householdName || "我家"} · 今晚`}
        title="你想吃点啥？"
        subtitle="不用想菜名，点一个今晚的感觉就行。"
        statusLabel="免登录可投"
        footer={(
          <div className="grid gap-3">
            <input
              value={memberName}
              onChange={onMemberNameChange}
              className="min-h-12 rounded-full border border-line bg-white px-4 text-sm font-bold outline-none focus:border-ink/30"
              placeholder="怎么称呼你？可不填"
            />
            <input
              value={note}
              onChange={onNoteChange}
              className="min-h-12 rounded-full border border-line bg-white px-4 text-sm font-bold outline-none focus:border-ink/30"
              placeholder="想补一句？可不填"
            />
            {status && <p className="text-sm font-bold leading-6 text-ink/52">{status}</p>}
            <button type="submit" className="inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 text-base font-black text-white">
              <CheckCircle2 size={18} />
              发给主厨
            </button>
          </div>
        )}
      >
        <FeelingWall selectedFeeling={selectedFeeling} onSelectFeeling={onSelectFeeling} large />
      </CraveSheetShell>
    </form>
  );
}

export function CraveSubmittedSheet({ request, status, onJoinHousehold, onClose }) {
  const resultDishes = request?.resultSummary?.dishes ?? [];
  return (
    <CraveSheetShell
      eyebrow="已回传"
      title="收到！主厨会看着安排"
      subtitle={resultDishes.length > 0 ? "这次征集已经出菜单了，可以加入这个家看结果。" : "你已经完成这次投票了，关掉也没关系。"}
      statusLabel="已提交"
      footer={(
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={onJoinHousehold} className="rounded-full bg-ink px-6 py-3 text-sm font-black text-white">
            {resultDishes.length > 0 ? "加入这个家" : "加入这个家看结果"}
          </button>
          <button type="button" onClick={onClose} className="rounded-full border border-line bg-white px-6 py-3 text-sm font-black text-ink">
            先不用
          </button>
        </div>
      )}
    >
      <ResultSummary request={request} status={status} />
    </CraveSheetShell>
  );
}

export function CraveClosedSheet({ request, status, onClose }) {
  return (
    <CraveSheetShell
      eyebrow="征集结束"
      title="今晚已经安排好了"
      subtitle="这次征集已经关闭，回到 Humi 后可以看主厨最后定了什么。"
      statusLabel="已结束"
      footer={(
        <button type="button" onClick={onClose} className="w-full rounded-full bg-ink px-6 py-3 text-sm font-black text-white">
          回到 Humi
        </button>
      )}
    >
      <ResultSummary request={request} status={status} />
    </CraveSheetShell>
  );
}

function CraveSheetShell({ eyebrow, title, subtitle, statusLabel, children, footer, compact = false }) {
  return (
    <section className={`relative overflow-hidden rounded-[28px] border border-line bg-canvas shadow-card ${compact ? "p-4" : "p-5 sm:p-6"}`}>
      <div className="absolute right-4 top-4 grid h-12 w-12 place-items-center rounded-[18px] bg-ink text-white">
        <MessageCircleHeart size={22} />
      </div>
      <div className="absolute bottom-4 right-5 text-[3.5rem] font-black leading-none text-ink/[0.035] sm:text-[4.5rem]">HUMI</div>
      <div className="relative pr-14">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-ink/38">{eyebrow}</p>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-ink/45">{statusLabel}</span>
        </div>
        <h3 className={`${compact ? "mt-2 text-2xl" : "mt-3 text-3xl sm:text-4xl"} max-w-[12em] font-black leading-tight tracking-[-0.04em] text-ink`}>
          {title}
        </h3>
        {subtitle && <p className="mt-2 max-w-xl text-sm font-bold leading-6 text-ink/52">{subtitle}</p>}
      </div>
      <div className="relative mt-5">{children}</div>
      {footer && <div className="relative mt-5">{footer}</div>}
    </section>
  );
}

function FeelingWall({ selectedFeeling, onSelectFeeling, large = false }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {feelingTags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onSelectFeeling?.(tag)}
          className={`${large ? "min-h-14 text-base" : "min-h-11 text-sm"} rounded-[18px] border px-3 font-black transition ${
            selectedFeeling === tag
              ? "border-ink bg-ink text-white shadow-card"
              : "border-line bg-white text-ink hover:border-ink/30"
          } ${tag === "随便都行" ? "col-span-2 sm:col-span-3" : ""}`}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}

function VoteReceiptRow({ vote }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] border border-line bg-white p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-black">{vote.memberName || "家人"} · {vote.feelingTag || "随便都行"}</p>
        {vote.note && <p className="mt-1 truncate text-xs font-bold text-ink/42">{vote.note}</p>}
      </div>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-canvas text-ink/52">
        <Users size={15} />
      </span>
    </div>
  );
}

function ResultSummary({ request, status }) {
  const resultDishes = request?.resultSummary?.dishes ?? [];
  return (
    <div className="rounded-[22px] border border-line bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-white">
          <CheckCircle2 size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black text-ink">{request?.initiatorName || "主厨"}会收到这张征集单</p>
          <p className="mt-1 text-xs font-bold leading-5 text-ink/48">{status || "点完就可以关掉，后面由主厨安排。"}</p>
        </div>
      </div>
      {resultDishes.length > 0 && (
        <div className="mt-4 grid gap-2">
          {resultDishes.slice(0, 3).map((dish, index) => (
            <div key={dish.id || `${dish.name}:${index}`} className="flex items-center justify-between gap-3 rounded-[16px] bg-canvas px-3 py-2">
              <span className="truncate text-sm font-black">{dish.name}</span>
              {dish.timeMinutes && <span className="shrink-0 text-xs font-black text-ink/42">{dish.timeMinutes} min</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatCraveDeadline(request) {
  const explicitTime = new Date(request?.deadlineAt || "").getTime();
  const createdTime = new Date(request?.createdAt || "").getTime();
  const deadlineTime = Number.isFinite(explicitTime)
    ? explicitTime
    : Number.isFinite(createdTime)
      ? createdTime + 30 * 60 * 1000
      : NaN;
  if (!Number.isFinite(deadlineTime)) return "随时可以出菜单。";
  const remainingMinutes = Math.ceil((deadlineTime - Date.now()) / 60000);
  if (remainingMinutes <= 0) return "已经可以出菜单。";
  return `约 ${remainingMinutes} 分钟后也可以直接出菜单。`;
}
