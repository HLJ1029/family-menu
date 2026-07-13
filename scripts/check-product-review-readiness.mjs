import { access, readFile } from "node:fs/promises";

const REQUIRED_CHECKS = [
  {
    key: "dish-discovery",
    title: "今晚菜单发现新菜入口",
    path: "src/components/TodayMenu.jsx",
    required: ["发现新菜", "补进今晚", "再加一份", "onOpenLibraryDiscovery", "openFullLibrary"],
    evidence: "docs/humi-1.1-pre-review-hardening.md",
    evidenceRequired: ["自己挑/今晚菜单选菜", "小红书式图片卡片", "发现新菜", "完整菜品页"],
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
    evidenceRequired: ["crave-members-default-selected", "crave-create-keeps-selected-members"],
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
    evidenceRequired: ["免登录参与", "不用先做设置", "一家人的饭放在一起", "auth/wechat/login"],
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
    evidenceRequired: ["family-activity-shows-grocery-claim", "family-activity-shows-dinner-confirmation", "family-activity-shows-want-item", "family-activity-precedes-account-settings", "crave-starter-is-collapsed-until-requested"],
  },
  {
    key: "crave-state-persistence",
    title: "征集单跨会话保存与超时收口",
    path: "api/server.js",
    required: ["craveSignals: sanitizeList", "sanitizeCraveSignal", "getOptionalAuth", "auth?.userId"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["persisted-crave-auto-generates-after-deadline", "no-reply-crave-keeps-initiator-feeling", "persisted-crave-closes-with-owner-session"],
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
    evidenceRequired: ["tonight-primary-action-is-in-first-viewport", "breakfast-and-lunch-follow-dinner-decision", "tonight-do-writes-menu-and-dinner-plan", "tonight-do-auto-generates-grocery"],
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
    evidenceRequired: ["www.humi-home.com", "全部菜品库", "查看征集单", "breakfast-does-not-default-to-seaweed-soup", "grocery-share-opens-native-share-page", "crave-share-opens-native-share-page"],
  },
  {
    key: "native-share-cards",
    title: "小程序三类原生分享卡片证据",
    path: "docs/humi-1.1-miniprogram-share-card-qa.md",
    required: ["crave-card.png", "invite-card.png", "grocery-card.png", "token", "免登录"],
    evidence: "docs/humi-1.1-release-evidence-log.md",
    evidenceRequired: ["release:wechat:share:evidence", "crave", "invite", "grocery"],
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
