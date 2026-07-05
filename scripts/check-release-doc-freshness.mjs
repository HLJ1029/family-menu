import { readFile } from "node:fs/promises";

const checks = [
  {
    path: "docs/miniprogram-platform-submit-runbook.md",
    forbidden: [
      "当前仍处于提审前产品打磨阶段",
      "三张微信原生分享卡片截图证据补齐并完成 P1 后",
      "以 `npm run release:wechat:prepare-submit` 输出为准",
    ],
  },
  {
    path: "docs/humi-1.1-closure-map.md",
    forbidden: [
      "H5 部署：GitHub Pages run `",
      "GitHub Pages run `28726626647` 成功",
      "GitHub Pages run `28726737462` 成功",
      "GitHub Pages run `28744383941` 成功",
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
];

const failures = [];

for (const check of checks) {
  const content = await readFile(check.path, "utf8");
  for (const phrase of check.forbidden) {
    if (content.includes(phrase)) {
      failures.push({ path: check.path, phrase });
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

const result = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  scope: [...checks.map((check) => check.path), "scripts/print-release-map.mjs"],
  failures,
};

console.log(JSON.stringify(result, null, 2));

if (!result.ok) process.exit(1);
