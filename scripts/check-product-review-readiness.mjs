import { access, readFile } from "node:fs/promises";

const REQUIRED_CHECKS = [
  {
    key: "dashboard-secondary-entrypoints",
    title: "今晚首屏可发现完整菜品库与我的家",
    path: "src/components/Dashboard.jsx",
    required: ["dashboard-library-entry", "dashboard-library-entry-label", "whitespace-nowrap", "全部菜品", "onOpenRecipeLibrary", "label=\"打开我的家\"", "z-30"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["dashboard-self-pick-opens-full-library", "dashboard-library-entry-label-stays-on-one-line", "dashboard-avatar-opens-my-home"],
  },
  {
    key: "auxiliary-child-navigation",
    title: "辅助页保留三主 tab 和明确父级关系",
    path: "src/components/AppShell.jsx",
    required: ["getPrimaryNavId", "mobile-primary-navigation", "aria-current", "label=\"打开我的家\""],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: [
      "library-child-page-keeps-three-primary-tabs",
      "library-child-page-belongs-to-tonight-tab",
      "library-child-page-primary-tabs-are-visible-and-equal",
      "library-child-page-back-returns-tonight",
      "child-page-avatar-opens-my-home",
    ],
  },
  {
    key: "dish-discovery",
    title: "今晚菜单发现新菜入口",
    path: "src/components/TodayMenu.jsx",
    required: ["发现新菜", "补进今晚", "再加一份", "onOpenLibraryDiscovery", "openFullLibrary"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["library-dish-adds-to-tonight-menu", "library-dish-adds-to-dinner-plan", "青椒土豆丝"],
  },
  {
    key: "library-card-browsing",
    title: "完整菜品库与已安排菜置顶",
    path: "src/components/Library.jsx",
    required: ["selected-recipes-panel", "今晚已安排", "未安排的新菜", "补进今晚", "allRecipes", "recipeSource.length"],
    evidence: "docs/humi-1.1-spec-acceptance-audit.md",
    evidenceRequired: ["推荐外提供完整菜品库子页面", "138 道菜", "已安排菜置顶"],
  },
  {
    key: "family-ask-feedback",
    title: "我的家问问大家本页反馈",
    path: "src/components/UserCenter.jsx",
    required: ["问问大家", "查看征集单", "今晚征集单已经在我的家展开", "setFamilyCraveStatus"],
    evidence: "docs/humi-1.1-pre-review-hardening.md",
    evidenceRequired: ["我的家协作入口", "今晚征集单", "本页反馈", "查看征集单"],
  },
  {
    key: "crave-sheet-template",
    title: "今晚征集单统一模板",
    path: "src/components/CraveSheet.jsx",
    required: ["今晚征集单", "分享征集单", "提交征集单", "回到 Humi 看今晚"],
    evidence: "docs/humi-1.1-pre-review-hardening.md",
    evidenceRequired: ["征集口味单据模板确认", "五个状态", "今晚征集单"],
    minOccurrences: { text: "eyebrow=\"今晚征集单\"", count: 5 },
  },
  {
    key: "crave-recipient-picker",
    title: "征集发起先选家人",
    path: "src/components/CraveSheet.jsx",
    required: ["今晚想问谁？", "selectedMemberIds", "onToggleMember", "发给"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["crave-members-default-selected", "crave-create-keeps-selected-members", "crave-waiting-shows-member-feeling", "crave-waiting-allows-manual-menu"],
  },
  {
    key: "solo-owner-crave-fallback",
    title: "没有家人时主厨仍可直接出菜单和清单",
    path: "src/components/CraveSheet.jsx",
    required: ["还没有正式成员也没关系", "我自己做主", "生成征集卡片"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["solo-owner-can-decide-without-family", "solo-owner-flow-generates-menu-and-grocery"],
  },
  {
    key: "multi-household-ui",
    title: "一个用户可在我的家切换独立家庭数据",
    path: "src/components/UserCenter.jsx",
    required: ["household-switcher", "多个家", "当前用的是", "onSwitch"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["multi-household-switch-is-user-visible", "multi-household-switch-loads-isolated-menu"],
  },
  {
    key: "member-write-boundary",
    title: "家人只写自己的参与数据",
    path: "api/store.js",
    required: ["mergeMemberWritableState", "preservedWantItems", "preservedClaims", "completedOwnKeys"],
    evidence: "scripts/smoke-humi-api.mjs",
    evidenceRequired: ["member state save must not replace the owner menu", "member should add their own want-to-eat item"],
  },
  {
    key: "server-owned-entitlement",
    title: "推荐权益不可由客户端升级",
    path: "api/store.js",
    required: ["mergeClientRecommendationAccess", "plan: current.plan", "Math.min", "Math.max"],
    evidence: "scripts/smoke-humi-api.mjs",
    evidenceRequired: ["client state must not grant plus access", "client state must not restore precise trials"],
  },
  {
    key: "guest-collaboration-landings",
    title: "三类分享落地页免登录参与",
    path: "package.json",
    required: ["release:collaboration:smoke"],
    evidence: "scripts/smoke-collaboration-landings.mjs",
    evidenceRequired: ["免登录参与", "不用先做设置", "一家人的饭放在一起", "invite-guest-want-posted-without-login", "auth/wechat/login"],
  },
  {
    key: "inventory-is-behavior-not-a-page",
    title: "食材库存只在自然动作中反推",
    path: "src/components/GroceryList.jsx",
    required: ["这次不用买", "NeutralEmptyState", "进度会自动更新"],
    forbidden: ["后台已有", "营养视图", "HumiEmptyState"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["inventory-maintenance-is-not-exposed", "grocery-check-adds-hidden-pantry-clue", "dinner-confirmation-consumes-hidden-pantry-clue", "nutrition-entry-is-not-on-grocery-tab"],
  },
  {
    key: "family-collaboration-activity",
    title: "我的家沉淀认领、做饭与想吃动态",
    path: "src/components/UserCenter.jsx",
    required: ["groceryActivity", "dinnerActivity", "wantActivity", "familyCraveOpen", "buildDinnerActivityTitle"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["family-activity-shows-grocery-claim", "family-activity-shows-dinner-confirmation", "family-activity-shows-want-item", "family-activity-precedes-account-settings", "want-pool-precedes-account-settings", "used-family-activity-hides-self-introduction", "crave-starter-is-collapsed-until-requested"],
  },
  {
    key: "crave-state-persistence",
    title: "征集单跨会话保存与超时收口",
    path: "api/server.js",
    required: ["craveSignals: sanitizeList", "sanitizeCraveSignal", "getOptionalAuth", "auth?.userId"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["persisted-crave-auto-generates-after-deadline", "no-reply-crave-keeps-initiator-feeling", "persisted-crave-closes-with-owner-session", "crave-result-converges-to-menu-and-plan", "crave-result-generates-grocery"],
  },
  {
    key: "recommendation-history-isolation",
    title: "推荐参考本家历史且不跨请求污染",
    path: "src/lib/recommendation/rules.js",
    required: ["collectRecentRecipeIds", "mealLogs", "const recentRecipeIds"],
    forbidden: ["const recentRecipeIds = new Set();"],
    evidence: "scripts/check-recommendation-constraints.mjs",
    evidenceRequired: ["推荐应降低最近已吃菜品的排名", "不得跨调用污染"],
  },
  {
    key: "tonight-first-viewport",
    title: "晚饭主行动在手机首屏且早午餐后置",
    path: "src/components/Dashboard.jsx",
    required: ["tonight-primary-action", "meal-rhythm-panel", "!craveSelectionMode && dinnerActions"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["tonight-primary-action-is-in-first-viewport", "tonight-hero-has-one-solid-primary-action", "tonight-hero-has-no-permanent-scene-illustration", "breakfast-and-lunch-follow-dinner-decision", "tonight-do-writes-menu-and-dinner-plan", "tonight-do-auto-generates-grocery"],
  },
  {
    key: "breakfast-lightweight-recording",
    title: "早餐先走常吃轻选，完整菜品库作为扩展",
    path: "src/components/BreakfastQuickPicker.jsx",
    required: ["breakfast-quick-picker", "从常吃的早餐里点一个", "更多早餐选择"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["breakfast-opens-lightweight-quick-picker", "breakfast-more-options-starts-in-breakfast-category", "breakfast-saves-user-picked-dish"],
  },
  {
    key: "optional-week-plan-flow",
    title: "手机今晚可进入连排并汇总三餐清单",
    path: "src/components/Dashboard.jsx",
    required: ["dashboard-planner-entry", "想连排几天？", "onViewChange(\"planner\")"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["dashboard-planner-entry-opens-optional-week-plan", "week-plan-shows-grocery-summary-action", "week-plan-grocery-summary-opens-shared-list"],
  },
  {
    key: "hard-constraint-only-profile-input",
    title: "用户只主动维护忌口，不填写软口味表",
    path: "src/components/ProfileOnboarding.jsx",
    required: ["家里不能吃什么", "其他口味会从感觉征集和做饭记录里慢慢学", "没有忌口，直接开始"],
    forbidden: ["planningModes", "profileOptions.goals", "这次主要想规划什么", "晚饭目标"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: [
      "my-home-exposes-diet-constraints-only",
      "soft-profile-maintenance-is-not-exposed",
      "signed-in-onboarding-only-asks-hard-constraints",
      "signed-in-onboarding-can-skip-without-diet-tags",
      "signed-in-onboarding-saves-diet-constraint",
    ],
  },
  {
    key: "owner-managed-family-constraints",
    title: "家人只读家庭忌口，主厨负责修改",
    path: "src/components/UserCenter.jsx",
    required: ["family-constraints-readonly", "主厨统一维护", "canManageHouseholdMenu && activeSettings"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["member-cannot-edit-family-diet-constraints", "member-sees-meal-rhythm-without-owner-controls"],
  },
  {
    key: "nutrition-feedback-layer",
    title: "营养页只做行为回看，不要求用户维护目标",
    path: "src/components/StatsPage.jsx",
    required: ["nutrition-reflection-page", "营养回看", "这只是近期趋势提醒，不需要额外设置目标"],
    forbidden: ["目标管理", "目标完成度", "营养目标看板", "修改目标"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["nutrition-is-feedback-not-maintenance"],
  },
  {
    key: "member-library-participation",
    title: "家人发现菜品后加入想吃池而非改菜单",
    path: "src/components/Library.jsx",
    required: ["canManageMenu", "actionLabelOverride", "主厨已安排"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["member-library-contributes-to-want-pool", "加入想吃池子"],
  },
  {
    key: "learned-taste-feeds-recommendation",
    title: "历史感觉与确认做饭反哺推荐",
    path: "src/main.jsx",
    required: ["collectLearnedCraveVotes", "craveVotes: learnedCraveVotes"],
    evidence: "scripts/check-recommendation-constraints.mjs",
    evidenceRequired: ["collectLearnedCraveVotes", "mealHistorySampleCount", "确认做过的菜应沉淀为类型偏好"],
  },
  {
    key: "neutral-palette",
    title: "1.1 主界面保持黑白灰调色板",
    path: "package.json",
    required: ["validate:palette"],
    evidence: "scripts/validate-neutral-palette.mjs",
    evidenceRequired: ["COLOR_UTILITY", "isNeutral", "findings.length === 0"],
  },
  {
    key: "product-entrypoint-smoke",
    title: "候选入口线上烟测脚本",
    path: "package.json",
    required: ["release:product:smoke"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["www.humi-home.com", "全部菜品库", "查看征集单", "breakfast-does-not-default-to-seaweed-soup", "lunch-home-saves-user-picked-dish", "lunch-does-not-default-to-seaweed-soup", "grocery-share-opens-native-share-page", "crave-share-opens-native-share-page"],
  },
  {
    key: "native-share-card-evidence-gate",
    title: "小程序原生分享证据使用 OCR 语义门禁",
    path: "scripts/check-miniprogram-share-evidence.mjs",
    required: ["visualMarkers", "虚拟好友", "hasSendAction", "recognize-screenshot-text.swift"],
    evidence: "scripts/recognize-screenshot-text.swift",
    evidenceRequired: ["VNRecognizeTextRequest", "recognitionLanguages", "zh-Hans"],
  },
  {
    key: "review-confirmation-gate",
    title: "微信审核动作必须显式确认",
    path: "scripts/prepare-wechat-submit-workspace.mjs",
    required: ["HUMI_WECHAT_REVIEW_ACTION_CONFIRMED", "Humi 1.1 微信提审工作台未打开"],
    evidence: "docs/humi-1.1-closure-map.md",
    evidenceRequired: ["先完成产品功能，再谈审核", "不要自动提交审核", "再讨论候选内测与审核"],
  },
];

const checks = [];

for (const item of REQUIRED_CHECKS) {
  checks.push(await runCheck(item));
}

const ok = checks.every((item) => item.ok);
const result = {
  ok,
  checkedAt: new Date().toISOString(),
  scope: checks.map(({ key, title, path, evidence, ok }) => ({ key, title, path, evidence, ok })),
  failures: checks.flatMap((item) => item.failures.map((failure) => ({
    key: item.key,
    title: item.title,
    ...failure,
  }))),
  nextActions: ok
    ? [
        "Product anchors are covered. Continue local product acceptance and resolve the payment-scope decision; do not deploy, upload, or enter WeChat review before user acceptance.",
      ]
    : [
        "Fix the failed product review anchors before treating 1.1 as ready for final pre-review confirmation.",
      ],
};

console.log(JSON.stringify(result, null, 2));
if (!ok) process.exit(1);

async function runCheck(item) {
  const failures = [];
  const source = await readText(item.path, failures);
  const evidence = await readText(item.evidence, failures);

  for (const text of item.required) {
    if (!source.includes(text)) {
      failures.push({ path: item.path, missing: text });
    }
  }

  for (const text of item.forbidden ?? []) {
    if (source.includes(text)) {
      failures.push({ path: item.path, forbidden: text });
    }
  }

  for (const text of item.evidenceRequired ?? []) {
    if (!evidence.includes(text)) {
      failures.push({ path: item.evidence, missing: text });
    }
  }

  if (item.minOccurrences) {
    const actual = countOccurrences(source, item.minOccurrences.text);
    if (actual < item.minOccurrences.count) {
      failures.push({
        path: item.path,
        missing: `${item.minOccurrences.text} x${item.minOccurrences.count}`,
        actual,
      });
    }
  }

  return {
    key: item.key,
    title: item.title,
    path: item.path,
    evidence: item.evidence,
    ok: failures.length === 0,
    failures,
  };
}

async function readText(path, failures) {
  try {
    await access(path);
    return await readFile(path, "utf8");
  } catch (error) {
    failures.push({ path, error: error.message });
    return "";
  }
}

function countOccurrences(content, text) {
  return content.split(text).length - 1;
}
