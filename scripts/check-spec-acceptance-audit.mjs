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
  "完整菜品库保持【今晚】子页面导航关系",
  "【今晚菜单】加菜不降级为列表",
  "周计划降级为【今晚】辅助入口",
  "【今晚】首屏主角是晚饭推荐",
  "【今晚】首屏只有一个实心主操作",
  "早餐/午餐纳入数据但不抢晚饭主线",
  "清单汇总三餐食材",
  "库存完全隐形",
  "清单勾选反推后台已有",
  "忌口是硬约束",
  "用户唯一主动维护的是忌口",
  "营养分析是行为反馈层",
  "【我的家】从资料页升级为协作主场",
  "【我的家】协作内容先于账号设置",
  "协作动态沉淀认领",
  "主厨/家人角色边界",
  "一人多家可见切换",
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
  "历史感觉和做饭确认会反哺后续推荐",
  "推荐权益不可由客户端升级",
  "黑白灰调色板",
  "三类分享落地页游客烟测",
  "小程序分享路径覆盖",
  "小程序普通启动不被登录墙挡住",
  "发布材料去除旧",
];

const DECISION_LEDGER_IDS = ["REC-07", "REC-08", "REC-09", "PAY-01"];
const NATIVE_EVIDENCE_LEDGER_IDS = ["WX-04"];
const EXTERNAL_LEDGER_IDS = ["EXT-01", "EXT-02", "EXT-03"];
const EXPECTED_EXTERNAL_STATUSES = new Map([
  ["家庭订阅真实支付结算", "暂缓"],
  ["Plus 深度协调、完整版画像与一周计划打包", "暂缓"],
  ["三类小程序原生分享发送框视觉复核", "已完成"],
  ["生产 API 补部署", "已完成"],
  ["微信公众平台提交审核/发布", "暂缓"],
  ["10-20 个家庭灰度名单与反馈表", "模板已准备，待填真实名单"],
  ["生产真机全路径证据", "待小程序发布后验证"],
]);
const REQUIRED_LEDGER_IDS = [
  ...numberedIds("STR", 1, 8),
  ...numberedIds("MEAL", 1, 5),
  ...numberedIds("LIST", 1, 6),
  ...numberedIds("PROFILE", 1, 2),
  ...numberedIds("COL", 1, 10),
  "CRV-A1", "CRV-A2", "CRV-B1", "CRV-B2", "CRV-B3", "CRV-C1",
  "CRV-D1", "CRV-D2", "CRV-D3", "CRV-D4", "CRV-D5", "CRV-D6",
  "CRV-E1", "CRV-E2", "CRV-F1",
  ...numberedIds("REC", 1, 9),
  "PAY-01",
  ...numberedIds("WX", 1, 4),
  ...numberedIds("UI", 1, 7),
  ...EXTERNAL_LEDGER_IDS,
];
const LOCAL_IMPLEMENTATION_LEDGER_IDS = REQUIRED_LEDGER_IDS.filter((id) => (
  !DECISION_LEDGER_IDS.includes(id)
  && !NATIVE_EVIDENCE_LEDGER_IDS.includes(id)
  && !EXTERNAL_LEDGER_IDS.includes(id)
));

const sourceSpecs = await Promise.all(SOURCE_SPECS.map(inspectSourceSpec));
const audit = await inspectAudit();
const hardening = await inspectHardening();
const ledger = await inspectLedger();

const auditIntegrityOk = sourceSpecs.every((item) => item.ok) && audit.ok && hardening.ok && ledger.ok;
const localImplementationReady = auditIntegrityOk && ledger.localImplementationReady;
const specClosureReady = localImplementationReady
  && ledger.decisionScopeResolved
  && ledger.nativeShareReady
  && hardening.openP0P1.length === 0;
const ok = specClosureReady;

console.log(JSON.stringify({
  ok,
  auditIntegrityOk,
  localImplementationReady,
  specClosureReady,
  checkedAt: new Date().toISOString(),
  sourceSpecs,
  audit,
  hardening,
  ledger,
  nextActions: buildNextActions({ sourceSpecs, audit, hardening, ledger }),
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
    const unexpectedOpenRows = externalRows.filter((row) => (
      EXPECTED_EXTERNAL_STATUSES.get(row.item) !== row.status
    ));

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
  try {
    const content = await readFile(LEDGER_PATH, "utf8");
    const rows = parseLedgerRows(content);
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const missingIds = REQUIRED_LEDGER_IDS.filter((id) => !rowsById.has(id));
    const duplicateIds = rows
      .map((row) => row.id)
      .filter((id, index, ids) => ids.indexOf(id) !== index);
    const incompleteLocalRows = LOCAL_IMPLEMENTATION_LEDGER_IDS
      .map((id) => rowsById.get(id))
      .filter((row) => row && row.status !== "已完成");
    const invalidDecisionRows = DECISION_LEDGER_IDS
      .map((id) => rowsById.get(id))
      .filter((row) => row && !["待用户决策", "已完成", "明确列入 1.2"].includes(row.status));
    const invalidNativeRows = NATIVE_EVIDENCE_LEDGER_IDS
      .map((id) => rowsById.get(id))
      .filter((row) => row && !["进行中", "已完成"].includes(row.status));
    const invalidExternalRows = EXTERNAL_LEDGER_IDS
      .map((id) => rowsById.get(id))
      .filter((row) => row && row.status !== "待验收后外部动作");
    const openDecisionRows = DECISION_LEDGER_IDS
      .map((id) => rowsById.get(id))
      .filter((row) => row?.status === "待用户决策");
    const openNativeRows = NATIVE_EVIDENCE_LEDGER_IDS
      .map((id) => rowsById.get(id))
      .filter((row) => row?.status !== "已完成");
    const localImplementationReady = missingIds.length === 0 && incompleteLocalRows.length === 0;
    const decisionScopeResolved = missingIds.length === 0 && openDecisionRows.length === 0;
    const nativeShareReady = missingIds.length === 0 && openNativeRows.length === 0;
    return {
      path: LEDGER_PATH,
      ok: missingIds.length === 0
        && duplicateIds.length === 0
        && invalidDecisionRows.length === 0
        && invalidNativeRows.length === 0
        && invalidExternalRows.length === 0,
      requiredIds: REQUIRED_LEDGER_IDS.length,
      missingIds,
      duplicateIds,
      incompleteLocalRows,
      invalidDecisionRows,
      invalidNativeRows,
      invalidExternalRows,
      openDecisionRows,
      openNativeRows,
      localImplementationReady,
      decisionScopeResolved,
      nativeShareReady,
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
    "http://127.0.0.1:4174/",
    "核心菜单、家庭协作、三类分享、数据与安全检查",
    "未通过就继续修",
    "再单独确认是否部署 H5/API 与上传新的小程序候选",
    "灰度无 P0/P1",
    "用户动作当下确认",
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

function parseLedgerRows(content) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\| (?:STR|MEAL|LIST|PROFILE|COL|CRV|REC|PAY|WX|UI|EXT)-/.test(line))
    .map(parseTableRow)
    .filter((row) => row.cells.length >= 4)
    .map((row) => ({
      id: row.cells[0],
      requirement: row.cells[1],
      status: row.cells[2],
      evidence: row.cells[3],
    }));
}

function numberedIds(prefix, start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => `${prefix}-${String(start + index).padStart(2, "0")}`);
}

function sliceBetween(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  if (start < 0) return "";
  const end = content.indexOf(endMarker, start + startMarker.length);
  return end < 0 ? content.slice(start) : content.slice(start, end);
}

function buildNextActions({ sourceSpecs, audit, hardening, ledger }) {
  const actions = [];
  const missingSources = sourceSpecs.filter((item) => !item.ok);
  if (missingSources.length) actions.push(`Restore missing or empty source specs: ${missingSources.map((item) => item.path).join(", ")}.`);
  if (audit.missingSourceRefs?.length) actions.push(`Add missing source spec references to ${AUDIT_PATH}: ${audit.missingSourceRefs.join(", ")}.`);
  if (audit.missingMatrixItems?.length) actions.push(`Add missing acceptance rows: ${audit.missingMatrixItems.join(", ")}.`);
  if (audit.incompleteRows?.length) actions.push("Resolve incomplete rows in the spec acceptance matrix before claiming 1.1 scope is implemented.");
  if (audit.unexpectedOpenRows?.length) actions.push("Normalize section 3 to only known external/pre-review follow-ups.");
  if (ledger.missingIds?.length) actions.push(`Add missing requirement-ledger rows: ${ledger.missingIds.join(", ")}.`);
  if (ledger.incompleteLocalRows?.length) actions.push(`Finish local implementation rows: ${ledger.incompleteLocalRows.map((row) => row.id).join(", ")}.`);
  if (ledger.openDecisionRows?.length) actions.push(`Confirm or defer the open product/payment scope: ${ledger.openDecisionRows.map((row) => row.id).join(", ")}.`);
  if (ledger.openNativeRows?.length) actions.push(`Capture and verify current native WeChat evidence: ${ledger.openNativeRows.map((row) => row.id).join(", ")}.`);
  if (hardening.openP0P1?.length) actions.push("Continue P0/P1 hardening; this script validates the audit, while release:status blocks review until P0/P1 is complete.");
  if (!actions.length) actions.push("All spec rows, product decisions, and current-candidate native evidence are complete; keep deployment/upload/review deferred until the user accepts.");
  return actions;
}
