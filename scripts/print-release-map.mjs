import { readFile } from "node:fs/promises";

const mapPath = "docs/humi-1.1-closure-map.md";
const content = await readFile(mapPath, "utf8");

const sections = [
  "## 当前一句话",
  "## 当前停点",
  "## 完整上线还差什么",
  "## 不再重复做",
];

const lines = [];
lines.push("Humi 1.1 收口地图");
lines.push("");
lines.push(`来源：${mapPath}`);
lines.push("");

for (const section of sections) {
  const body = getSection(content, section);
  if (body) {
    lines.push(section.replace(/^## /, ""));
    lines.push(body.trim());
    lines.push("");
  }
}

lines.push("复核命令");
lines.push("- npm run release:next");
lines.push("- npm run release:product:review");
lines.push("- npm run release:candidate:check");
lines.push("- npm run release:candidate:prepare");
lines.push("- npm run release:candidate:doctor");
lines.push("- npm run release:candidate:plan");
lines.push("- npm run release:candidate:plan:selftest");
lines.push("- npm run release:candidate:review");
lines.push("- npm run release:closure");
lines.push("- npm run release:wechat:check");
lines.push("");
lines.push("注意：本命令只读，不打开微信后台，不提交审核，不发布。");

console.log(lines.join("\n"));

function getSection(markdown, heading) {
  const start = markdown.indexOf(heading);
  if (start < 0) return "";
  const afterHeading = markdown.indexOf("\n", start);
  if (afterHeading < 0) return "";
  const nextHeading = markdown.indexOf("\n## ", afterHeading + 1);
  return markdown.slice(afterHeading + 1, nextHeading < 0 ? undefined : nextHeading);
}
