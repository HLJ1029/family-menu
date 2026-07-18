import { createHash } from "node:crypto";
import net from "node:net";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";

const DEFAULT_PRIVATE_DIR = "/Users/honglijie/.humi-release-evidence";
const EVIDENCE_PREFIX = "miniprogram-share-card-preview-";
const API_PORT = Number(process.env.HUMI_SHARE_LANDING_API_PORT || await findFreePort(18789));
const H5_PORT = Number(process.env.HUMI_SHARE_LANDING_H5_PORT || await findFreePort(5179));
const API_BASE_URL = `http://127.0.0.1:${API_PORT}`;
const H5_BASE_URL = `http://127.0.0.1:${H5_PORT}/`;

const evidenceDir = process.env.HUMI_MINIPROGRAM_SHARE_EVIDENCE_DIR || await findLatestEvidenceDir();
const dataFile = join(evidenceDir, "share-landing-api-data.json");

process.env.HUMI_WECHAT_MOCK = "1";
process.env.HUMI_API_DATA_FILE = dataFile;
process.env.HUMI_ALLOWED_ORIGINS = [
  "https://www.humi-home.com",
  H5_BASE_URL.replace(/\/$/, ""),
].join(",");
process.env.VITE_HUMI_API_BASE_URL = API_BASE_URL;

const { createHumiApiServer } = await import("../api/server.js");
const apiServer = createHumiApiServer();
const viteServer = await createViteServer({
  server: {
    host: "127.0.0.1",
    port: H5_PORT,
    strictPort: true,
  },
});

await listen(apiServer, API_PORT);
await viteServer.listen();

let browser;
try {
  const tokens = await createShareTokens();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  const captures = [];
  for (const item of [
    {
      key: "crave",
      token: tokens.craveToken,
      query: "crave",
      file: "crave-landing.png",
      testId: "crave-share-landing",
    },
    {
      key: "invite",
      token: tokens.inviteToken,
      query: "invite",
      file: "invite-landing.png",
      testId: "invite-share-landing",
    },
    {
      key: "grocery",
      token: tokens.groceryToken,
      query: "groceryShare",
      file: "grocery-landing.png",
      testId: "grocery-share-landing",
    },
    {
      key: "wish",
      token: tokens.wishToken,
      query: "wishShare",
      file: "wish-landing.png",
      testId: "wish-share-landing",
    },
    {
      key: "menu",
      token: tokens.menuToken,
      query: "menuShare",
      file: "menu-landing.png",
      testId: "menu-share-landing",
    },
  ]) {
    const page = await context.newPage();
    const url = `${H5_BASE_URL}?${item.query}=${encodeURIComponent(item.token)}&channel=wechat-miniprogram`;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByTestId(item.testId).waitFor({ timeout: 12_000 });
    const path = join(evidenceDir, item.file);
    await page.screenshot({ path, fullPage: true });
    await page.close();
    captures.push(await inspectFile(path, { key: item.key, url }));
  }

  console.log(JSON.stringify({
    ok: true,
    checkedAt: new Date().toISOString(),
    evidenceDir,
    dataFile,
    h5BaseUrl: H5_BASE_URL,
    apiBaseUrl: API_BASE_URL,
    captures,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await viteServer.close();
  await new Promise((resolve) => apiServer.close(resolve));
}

async function createShareTokens() {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const login = await request(`${API_BASE_URL}/auth/wechat/login`, {
    method: "POST",
    body: { code: `share-landing-owner-${runId}` },
  });
  const authHeaders = { Authorization: `Bearer ${login.accessToken}` };
  const state = await request(`${API_BASE_URL}/state`, { headers: authHeaders });

  const crave = await request(`${API_BASE_URL}/crave-requests`, {
    method: "POST",
    headers: authHeaders,
    body: { householdName: "周末家", initiatorName: "小林" },
  });
  await request(`${API_BASE_URL}/crave-requests/${crave.request.token}/votes`, {
    method: "POST",
    body: {
      participantKey: `share-landing-participant-${runId}`,
      memberName: "家人",
      feelingTag: "想喝汤",
      note: "今天想吃清淡点",
      temporary: true,
    },
  });

  const invite = await request(`${API_BASE_URL}/household-invites`, {
    method: "POST",
    headers: authHeaders,
    body: {
      householdId: state.family.id,
      inviterName: "小林",
    },
  });

  const grocery = await request(`${API_BASE_URL}/grocery-share-requests`, {
    method: "POST",
    headers: authHeaders,
    body: {
      householdName: "周末家",
      initiatorName: "小林",
      items: [
        { key: "ingredient:tomato", name: "西红柿", amount: "约2个", type: "ingredient", source: "今晚菜单" },
        { key: "ingredient:egg", name: "鸡蛋", amount: "3个", type: "ingredient", source: "今晚菜单" },
        { key: "custom:milk", name: "牛奶", amount: "1盒", type: "custom", source: "顺路买" },
      ],
    },
  });

  const wish = await request(`${API_BASE_URL}/wish-share-requests`, {
    method: "POST",
    headers: authHeaders,
    body: {
      householdName: "周末家",
      initiatorName: "小林",
      title: "最近想吃什么",
    },
  });

  const menu = await request(`${API_BASE_URL}/menu-share-requests`, {
    method: "POST",
    headers: authHeaders,
    body: {
      householdName: "周末家",
      initiatorName: "小林",
      title: "香煎豆腐 + 番茄鸡蛋",
      dishes: [
        { id: "pan-fried-tofu", name: "香煎豆腐", quantity: 1, timeMinutes: 20 },
        { id: "tomato-egg", name: "番茄鸡蛋", quantity: 1, timeMinutes: 15 },
      ],
      groceryCount: 6,
    },
  });

  return {
    craveToken: crave.request.token,
    inviteToken: invite.invite.token,
    groceryToken: grocery.request.token,
    wishToken: wish.request.token,
    menuToken: menu.request.token,
  };
}

async function request(url, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${url} failed: ${response.status} ${data.message || response.statusText}`);
  }
  return data;
}

async function findLatestEvidenceDir() {
  const baseDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || DEFAULT_PRIVATE_DIR;
  const entries = await readdir(baseDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(EVIDENCE_PREFIX))
    .map((entry) => entry.name)
    .sort();
  const latest = candidates[candidates.length - 1];
  if (!latest) {
    throw new Error(`No ${EVIDENCE_PREFIX}* directory found under ${baseDir}.`);
  }
  return join(baseDir, latest);
}

async function inspectFile(path, extra = {}) {
  const [fileStat, bytes] = await Promise.all([stat(path), readFile(path)]);
  return {
    ...extra,
    path,
    size: fileStat.size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function findFreePort(preferredPort) {
  for (let port = preferredPort; port < preferredPort + 40; port += 1) {
    if (await canListen(port)) return port;
  }
  throw new Error(`No free local port found from ${preferredPort} to ${preferredPort + 39}.`);
}

async function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}
