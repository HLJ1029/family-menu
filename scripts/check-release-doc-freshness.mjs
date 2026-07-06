import { readFile } from "node:fs/promises";

const checks = [
  {
    path: "docs/miniprogram-platform-submit-runbook.md",
    forbidden: [
      "当前仍处于提审前产品打磨阶段",
      "三张微信原生分享卡片截图证据补齐并完成 P1 后",
      "以 `npm run release:wechat:prepare-submit` 输出为准",
    ],
    required: [
      "真实候选复盘尚未通过",
      "npm run release:candidate:review",
      "release.candidateValidationReady",
      "真实候选复盘未通过时它必须失败",
    ],
  },
  {
    path: "docs/humi-1.1-closure-map.md",
    forbidden: [
      "H5 部署：GitHub Pages run `",
      "GitHub Pages run `28726626647` 成功",
      "GitHub Pages run `28726737462` 成功",
      "GitHub Pages run `28744383941` 成功",
      "最后再由用户确认是否进入微信公众平台审核",
    ],
    required: [
      "真实候选复盘达标后",
      "release.candidateValidationReady",
      "npm run release:candidate:review",
      "待候选复盘达标后用户确认",
    ],
  },
  {
    path: "docs/humi-1.1-release-operator-handoff.md",
    forbidden: [
      "当前已知最新 GitHub Pages run `",
      "当前已知最新 GitHub Pages run `28726626647`",
      "当前已知最新 GitHub Pages run `28726737462`",
      "当前已知最新 GitHub Pages run `28744383941`",
      "重新运行 `npm run release:wechat:prepare-submit`",
    ],
    required: [
      "release.candidateValidationReady=false",
      "npm run release:candidate:review",
      "候选复盘达标前",
      "不能把微信审核准备视为可执行",
    ],
  },
  {
    path: "docs/humi-1.1-release-evidence-log.md",
    forbidden: [
      "| GitHub Pages run | `",
      "| GitHub Pages run | `28726626647` / success / 1.1.59 H5 已部署 |",
      "| GitHub Pages run | `28726737462` / success / 1.1.59 H5 已部署 |",
      "| GitHub Pages run | `28744383941` / success / 1.1.59 H5 已部署 |",
      "工程侧已可准备提交微信审核",
    ],
  },
  {
    path: "docs/humi-1.1-pre-review-hardening.md",
    forbidden: [
      "确认当前处于等待用户确认的微信审核准备",
    ],
    required: [
      "release.candidateValidationReady=true",
      "npm run release:candidate:review",
      "候选复盘达标后",
    ],
  },
  {
    path: "docs/miniprogram-launch-readiness.md",
    forbidden: [
      "状态停在用户确认是否进入微信公众平台审核",
      "后续由用户确认后再进入微信公众平台审核",
    ],
    required: [
      "release.candidateValidationReady=false",
      "候选复盘达标后",
      "npm run release:candidate:review",
    ],
  },
];

const failures = [];

for (const check of checks) {
  const content = await readFile(check.path, "utf8");
  for (const phrase of check.forbidden) {
    if (content.includes(phrase)) {
      failures.push({ path: check.path, phrase });
    }
  }
  for (const phrase of check.required ?? []) {
    if (!content.includes(phrase)) {
      failures.push({ path: check.path, phrase: `missing ${phrase}` });
    }
  }
}

const releaseMap = await readFile("scripts/print-release-map.mjs", "utf8");
if (!releaseMap.includes("release:product:review")) {
  failures.push({
    path: "scripts/print-release-map.mjs",
    phrase: "missing release:product:review in release map review commands",
  });
}
if (!releaseMap.includes("release:candidate:check")) {
  failures.push({
    path: "scripts/print-release-map.mjs",
    phrase: "missing release:candidate:check in release map review commands",
  });
}

const releaseNext = await readFile("scripts/print-release-next-action.mjs", "utf8");
if (!releaseNext.includes("release:candidate:check")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:check in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:prepare")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:prepare in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:review")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:review in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:review:selftest")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:review:selftest in candidate-stage action card",
  });
}

const releaseStatus = await readFile("scripts/check-release-status.mjs", "utf8");
if (!releaseStatus.includes("candidateHardeningReady")) {
  failures.push({
    path: "scripts/check-release-status.mjs",
    phrase: "missing candidateHardeningReady in release status",
  });
}
if (!releaseStatus.includes("candidateReviewSelftestReady")) {
  failures.push({
    path: "scripts/check-release-status.mjs",
    phrase: "missing candidateReviewSelftestReady in release status",
  });
}
if (!releaseStatus.includes("candidateValidationReady")) {
  failures.push({
    path: "scripts/check-release-status.mjs",
    phrase: "missing candidateValidationReady in release status",
  });
}
if (!releaseStatus.includes("release:candidate:review")) {
  failures.push({
    path: "scripts/check-release-status.mjs",
    phrase: "missing real release:candidate:review in release status",
  });
}

const evidenceCommands = await readFile("scripts/print-release-evidence-commands.mjs", "utf8");
for (const command of ["release:next", "release:closure", "release:evidence:check", "release:status"]) {
  if (!evidenceCommands.includes(command)) {
    failures.push({
      path: "scripts/print-release-evidence-commands.mjs",
      phrase: `missing ${command} in post-evidence checks`,
    });
  }
}

const result = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  scope: [
    ...checks.map((check) => check.path),
    "scripts/print-release-map.mjs",
    "scripts/print-release-next-action.mjs",
    "scripts/check-release-status.mjs",
    "scripts/print-release-evidence-commands.mjs",
  ],
  failures,
};

console.log(JSON.stringify(result, null, 2));

if (!result.ok) process.exit(1);
