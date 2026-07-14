export const feelingTags = [
  "随便都行",
  "辣一点",
  "清淡点",
  "想喝汤",
  "想吃肉",
  "想吃素",
  "不想动",
  "想暖胃",
  "开胃 / 酸",
];

export function createLocalCraveRequest({ householdName = "我家", initiatorName = "主厨", mealType = "dinner" } = {}) {
  const token = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    id: token,
    token,
    ownerSecret: `owner-${Math.random().toString(36).slice(2, 14)}`,
    householdName,
    initiatorName,
    mealType,
    status: "open",
    votes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function buildCraveShareUrl(token) {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("crave", token);
  return url.toString();
}

export function summarizeCraveVotes(votes = []) {
  const counts = new Map();
  votes.forEach((vote) => {
    const tag = vote.feelingTag || "随便都行";
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export function collectLearnedCraveVotes(signals = [], { excludeToken = "" } = {}) {
  return signals
    .filter((signal) => signal && signal.token !== excludeToken)
    .filter((signal) => signal.status === "closed" || !signal.token)
    .flatMap((signal) => {
      if (Array.isArray(signal.votes) && signal.votes.length > 0) return signal.votes;
      if (!signal.feelingTag) return [];
      return [{
        feelingTag: signal.feelingTag,
        createdAt: signal.createdAt,
        memberName: signal.initiatorName || "主厨",
      }];
    })
    .filter((vote) => vote?.feelingTag && vote.feelingTag !== "随便都行")
    .slice(0, 12);
}

export function formatCraveReason(votes = []) {
  const summary = summarizeCraveVotes(votes);
  if (summary.length === 0) return "还没人回复，先按家里忌口和省心程度来。";
  return `照顾到：${summary.map((item) => `${item.tag}${item.count > 1 ? ` x${item.count}` : ""}`).join(" · ")}`;
}
