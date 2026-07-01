export const planningModes = [
  {
    id: "daily_family",
    label: "日常家庭晚餐",
    shortLabel: "家庭晚餐",
    description: "家常、均衡、采购简单。",
    goals: ["省时", "少买菜", "多吃蔬菜"],
    promptHint: "按日常家庭晚餐安排，优先家常、均衡、采购简单，适合下班后 45 分钟内完成。",
  },
  {
    id: "fat_loss",
    label: "减脂期",
    shortLabel: "减脂",
    description: "少油、蔬菜比例高、蛋白充足。",
    goals: ["控油", "控热量", "高蛋白", "多吃蔬菜"],
    promptHint: "按减脂期安排，少油、蔬菜比例高、蛋白充足，避免重油重糖。",
  },
  {
    id: "fitness",
    label: "健身增肌",
    shortLabel: "健身",
    description: "高蛋白、备餐友好、主食搭配清晰。",
    goals: ["高蛋白", "适合带饭", "省时"],
    promptHint: "按健身增肌安排，优先高蛋白、备餐友好，并说明主食和蛋白搭配。",
  },
  {
    id: "baby_food",
    label: "婴幼儿辅食",
    shortLabel: "辅食",
    description: "软烂、清淡、避开高风险食材和重口味。",
    goals: ["孩子爱吃", "清淡", "少油"],
    promptHint: "按婴幼儿辅食灵感安排，优先软烂、清淡、低盐、不辣，避开整颗坚果、蜂蜜等高风险食材；只提供家庭备餐灵感，不替代医生建议。",
  },
];

export const profileOptions = {
  tastePreferences: ["家常", "清淡", "微辣", "下饭", "汤汤水水", "少油", "重口味", "新鲜感"],
  goals: ["省时", "少买菜", "高蛋白", "多吃蔬菜", "控油", "控热量", "孩子爱吃", "适合带饭"],
  dislikes: ["肥肠", "鸡爪", "太辣", "油炸", "海鲜", "香菜", "内脏", "甜口"],
  allergies: ["花生", "海鲜", "乳糖", "坚果", "鸡蛋", "豆制品"],
};

export function getPlanningMode(id) {
  return planningModes.find((mode) => mode.id === id) ?? planningModes[0];
}

export function withPlanningModeDefaults(profile = {}, planningMode) {
  const mode = getPlanningMode(planningMode ?? profile.planningMode);
  const currentGoals = new Set(profile.goals ?? []);
  mode.goals.forEach((goal) => currentGoals.add(goal));
  return {
    ...profile,
    planningMode: mode.id,
    goals: [...currentGoals],
  };
}

export function getProfileCompletedCount(profile = {}) {
  return [
    profile.planningMode,
    profile.familySize,
    profile.tastePreferences?.length,
    profile.goals?.length,
    profile.dislikes?.length || profile.allergies?.length,
    profile.shoppingTolerance,
  ].filter(Boolean).length;
}

export function formatProfileSummary(profile = {}) {
  const mode = getPlanningMode(profile.planningMode);
  const avoid = [...(profile.dislikes ?? []), ...(profile.allergies ?? [])];
  const parts = [
    `${profile.familySize ?? 2} 人`,
    mode.shortLabel,
    profile.hasChildren ? "有孩子" : "",
    avoid.length > 0 ? `避开 ${avoid.slice(0, 3).join("、")}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

export function buildCompactFamilyPrompt(profile = {}) {
  const mode = getPlanningMode(profile.planningMode);
  const parts = [
    `${profile.familySize ?? 2}人吃饭`,
    `使用场景:${mode.label}`,
    profile.hasChildren ? "有孩子一起吃" : "",
    listPart("口味", profile.tastePreferences),
    listPart("目标", profile.goals),
    listPart("不喜欢", profile.dislikes),
    listPart("不能吃", profile.allergies),
    shoppingToleranceLabel(profile.shoppingTolerance),
    mode.promptHint,
  ].filter(Boolean);
  return parts.join("；");
}

export function shoppingToleranceLabel(value) {
  if (value === "low") return "少买菜，优先用家里现有";
  if (value === "high") return "愿意专门买菜";
  return "可买2-3样主食材";
}

function listPart(label, values = []) {
  return Array.isArray(values) && values.length > 0 ? `${label}:${values.join("、")}` : "";
}
