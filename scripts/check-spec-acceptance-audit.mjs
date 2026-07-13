import { access, readFile } from "node:fs/promises";

const SOURCE_SPECS = [
  "/Users/honglijie/Downloads/humi 家庭协作 spec.md",
  "/Users/honglijie/Downloads/humi 感觉征集 spec.md",
  "/Users/honglijie/Downloads/humi 结构重构 spec.md",
];

const AUDIT_PATH = "docs/humi-1.1-spec-acceptance-audit.md";
const HARDENING_PATH = "docs/humi-1.1-pre-review-hardening.md";
const LEDGER_PATH = "docs/humi-1.1-requirement-ledger.md";

const REQUIRED_MATRIX_ITEMS = [
  "三 tab 定版",
  "发现/自己挑降为辅助页",
  "【今晚菜单】加菜不降级为列表",
  "周计划降级为【今晚】辅助入口",
  "【今晚】首屏主角是晚饭推荐",
  "早餐/午餐纳入数据但不抢晚饭主线",
  "清单汇总三餐食材",
  "库存完全隐形",
  "清单勾选反推后台已有",
  "忌口是硬约束",
  "【我的家】从资料页升级为协作主场",
  "协作动态沉淀认领",
  "主厨/家人角色边界",
  "征集发起先选择家庭成员",
  "成员只能写自己的参与数据",
  "家人打开分享卡片先免登录参与",
  "家人点完感觉后再引导加入家庭",
  "感觉标签控制在低思考范围",
  "主厨可“我自己做主”",
  "等待态可手动出菜单",
  "征集状态跨会话恢复",
  "家人选填备注默认折叠",
  "征集结果可勾选收敛",
  "每道菜展示“为什么推它”",
  "晚间轻确认包含“不记录”",
  "买菜认领可回传",
  "想吃池子可由家人/主厨沉淀",
  "精准推荐走成本闸门",
  "精准推荐缓存复用",
  "推荐参考本家最近饮食",
  "推荐权益不可由客户端升级",
  "黑白灰调色板",
  "三类分享落地页游客烟测",
  "小程序分享路径覆盖",
  "小程序普通启动不被登录墙挡住",
  "发布材料去除旧",
];

const sourceSpecs = await Promise.all(SOURCE_SPECS.map(inspectSourceSpec));
const audit = await inspectAudit();
const hardening = await inspectHardening();
const ledger = await inspectLedger();

const ok = sourceSpecs.every((item) => item.ok) && audit.ok && hardening.ok && ledger.ok;

console.log(JSON.stringify({
  ok,
  checkedAt: new Date().toISOString(),
  sourceSpecs,
  audit,
  hardening,
  ledger,
  nextActions: buildNextActions({ sourceSpecs, audit, hardening }),
}, null, 2));

if (!ok) process.exit(1);

async function inspectSourceSpec(path) {
  try {
    await access(path);
    const content = await readFile(path, "utf8");
    return {
      path,
      ok: content.trim().length > 0,
      bytes: Buffer.byteLength(content),
      error: content.trim().length > 0 ? undefined : "Source spec is empty.",
    };
  } catch (error) {
    return { path, ok: false, error: error.message };
  }
}

async function inspectAudit() {
  try {
    const content = await readFile(AUDIT_PATH, "utf8");
    const missingSourceRefs = SOURCE_SPECS.filter((path) => !content.includes(path));
    const matrixRows = parseMatrixRows(content);
    const incompleteRows = matrixRows.filter((row) => row.status !== "已完成");
    const missingMatrixItems = REQUIRED_MATRIX_ITEMS.filter((label) => !matrixRows.some((row) => row.requirement.includes(label)));
    const externalRows = parseExternalRows(content);
    const currentOrder = inspectCurrentOrder(content);
    const unexpectedOpenRows = externalRows.filter((row) => {
      if (row.item === "生产 API 补部署") return row.status !== "已完成";
      return !["进行中", "暂缓", "待用户确认", "模板已准备，待填真实名单", "待小程序发布后验证"].includes(row.status);
    });

    return {
      path: AUDIT_PATH,
      ok: missingSourceRefs.length === 0
        && matrixRows.length >= REQUIRED_MATRIX_ITEMS.length
        && incompleteRows.length === 0
        && missingMatrixItems.length === 0
        && unexpectedOpenRows.length === 0
        && currentOrder.ok,
      matrixRows: matrixRows.length,
      completedMatrixRows: matrixRows.filter((row) => row.status === "已完成").length,
      missingSourceRefs,
      incompleteRows,
      missingMatrixItems,
      externalRows,
      unexpectedOpenRows,
      currentOrder,
    };
  } catch (error) {
    return {
      path: AUDIT_PATH,
      ok: false,
      error: error.message,
    };
  }
}

async function inspectHardening() {
  try {
    const content = await readFile(HARDENING_PATH, "utf8");
    const openP0P1 = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^- \[ \] P[01]\b/.test(line));
    return {
      path: HARDENING_PATH,
      ok: true,
      openP0P1,
      preReviewGateActive: content.includes("暂不提交审核") && content.includes("提审前产品打磨"),
      warning: openP0P1.length ? "P0/P1 hardening is still open; release:status remains responsible for blocking WeChat review." : undefined,
    };
  } catch (error) {
    return {
      path: HARDENING_PATH,
      ok: false,
      error: error.message,
    };
  }
}

async function inspectLedger() {
  const requiredIds = [
    "STR-01", "STR-07", "MEAL-01", "MEAL-05", "LIST-01", "LIST-06",
    "COL-01", "COL-10", "CRV-A1", "CRV-B3", "CRV-D2", "CRV-D5", "CRV-F1",
    "REC-01", "REC-05", "PAY-01", "WX-01", "UI-04", "EXT-01", "EXT-03",
  ];
  try {
    const content = await readFile(LEDGER_PATH, "utf8");
    const missingIds = requiredIds.filter((id) => !content.includes(`| ${id} |`));
    const paymentDecisionOpen = content.includes("| PAY-01 |") && content.includes("待用户决策");
    const externalActionsDeferred = ["EXT-01", "EXT-02", "EXT-03"].every((id) => (
      content.includes(`| ${id} |`) && content.includes("待验收后外部动作")
    ));
    return {
      path: LEDGER_PATH,
      ok: missingIds.length === 0 && paymentDecisionOpen && externalActionsDeferred && !content.includes("| 未完成 |"),
      requiredIds: requiredIds.length,
      missingIds,
      paymentDecisionOpen,
      externalActionsDeferred,
    };
  } catch (error) {
    return { path: LEDGER_PATH, ok: false, error: error.message };
  }
}

function parseMatrixRows(content) {
  const section = sliceBetween(content, "## 2. 验收矩阵", "## 3.");
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !line.includes("---") && !line.includes("规格要求"))
    .map(parseTableRow)
    .filter((row) => row.cells.length >= 3)
    .map((row) => ({
      requirement: row.cells[0],
      status: row.cells[1],
      evidence: row.cells[2],
    }));
}

function parseExternalRows(content) {
  const section = sliceBetween(content, "## 3. 仍未完成或仍需外部确认", "## 4.");
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !line.includes("---") && !line.includes("项目"))
    .map(parseTableRow)
    .filter((row) => row.cells.length >= 3)
    .map((row) => ({
      item: row.cells[0],
      status: row.cells[1],
      nextStep: row.cells[2],
    }));
}

function inspectCurrentOrder(content) {
  const section = sliceBetween(content, "## 4. 当前建议顺序", "## 5.");
  const required = [
    "1.1 生产候选完善与内测验证",
    "release:product:review",
    "release:candidate:check",
    "release:candidate:prepare",
    "release:candidate:review",
    "10 个真实体验",
    "8 个完成【今晚】菜单",
    "8 个完成清单",
    "3 个尝试协作",
    "无 P0/P1",
    "动作当下明确确认",
  ];
  const missing = required.filter((text) => !section.includes(text));
  return {
    ok: missing.length === 0,
    missing,
  };
}

function parseTableRow(line) {
  return {
    cells: line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim()),
  };
}

function sliceBetween(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  if (start < 0) return "";
  const end = content.indexOf(endMarker, start + startMarker.length);
  return end < 0 ? content.slice(start) : content.slice(start, end);
}

function buildNextActions({ sourceSpecs, audit, hardening }) {
  const actions = [];
  const missingSources = sourceSpecs.filter((item) => !item.ok);
  if (missingSources.length) actions.push(`Restore missing or empty source specs: ${missingSources.map((item) => item.path).join(", ")}.`);
  if (audit.missingSourceRefs?.length) actions.push(`Add missing source spec references to ${AUDIT_PATH}: ${audit.missingSourceRefs.join(", ")}.`);
  if (audit.missingMatrixItems?.length) actions.push(`Add missing acceptance rows: ${audit.missingMatrixItems.join(", ")}.`);
  if (audit.incompleteRows?.length) actions.push("Resolve incomplete rows in the spec acceptance matrix before claiming 1.1 scope is implemented.");
  if (audit.unexpectedOpenRows?.length) actions.push("Normalize section 3 to only known external/pre-review follow-ups.");
  if (hardening.openP0P1?.length) actions.push("Continue P0/P1 hardening; this script validates the audit, while release:status blocks review until P0/P1 is complete.");
  if (!actions.length) actions.push("Spec acceptance audit is covered; continue with release:status and pre-review evidence gates.");
  return actions;
}
