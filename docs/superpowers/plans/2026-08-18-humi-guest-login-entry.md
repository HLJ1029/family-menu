# Humi Guest Login Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit, retryable “微信登录” action to the H5 “我的家” guest state without changing guest-first startup or authentication semantics.

**Architecture:** Keep `UserCenter` presentational: it renders the guest CTA, pending state, and status supplied through `authProps`. Keep bridge orchestration in `main.jsx`, where the existing `requestWechatLoginFromMiniProgram` adapter is already imported; add one recovery timer so failed or unconfirmed handoffs never leave the CTA permanently disabled. Extend the real Playwright H5 entry regression to exercise the guest journey and the existing native identity URL.

**Tech Stack:** React 19, Vite 7, Tailwind CSS, WeChat Mini Program WebView bridge, Playwright, Node.js `assert`.

## Global Constraints

- The CTA label is exactly `微信登录` and uses the existing black primary-button visual language.
- No login request occurs before the guest explicitly clicks the CTA.
- Reuse `/pages/identity/index?action=login`; do not add another authentication or session path.
- Do not change account, household, permission, API, database, or session schemas.
- Do not change guest local menu, plan, or grocery persistence.
- Do not deploy, upload an experience build, submit for review, or publish.
- Product code changes stay inside the existing `codex/humi-wechat-identity-startup` worktree and branch.

---

### Task 1: Guest “我的家” login CTA and bridge recovery

**Files:**
- Modify: `scripts/check-h5-entrypoint-resilience.mjs:10-28,233-260`
- Modify: `src/main.jsx:168-226,3809-3819`
- Modify: `src/components/UserCenter.jsx:12-69,130-140`

**Interfaces:**
- Consumes: `requestWechatLoginFromMiniProgram({ onFailure }) => boolean` from `src/lib/humiIdentity.js` and `isWechatMiniProgramWebView() => boolean` from `src/lib/runtime.js`.
- Produces: `authProps.onWechatLogin() => void`, `authProps.loginPending: boolean`, and the existing `authProps.authStatus: string` for `UserCenter`.

- [ ] **Step 1: Add the failing end-to-end regression**

Add this check to `expectedChecks`:

```js
"guest My Home exposes an explicit retryable native WeChat login action",
```

After the existing `bridgeContext` check, add a real guest-page flow:

```js
const guestLoginContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  serviceWorkers: "block",
  userAgent: WECHAT_USER_AGENT,
});
await guestLoginContext.addInitScript(() => {
  window.__humiNativeCalls = [];
});
const guestLoginPage = await guestLoginContext.newPage();
await guestLoginPage.goto(`${baseUrl}?channel=wechat-miniprogram&humiGuest=1`, { waitUntil: "networkidle" });
await guestLoginPage.evaluate(() => {
  window.wx = window.wx || {};
  window.wx.miniProgram = {
    navigateTo: (payload) => {
      window.__humiNativeCalls.push({ method: "navigateTo", payload: { url: payload.url } });
      payload.fail?.({ errMsg: "navigateTo:fail page not found" });
    },
  };
});
assert.deepEqual(await guestLoginPage.evaluate(() => window.__humiNativeCalls), [], "guest entry must not request login before the user acts");
await guestLoginPage.getByTestId("mobile-nav-user").click();
const guestFamily = guestLoginPage.getByTestId("guest-family-explanation");
const guestLoginButton = guestFamily.getByRole("button", { name: "微信登录", exact: true });
await guestLoginButton.waitFor({ state: "visible", timeout: 5_000 });
assert.equal(await guestFamily.getByRole("button").count(), 1, "guest My Home should expose one primary login action");
await guestLoginButton.click();
await guestLoginPage.waitForFunction(() => window.__humiNativeCalls.length === 1, null, { timeout: 2_000 });
assert.deepEqual(await guestLoginPage.evaluate(() => window.__humiNativeCalls[0]), {
  method: "navigateTo",
  payload: { url: "/pages/identity/index?action=login" },
});
await guestFamily.getByText("没有打开微信身份页。请退出小程序后重新进入，或更新到最新版本再试。").waitFor({ state: "visible", timeout: 5_000 });
assert.equal(await guestFamily.getByRole("button", { name: "微信登录", exact: true }).isEnabled(), true);
await guestLoginContext.close();

const browserGuestContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  serviceWorkers: "block",
});
const browserGuestPage = await browserGuestContext.newPage();
await browserGuestPage.goto(`${baseUrl}?humiGuest=1`, { waitUntil: "networkidle" });
await browserGuestPage.getByTestId("mobile-nav-user").click();
await browserGuestPage.getByTestId("guest-family-explanation").getByRole("button", { name: "微信登录", exact: true }).click();
await browserGuestPage.getByText("请从微信小程序打开 Humi 后登录。").waitFor({ state: "visible", timeout: 2_000 });
assert.equal(await browserGuestPage.getByTestId("guest-family-explanation").getByRole("button", { name: "微信登录", exact: true }).isEnabled(), true);
await browserGuestContext.close();
```

Mutation caught: removing the CTA, auto-triggering login on guest entry, routing to any page other than the existing identity login page, or leaving the CTA disabled after a failed bridge call makes this regression fail.

- [ ] **Step 2: Run the regression and verify RED**

Run:

```bash
npm run validate:h5-entry
```

Expected: FAIL because `guest-family-explanation` contains no `微信登录` button; the failure must occur before any product-code edit.

- [ ] **Step 3: Implement the minimal bridge orchestration in `src/main.jsx`**

Add a timer ref with the other App refs and a pending state beside `authStatus`:

```jsx
const guestLoginRecoveryTimerRef = useRef(null);
const [guestLoginPending, setGuestLoginPending] = useState(false);
```

Add one cleanup effect near the existing session effects:

```jsx
useEffect(() => () => globalThis.clearTimeout(guestLoginRecoveryTimerRef.current), []);
```

Add the action before `authProps`:

```jsx
function startGuestWechatLogin() {
  if (guestLoginPending) return;
  const recover = () => {
    globalThis.clearTimeout(guestLoginRecoveryTimerRef.current);
    guestLoginRecoveryTimerRef.current = null;
    setGuestLoginPending(false);
    setAuthStatus("没有打开微信身份页。请退出小程序后重新进入，或更新到最新版本再试。");
  };
  if (!isWechatMiniProgramWebView()) {
    setAuthStatus("请从微信小程序打开 Humi 后登录。");
    return;
  }
  setGuestLoginPending(true);
  setAuthStatus("正在打开微信登录。");
  const started = requestWechatLoginFromMiniProgram({ onFailure: recover });
  if (!started) {
    recover();
    return;
  }
  guestLoginRecoveryTimerRef.current = globalThis.setTimeout(recover, 4_500);
}
```

Expose it through the existing object:

```jsx
const authProps = {
  authStatus,
  setAuthStatus,
  family,
  familyName,
  setFamilyName,
  cloudLoading,
  loginPending: guestLoginPending,
  onWechatLogin: startGuestWechatLogin,
  onCreateFamily: createFamily,
  onSignOut: handleSignOut,
  showNotice,
};
```

- [ ] **Step 4: Render the CTA and status in `src/components/UserCenter.jsx`**

Pass the existing auth interface to the guest component:

```jsx
if (!signedIn) {
  return (
    <GuestFamilyExplanation
      loginPending={Boolean(authProps?.loginPending)}
      onWechatLogin={authProps?.onWechatLogin}
      status={authProps?.authStatus || ""}
    />
  );
}
```

Replace the static guest component with:

```jsx
function GuestFamilyExplanation({ loginPending = false, onWechatLogin, status = "" }) {
  return (
    <section data-testid="guest-family-explanation" className="mx-auto max-w-2xl rounded-[28px] border border-line bg-white p-6 text-ink shadow-card sm:p-8">
      <p className="eyebrow">我的家</p>
      <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">先安排今晚，也可以稍后再登录</h2>
      <p className="mt-3 text-sm font-bold leading-7 text-ink/58">
        游客模式不会创建家庭。登录后，你可以主动创建自己的家，或通过家人发来的邀请加入。
      </p>
      <button
        type="button"
        onClick={onWechatLogin}
        disabled={loginPending}
        className="mt-6 min-h-12 w-full rounded-full bg-ink px-5 text-sm font-black text-white shadow-card transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-55"
      >
        {loginPending ? "正在打开微信登录" : "微信登录"}
      </button>
      {status && <p role="status" className="mt-3 text-center text-xs font-bold leading-5 text-ink/45">{status}</p>}
    </section>
  );
}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npm run validate:h5-entry
npm run validate:identity
npm run validate:miniprogram-entry
```

Expected: all three commands exit 0; the H5 manifest includes `guest My Home exposes an explicit retryable native WeChat login action`.

- [ ] **Step 6: Commit the tested behavior**

```bash
git add scripts/check-h5-entrypoint-resilience.mjs src/main.jsx src/components/UserCenter.jsx
git commit -m "fix: let guests start WeChat login"
```

### Task 2: Full local acceptance and AI-HQ technical record

**Files:**
- Modify: `/Users/honglijie/AI-HQ/tasks/active/HUMI-2026-001.md`
- Modify: `/Users/honglijie/AI-HQ/projects/humi/STATUS.md`

**Interfaces:**
- Consumes: the committed Task 1 behavior and command results.
- Produces: a dated factual record that the local candidate adds a guest login entry without deployment or release actions.

- [ ] **Step 1: Run the proportional release gates**

Run:

```bash
npm run release:product:smoke
npm run build
npm run release:security:audit
git diff --check
/Users/honglijie/AI-HQ/scripts/secret-scan.sh
```

Expected: every command exits 0; dependency audit reports zero vulnerabilities; secret scan reports `Secret scan passed.`

- [ ] **Step 2: Inspect the final diff and repository state**

Run:

```bash
git status --short --branch
git show --stat --oneline HEAD
git diff HEAD^ -- scripts/check-h5-entrypoint-resilience.mjs src/main.jsx src/components/UserCenter.jsx
```

Expected: product changes are limited to the guest login regression, `main.jsx` bridge orchestration, and the `UserCenter` guest CTA; no API, database, dependency, or release configuration file changed.

- [ ] **Step 3: Record verified facts in AI-HQ**

Append a dated note to the active task and project status containing only these verified facts:

```markdown
2026-08-18 CST 修复游客进入 H5 后无法再次登录的入口缺失：`我的家` 游客卡片新增用户主动点击的“微信登录”主按钮，复用既有 `/pages/identity/index?action=login` 小程序身份桥；失败或非小程序环境会保留可重试按钮并显示明确提示。首次启动仍保持“微信登录 / 先体验 Humi”二选一，游客点击前不调用登录、不创建账号或家庭，API、数据库、权限与会话格式未改。聚焦身份/H5/小程序入口、产品 smoke、构建、依赖安全和 secret scan 已通过。本次仅形成本地候选，没有部署、上传、提审或发布。
```

- [ ] **Step 4: Re-run the cross-repository secret gate and commit the record**

Run:

```bash
/Users/honglijie/AI-HQ/scripts/secret-scan.sh
git -C /Users/honglijie/AI-HQ diff --check
git -C /Users/honglijie/AI-HQ status --short --branch
```

Expected: secret scan passes and the AI-HQ diff is limited to `tasks/active/HUMI-2026-001.md` and `projects/humi/STATUS.md`. Commit only if the AI-HQ worktree has no unrelated overlapping changes; otherwise leave the scoped edits uncommitted and report the pre-existing dirty state.

