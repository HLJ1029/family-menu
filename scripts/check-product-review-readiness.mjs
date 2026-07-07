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
    title: "完整菜品页仍是图片卡片浏览",
    path: "src/components/Library.jsx",
    required: ["发现新菜", "像刷菜谱卡片一样慢慢逛", "补进今晚"],
    evidence: "docs/humi-1.1-spec-acceptance-audit.md",
    evidenceRequired: ["发现/自己挑降为辅助页", "小红书式图片卡片", "补进今晚"],
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
    evidenceRequired: ["生产候选完善与内测验证", "不自动提交微信审核", "待候选复盘达标后用户确认"],
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
        "Product review anchors are covered. Continue with release:status, release:candidate:review, and release:closure; do not enter WeChat review until candidate validation passes and the user confirms.",
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
