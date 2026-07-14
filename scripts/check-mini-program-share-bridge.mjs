import assert from "node:assert/strict";
import {
  buildMiniProgramShareUrl,
  openCraveMiniProgramShare,
  openGroceryMiniProgramShare,
  openHouseholdInviteMiniProgramShare,
} from "../src/lib/miniProgramShare.js";

const originalWindow = globalThis.window;

try {
  delete globalThis.window;
  assert.equal(await openCraveMiniProgramShare({ token: "crave-1" }), false);

  globalThis.window = { wx: { miniProgram: { postMessage() {} } } };
  assert.equal(await openCraveMiniProgramShare({ token: "crave-1" }), false);

  const calls = [];
  globalThis.window = {
    wx: {
      miniProgram: {
        postMessage(payload) {
          calls.push({ method: "postMessage", payload });
        },
        navigateTo(payload) {
          calls.push({ method: "navigateTo", payload });
          payload.success?.({ errMsg: "navigateTo:ok" });
        },
      },
    },
  };

  assert.equal(await openCraveMiniProgramShare({
    token: "crave-1",
    householdName: "周末家",
    initiatorName: "阿杰",
    title: "今晚想吃什么",
  }), true);
  assert.equal(calls[0].payload.data.type, "humi:share-crave");
  assert.match(calls[1].payload.url, /^\/pages\/share\/index\?type=crave/);
  assert.match(calls[1].payload.url, /token=crave-1/);
  assert.match(calls[1].payload.url, /householdName=%E5%91%A8%E6%9C%AB%E5%AE%B6/);

  calls.length = 0;
  assert.equal(await openGroceryMiniProgramShare({
    token: "grocery-1",
    householdName: "我家",
    initiatorName: "主厨",
    items: [{ name: "番茄" }, { name: "鸡蛋" }],
  }), true);
  assert.equal(calls[0].payload.data.itemCount, 2);
  assert.match(calls[1].payload.url, /type=grocery/);
  assert.match(calls[1].payload.url, /itemCount=2/);

  calls.length = 0;
  assert.equal(await openHouseholdInviteMiniProgramShare({
    token: "invite-1",
    householdName: "新家",
    inviterName: "小林",
  }), true);
  assert.equal(calls[0].payload.data.type, "humi:share-household-invite");
  assert.match(calls[1].payload.url, /type=invite/);

  globalThis.window = {
    wx: {
      miniProgram: {
        postMessage() {
          throw new Error("postMessage unavailable");
        },
        navigateTo(payload) {
          payload.success?.({ errMsg: "navigateTo:ok" });
        },
      },
    },
  };
  assert.equal(await openCraveMiniProgramShare({ token: "crave-post-message-failed" }), true);

  globalThis.window = {
    wx: {
      miniProgram: {
        navigateTo(payload) {
          payload.fail?.({ errMsg: "navigateTo:fail page not found" });
        },
      },
    },
  };
  assert.equal(await openCraveMiniProgramShare({ token: "crave-2" }), false);

  globalThis.window = {
    wx: {
      miniProgram: {
        navigateTo() {
          throw new Error("bridge unavailable");
        },
      },
    },
  };
  assert.equal(await openCraveMiniProgramShare({ token: "crave-3" }), false);
  assert.equal(await openCraveMiniProgramShare({ token: "" }), false);

  assert.equal(
    buildMiniProgramShareUrl("invite", { token: "a/b", householdName: "家 人" }),
    "/pages/share/index?type=invite&token=a%2Fb&householdName=%E5%AE%B6+%E4%BA%BA",
  );

  console.log(JSON.stringify({
    ok: true,
    checks: [
      "missing-runtime-does-not-report-success",
      "missing-navigation-does-not-report-success",
      "crave-opens-native-share-page",
      "grocery-opens-native-share-page-with-item-count",
      "invite-opens-native-share-page",
      "post-message-failure-does-not-block-native-share-page",
      "navigation-failure-does-not-report-success",
      "navigation-exception-does-not-report-success",
      "missing-token-does-not-open-invalid-card",
      "share-query-is-encoded",
    ],
  }, null, 2));
} finally {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
}
