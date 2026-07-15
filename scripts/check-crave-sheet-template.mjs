import { readFile } from "node:fs/promises";

const source = await readFile("src/components/CraveSheet.jsx", "utf8");

const requiredExports = [
  "CraveStarterSheet",
  "CraveCollectingSheet",
  "CraveVoteSheet",
  "CraveSubmittedSheet",
  "CraveClosedSheet",
];

const requiredCopy = [
  'eyebrow="今晚征集单"',
  'statusLabel="待发送"',
  'statusLabel="免登录参与"',
  'statusLabel="已提交"',
  'statusLabel="已结束"',
  "分享征集单",
  "提交征集单",
  "回到 Humi 看今晚",
  "今晚定好了",
];

const failures = [];
for (const name of requiredExports) {
  if (!source.includes(`export function ${name}`)) {
    failures.push(`Missing ${name}.`);
  }
}

for (const copy of requiredCopy) {
  if (!source.includes(copy)) {
    failures.push(`Missing crave sheet copy: ${copy}`);
  }
}

const eyebrowCount = (source.match(/eyebrow="今晚征集单"/g) || []).length;
if (eyebrowCount < 5) {
  failures.push(`Expected at least 5 unified 今晚征集单 eyebrows, found ${eyebrowCount}.`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  states: requiredExports,
  unifiedEyebrowCount: eyebrowCount,
}, null, 2));
