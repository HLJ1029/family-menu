import { access, readFile } from "node:fs/promises";

const REQUIRED_CHECKS = [
  {
    key: "dashboard-secondary-entrypoints",
    title: "今晚首屏可发现完整菜品库与我的家",
    path: "src/components/Dashboard.jsx",
    required: ["dashboard-library-entry", "dashboard-library-entry-label", "全部菜品库", "onOpenRecipeLibrary", "tonight-primary-action"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["dashboard-self-pick-opens-full-library", "dashboard-library-entry-label-stays-on-one-line", "dashboard-avatar-opens-my-home"],
  },
  {
    key: "auxiliary-child-navigation",
    title: "辅助页保留五主 tab 和明确父级关系",
    path: "src/components/AppShell.jsx",
    required: ["getPrimaryNavId", "mobile-primary-navigation", "grid-cols-5", "aria-current", "label=\"打开我的家\""],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: [
      "library-child-page-keeps-five-primary-tabs",
      "library-child-page-belongs-to-discovery-tab",
      "library-child-page-primary-tabs-are-visible-and-equal",
      "library-child-page-back-returns-tonight",
      "discovery-primary-tab-opens-full-library",
      "child-page-avatar-opens-my-home",
    ],
  },
  {
    key: "dish-discovery",
    title: "今晚菜单发现新菜入口",
    path: "src/components/Library.jsx",
    required: ["全部菜品库", "未安排的新菜", "RecipeQuantityControl", "onAdd", "recipe-card"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["library-dish-adds-to-tonight-menu", "library-dish-adds-to-dinner-plan", "青椒土豆丝"],
  },
  {
    key: "library-card-browsing",
    title: "完整菜品库与已安排菜置顶",
    path: "src/components/Library.jsx",
    required: ["selected-recipes-panel", "今晚已安排", "未安排的新菜", "allRecipes", "recipeSource.length"],
    evidence: "docs/humi-1.1-spec-acceptance-audit.md",
    evidenceRequired: ["推荐外提供完整菜品库子页面", "138 道菜", "已安排菜置顶"],
  },
  {
    key: "dashboard-crave-entrypoint",
    title: "主厨从今晚首屏发起征集，不把征集器塞回我的家",
    path: "src/components/Dashboard.jsx",
    required: ["问问大家想吃啥", "CraveAudiencePicker", "onStartCraveRequest", "分享征集单"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["dashboard-crave-owner-creation-opens-recipient-picker", "dashboard-crave-share-opens-native-share-page", "dashboard-crave-retry-share-action-is-visible", "owner-collaboration-native-share-actions-dispatch-once"],
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
    path: "src/components/Dashboard.jsx",
    required: ["CraveAudiencePicker", "selectedCraveAudience", "onChange={setSelectedCraveAudience}", "onStartCraveRequest"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["dashboard-crave-recipients-default-selected", "dashboard-crave-create-keeps-selected-members"],
  },
  {
    key: "solo-owner-crave-fallback",
    title: "没有家人时主厨仍可直接出菜单和清单",
    path: "src/components/CraveSheet.jsx",
    required: ["还没有家人加入也没关系", "我自己做主", "生成征集卡片"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["solo-owner-can-decide-without-family", "solo-owner-flow-generates-menu-and-grocery"],
  },
  {
    key: "multi-household-ui",
    title: "一个用户可在家庭设置中切换独立家庭数据",
    path: "src/components/HouseholdSettingsPage.jsx",
    required: ["household-settings-page", "household-switcher", "onSwitchHousehold"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["multi-household-switches-from-household-settings", "multi-household-page-errors"],
  },
  {
    key: "family-account-data-truth",
    title: "家庭成员头像与账号绑定状态如实显示",
    path: "src/components/HumiAccountPage.jsx",
    required: ["avatarUrl", "phoneVerified", "phoneMasked", "未绑定", "privacy.html", "terms.html"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["humi-account-exposes-mobile-account-basics", "humi-account-renders-truthful-profile-data", "household-members-render-member-avatars"],
  },
  {
    key: "household-lifecycle-state-preservation",
    title: "仅返回家庭元数据的生命周期操作不会清空当前家庭数据",
    path: "src/main.jsx",
    required: ["preserveStateWhenMissing", "applyHumiStateEnvelope(data, { preserveStateWhenMissing: true })", "removeCurrentHouseholdMember", "transferHumiHouseholdOwner", "setHouseholdMembers((current)", "avatarUrl: member.avatarUrl || \"\""],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["household-lifecycle-metadata-preserves-current-state", "household-lifecycle-remove-and-transfer-refresh-members"],
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
    title: "协作分享落地页免登录参与",
    path: "package.json",
    required: ["release:collaboration:smoke"],
    evidence: "scripts/smoke-collaboration-landings.mjs",
    evidenceRequired: ["不用登录，不用想菜名，点一个感觉就行", "不用登录。先选你方便买的", "一家人的饭放在一起", "wish-posted-without-login", "auth/wechat/login"],
  },
  {
    key: "inventory-is-behavior-not-a-page",
    title: "食材库存只在自然动作中反推",
    path: "src/components/GroceryList.jsx",
    required: ["这次不用买", "ShoppingChecklist", "onGroceryItemChecked"],
    forbidden: ["库存管理"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["inventory-maintenance-is-not-exposed", "grocery-check-adds-hidden-pantry-clue", "dinner-confirmation-consumes-hidden-pantry-clue", "nutrition-entry-is-not-on-grocery-tab"],
  },
  {
    key: "family-living-room-focus",
    title: "我的家只显示当前家庭、有限协作和下一步",
    path: "src/components/FamilyLivingRoom.jsx",
    required: ["data-testid=\"family-living-room\"", "正在一起做", "家庭偏好", "activeCollaborations.slice(0, 3)", "current-family-role", "current-family-member-avatars", "current-family-member-count", "family-preference-action", "onRefreshWishShare", "onPlanWish", "今晚做"],
    forbidden: ["CloudSyncPanel", "营养目标", "验证数据"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["family-living-room-has-four-focused-sections", "family-living-room-removes-cloud-ai-nutrition-and-export-clutter", "signed-in-no-household-does-not-fabricate-family", "family-living-room-shows-current-role", "family-living-room-shows-member-avatars-and-count", "family-preference-opens-household-settings", "living-room-wish-collaboration-has-refresh-action", "living-room-collected-wish-has-plan-action", "living-room-wish-plan-enters-tonight-and-leaves-pool"],
  },
  {
    key: "family-living-room-wish-and-preference-wiring",
    title: "家庭客厅转发真实 Wish 动作并完整概括家庭偏好",
    path: "src/components/UserCenter.jsx",
    required: ["wishPool = []", "onRefreshWishShare", "onPlanWish", "formalMembers.length", "familySize", "tastePreferences", "dislikes", "allergies"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["family-preference-summary-covers-size-tastes-and-restrictions", "2 位家人 · 主要口味：家常、清淡 · 忌口：香菜、花生", "living-room-wish-collaboration-has-refresh-action", "living-room-collected-wish-has-plan-action"],
  },
  {
    key: "household-name-and-route-integrity",
    title: "建家名称三层校验且家庭身份变化同步回到客厅",
    path: "src/components/UserCenter.jsx",
    required: ["familyRoute", "family?.id"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["household-name-draft-defaults-to-we-family", "household-name-blank-is-rejected-locally-and-preserved", "family-identity-change-resets-internal-route-before-paint"],
  },
  {
    key: "household-lifecycle-deep-preservation-and-privacy",
    title: "家庭元数据变更保留餐次与协作且动态页不泄露内部字段",
    path: "scripts/smoke-product-entrypoints.mjs",
    required: ["household-lifecycle-preserves-meal-logs-and-collaboration-state", "family-activity-hides-secrets-and-internal-fields", "DO_NOT_RENDER_OWNER_SECRET", "DO_NOT_RENDER_PARTICIPANT_KEY"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["preserved-meal-log", "preserved-crave-signal", "privacy-active-grocery", "activityPrivacySafe"],
  },
  {
    key: "collaboration-claim-language",
    title: "通用协作认领只描述参与绑定，不暗示加入家庭",
    path: "api/server.js",
    required: ["缺少临时参与身份，暂时不能绑定这次参与。"],
    forbidden: ["缺少临时参与身份，暂时不能加入这个家。"],
    evidence: "scripts/smoke-humi-api.mjs",
    evidenceRequired: ["generic crave claim", "generic grocery claim", "generic wish claim"],
  },
  {
    key: "durable-collaboration-smoke-evidence",
    title: "协作落地 smoke 默认写入私有持久证据目录",
    path: "scripts/smoke-collaboration-landings.mjs",
    required: ["/Users/honglijie/.humi-release-evidence", "collaboration-landings-smoke-", "mode: 0o700"],
    forbidden: ["/tmp/humi-collaboration-smoke"],
    evidence: "scripts/smoke-collaboration-landings.mjs",
    evidenceRequired: ["manifest.json", "evidenceDir"],
  },
  {
    key: "legacy-collaboration-flow-household-bootstrap",
    title: "旧协作全链路 smoke 在发起协作前显式创建家庭",
    path: "scripts/smoke-collaboration-flow.mjs",
    required: ["createSmokeOwnerHousehold", "householdName: \"测试家\""],
    evidence: "scripts/smoke-collaboration-flow.mjs",
    evidenceRequired: ["/households", "crave request should create a share token"],
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
    required: ["tonight-primary-action", "meal-rhythm-panel", "PrimaryDinnerActions"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["tonight-primary-action-is-in-first-viewport", "tonight-hero-has-one-solid-primary-action", "tonight-hero-has-context-scene-illustration", "breakfast-and-lunch-follow-dinner-decision", "tonight-do-writes-menu-and-dinner-plan", "tonight-do-auto-generates-grocery"],
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
    title: "计划保留为当前 UI 的独立主入口",
    path: "src/components/AppShell.jsx",
    required: ["mobile-primary-navigation", "grid-cols-5", "mobile-nav-${item.id}"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["dashboard-planner-entry-opens-week-plan", "planner-primary-tab-opens-week-plan", "week-plan-shows-grocery-summary-action", "week-plan-grocery-summary-opens-shared-list"],
  },
  {
    key: "hard-constraint-only-profile-input",
    title: "用户只主动维护忌口，不填写软口味表",
    path: "src/components/ProfileOnboarding.jsx",
    required: ["先确认家里不能吃的", "喜欢什么不用填", "开始使用 Humi"],
    forbidden: ["planningModes", "profileOptions.goals", "这次主要想规划什么", "晚饭目标"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: [
      "signed-in-onboarding-only-asks-hard-constraints",
      "signed-in-onboarding-can-skip-without-diet-tags",
      "signed-in-onboarding-saves-diet-constraint",
    ],
  },
  {
    key: "owner-managed-family-constraints",
    title: "家人只读家庭忌口，主厨在家庭设置中维护",
    path: "src/components/HouseholdSettingsPage.jsx",
    required: ["family-constraints-editor", "主厨统一维护", "canManageHousehold"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["household-settings-owner-manages-family-constraints", "household-settings-owner-must-transfer-before-leaving", "member-sees-readonly-family-constraints"],
  },
  {
    key: "nutrition-feedback-layer",
    title: "营养回看从独立入口进入，不混入家庭客厅",
    path: "src/components/StatsPage.jsx",
    required: ["nutrition-reflection-page", "营养回看", "buildMealInsights"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["nutrition-reflection-is-available-in-current-ui"],
  },
  {
    key: "member-library-participation",
    title: "家人发现菜品后记到最近想吃而非改菜单",
    path: "src/components/Library.jsx",
    required: ["canManageHousehold", "记到最近想吃", "draggable={canManageHousehold}"],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: ["member-library-contributes-to-want-pool"],
  },
  {
    key: "learned-taste-feeds-recommendation",
    title: "历史感觉与确认做饭反哺推荐",
    path: "src/main.jsx",
    required: ["collectLearnedCraveVotes", "craveVotes: learnedCraveVotes"],
    evidence: "scripts/check-recommendation-constraints.mjs",
    evidenceRequired: ["mealHistorySampleCount", "确认做过的菜应沉淀为类型偏好"],
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
    evidenceRequired: [
      "www.humi-home.com",
      "full-library-title",
      "full-library-card-count",
      "signed-in-no-household-shows-explicit-start",
      "family-living-room-has-four-focused-sections",
      "family-management-pages-open-from-living-room",
      "family-management-pages-return-to-living-room",
      "family-management-child-pages-keep-five-primary-tabs",
      "household-members-shows-owner-controls",
      "household-settings-owner-manages-family-constraints",
      "humi-account-exposes-mobile-account-basics",
      "multi-household-switches-from-household-settings",
      "member-cannot-manage-household-members",
      "member-cannot-invite-family-wishes",
      "nutrition-reflection-is-available-in-current-ui",
      "breakfast-does-not-default-to-seaweed-soup",
      "lunch-home-saves-user-picked-dish",
      "lunch-does-not-default-to-seaweed-soup",
      "grocery-share-opens-native-share-page",
      "dashboard-crave-owner-creation-opens-recipient-picker",
      "dashboard-crave-recipients-default-selected",
      "dashboard-crave-create-keeps-selected-members",
      "dashboard-crave-share-opens-native-share-page",
      "dashboard-crave-retry-share-action-is-visible",
      "menu-share-opens-native-share-page",
      "invite-share-opens-native-share-page",
      "living-room-wish-share-creates-current-household-request",
      "living-room-wish-share-opens-native-share-page",
      "living-room-wish-collaboration-has-refresh-action",
      "living-room-collected-wish-has-plan-action",
      "living-room-wish-plan-enters-tonight-and-leaves-pool",
      "family-preference-summary-covers-size-tastes-and-restrictions",
      "owner-collaboration-native-share-actions-dispatch-once",
      "menu-poster-opens-native-image-share-page",
      "grocery-poster-opens-native-album-save-page",
      "poster-uploads-stay-under-api-limit",
    ],
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
    key: "native-share-navigation-is-truthful",
    title: "小程序分享使用单次原生子页面跳转",
    path: "src/lib/runtime.js",
    required: [
      "\"redirectTo\"",
      "\"navigateTo\"",
      "\"visibilitychange\"",
      "\"pagehide\"",
      "finish(\"unavailable\")",
      "buildMiniProgramShareUrl",
    ],
    evidence: "scripts/validate-mini-share-runtime.mjs",
    evidenceRequired: [
      "explicitFailureFallback",
      "redirectTo should only run after navigateTo explicitly fails",
      "\"handoff\"",
      "redirectTo",
      "navigateTo",
    ],
  },
  {
    key: "poster-entrypoints-stay-visible",
    title: "小程序卡片分享与菜单清单海报入口并存",
    path: "src/main.jsx",
    required: [
      "onCreatePoster={createTodayMenuPosterPreview}",
      "onCreatePoster={createGroceryListPoster}",
      "createTodayMenuPoster",
      "createGroceryPoster",
      "requestMiniProgramPoster",
      "uploadPosterShare",
    ],
    evidence: "scripts/smoke-product-entrypoints.mjs",
    evidenceRequired: [
      "today-menu-poster-entry-is-visible",
      "grocery-poster-entry-is-visible",
      "poster-preview-generates-image",
      "menu-poster-opens-native-image-share-page",
      "grocery-poster-opens-native-album-save-page",
      "poster-uploads-stay-under-api-limit",
    ],
  },
  {
    key: "native-poster-actions-are-real",
    title: "小程序海报页真正调起图片分享与相册保存",
    path: "miniprogram/pages/poster/index.js",
    required: ["wx.showShareImageMenu", "wx.saveImageToPhotosAlbum", "wx.downloadFile", "wx.openSetting"],
    evidence: "scripts/check-miniprogram-poster-share.mjs",
    evidenceRequired: ["showShareImageMenu", "saveImageToPhotosAlbum", "downloadFile", "savePosterImage"],
  },
  {
    key: "review-confirmation-gate",
    title: "微信审核动作必须显式确认",
    path: "scripts/prepare-wechat-submit-workspace.mjs",
    required: ["HUMI_WECHAT_REVIEW_ACTION_CONFIRMED", "Humi 1.1 微信提审工作台未打开"],
    evidence: "docs/humi-1.1-closure-map.md",
    evidenceRequired: ["先完成产品功能与真机配置，再谈审核", "不要自动提交审核", "再讨论候选内测与审核"],
  },
];

const checks = [];

for (const item of REQUIRED_CHECKS) {
  checks.push(await runCheck(item));
}

const ok = checks.every((item) => item.ok !== false);
const result = {
  ok,
  checkedAt: new Date().toISOString(),
  scope: checks.map(({ key, title, path, evidence, deferred, ok }) => ({ key, title, path, evidence, deferred, ok })),
  deferred: checks.filter((item) => item.deferred).map(({ key, title, deferred }) => ({ key, title, ...deferred })),
  failures: checks.flatMap((item) => item.failures.map((failure) => ({
    key: item.key,
    title: item.title,
    ...failure,
  }))),
  nextActions: ok
    ? [
        "Current product anchors are covered. Deferred items are explicit follow-ups, not certified behavior; follow the current closure map without entering WeChat review.",
      ]
    : [
        "Fix the failed product review anchors before treating 1.1 as ready for final pre-review confirmation.",
      ],
};

console.log(JSON.stringify(result, null, 2));
if (!ok) process.exit(1);

async function runCheck(item) {
  if (item.deferred) {
    return {
      key: item.key,
      title: item.title,
      deferred: item.deferred,
      ok: null,
      failures: [],
    };
  }

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
