import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { SHOPPING_POSTER_STYLES, nextPosterStyle } from "../src/lib/posterStyles.js";

const nativeStyleSource = await readFile("miniprogram/utils/poster-styles.js", "utf8");
const nativeStyleModule = { exports: {} };
vm.runInNewContext(nativeStyleSource, {
  module: nativeStyleModule,
  exports: nativeStyleModule.exports,
}, { filename: "miniprogram/utils/poster-styles.js" });
const { POSTER_STYLES, nextStyleId } = nativeStyleModule.exports;

assert(
  SHOPPING_POSTER_STYLES.join("|") === "default|theme",
  "shopping poster styles should expose two explicit, visibly different choices",
);
assert(nextPosterStyle("default", SHOPPING_POSTER_STYLES) === "theme", "poster style should advance from default to theme");
assert(nextPosterStyle("theme", SHOPPING_POSTER_STYLES) === "default", "poster style should cycle back to default");
assert(nextPosterStyle("default", ["default", "default", "theme"]) === "theme", "poster style cycling should ignore duplicate IDs");
assert(POSTER_STYLES.map((style) => style.id).join("|") === "default|theme", "native poster styles should match H5 style IDs");
assert(nextStyleId("default", POSTER_STYLES) === "theme", "native poster style should advance deterministically");
assert(nextStyleId("theme", POSTER_STYLES) === "default", "native poster style should cycle deterministically");
assert(nextStyleId("theme", [{ id: "theme", label: "主题" }]) === "theme", "single-template posters should keep their only style");

const source = await readFile("miniprogram/pages/poster/index.js", "utf8");
const appJson = JSON.parse(await readFile("miniprogram/app.json", "utf8"));
const pageJson = JSON.parse(await readFile("miniprogram/pages/poster/index.json", "utf8"));
const wxml = await readFile("miniprogram/pages/poster/index.wxml", "utf8");
const calls = {
  download: 0,
  share: 0,
  save: 0,
  toast: 0,
  modal: 0,
  openSetting: 0,
};
const telemetryEvents = [];
let capturedPage = null;
const module = { exports: {} };
const wx = {
  downloadFile(options) {
    calls.download += 1;
    const token = new URL(options.url).pathname.split("/").pop().split(".")[0];
    options.success({ statusCode: 200, tempFilePath: `/tmp/${token}.jpg` });
    options.complete?.();
  },
  showShareImageMenu(options) {
    calls.share += 1;
    assert(options.path.startsWith("/tmp/"), "native image share should receive downloaded temp path");
    options.success({});
  },
  saveImageToPhotosAlbum(options) {
    calls.save += 1;
    assert(options.filePath.startsWith("/tmp/"), "album save should receive downloaded temp path");
    options.success({});
  },
  showToast() {
    calls.toast += 1;
  },
  showModal() {
    calls.modal += 1;
  },
  openSetting() {
    calls.openSetting += 1;
  },
  navigateBack() {},
  reLaunch() {},
};

vm.runInNewContext(source, {
  console,
  module,
  exports: module.exports,
  require(request) {
    if (request === "../../utils/config") {
      return { getHumiApiBaseUrl: () => "https://api.humi-home.com" };
    }
    if (request === "../../utils/poster-styles") return nativeStyleModule.exports;
    if (request === "../../utils/telemetry") {
      return {
        trackEvent(name, fields) {
          telemetryEvents.push({ name, fields });
        },
      };
    }
    throw new Error(`Unexpected require: ${request}`);
  },
  wx,
  getCurrentPages: () => [{}, {}],
  Page(definition) {
    capturedPage = definition;
  },
}, { filename: "miniprogram/pages/poster/index.js" });

assert(capturedPage, "poster page should register with Page");
assert(appJson.pages.includes("pages/poster/index"), "poster page should be registered in app.json");
assert(pageJson.enableShareAppMessage === true, "poster page should enable its synchronous app-message fallback");
assert(wxml.includes("show-menu-by-longpress"), "poster image should keep long-press fallback");
assert(wxml.includes("bindtap=\"sharePosterImage\""), "poster page should expose native image share action");
assert(wxml.includes("bindtap=\"savePosterImage\""), "poster page should expose album save action");
assert(wxml.includes("bindtap=\"changeStyle\""), "multi-template poster page should expose a real style action");
assert(/wx:if="\{\{showStyleAction\}\}"/.test(wxml), "style action should be hidden for single-template posters");

const page = createPageInstance(capturedPage);
const token = "abcdefghijklmnopqrstuvwxyzABCD1234";
const themeToken = "themePosterToken_abcdefghijklmnopqrstuvwxyz";
page.onLoad({
  token,
  format: "jpg",
  styleId: "default",
  defaultToken: token,
  defaultFormat: "jpg",
  themeToken,
  themeFormat: "jpg",
  posterType: "grocery_list",
  title: encodeURIComponent("今晚菜单"),
  action: "share",
});
assert(page.data.token === token, "poster page should accept an opaque token");
assert(page.data.imageUrl === `https://api.humi-home.com/poster-shares/${token}.jpg`, "poster page should build production image URL");
assert(page.data.title === "今晚菜单", "poster page should decode title");
assert(page.onShareAppMessage().path.includes(`token=${token}`), "poster card fallback should preserve token");
assert(page.data.styleId === "default", "poster page should expose the uploaded style");
assert(page.data.showStyleAction === true, "two uploaded templates should enable style switching");

await page.sharePosterImage();
assert(calls.download === 1, "native poster share should download once");
assert(calls.share === 1, "native poster share should open WeChat image share menu");
assert(page.data.statusText === "微信已经接手，选个家人发出去吧。", "poster share should report the native menu state");

await page.savePosterImage();
assert(calls.download === 1, "save should reuse the downloaded temp file");
assert(calls.save === 1, "save should call saveImageToPhotosAlbum");
assert(calls.toast === 1, "successful album save should show a success toast");
assert(page.data.statusText === "已经存进相册了。", "poster save should only report success after native API success");

const firstStyle = page.data.styleId;
const firstImageUrl = page.data.imageUrl;
await page.changeStyle();
assert(page.data.styleId !== firstStyle, "each style press should differ from the immediately previous style");
assert(page.data.imageUrl !== firstImageUrl, "style switching must select a genuinely different uploaded image URL");
const secondStyle = page.data.styleId;
const secondImageUrl = page.data.imageUrl;
await page.changeStyle();
assert(page.data.styleId !== secondStyle, "style cycling should not stick on the current style");
assert(page.data.imageUrl !== secondImageUrl, "cycling back should update the displayed image URL");
await page.changeStyle();
await page.sharePosterImage();
await page.sharePosterImage();
assert(calls.download === 2, "the second poster URL should download exactly once across repeated shares");

wx.saveImageToPhotosAlbum = (options) => {
  calls.save += 1;
  options.fail({ errMsg: "saveImageToPhotosAlbum:fail auth deny" });
};
wx.showModal = (options) => {
  calls.modal += 1;
  options.success?.({ confirm: true });
};
const deniedPage = createPageInstance(capturedPage);
deniedPage.onLoad({ token, format: "jpg", styleId: "default", action: "save" });
await deniedPage.savePosterImage();
assert(calls.toast === 1, "denied album permission must not show a success toast");
assert(calls.modal === 1, "denied album permission should explain how to enable it");
assert(calls.openSetting === 1, "confirmed permission guidance should open WeChat settings");
assert(deniedPage.data.statusText === "还差相册权限。允许以后，再点一次保存。", "denied album permission should remain truthful");
assert(
  telemetryEvents.some((event) => event.name === "poster_failed" && event.fields?.errorCode === "permission_denied"),
  "album denial should be a privacy-safe permission outcome",
);

wx.showShareImageMenu = (options) => {
  calls.share += 1;
  options.fail({ errMsg: "showShareImageMenu:fail cancel" });
};
const cancelledPage = createPageInstance(capturedPage);
cancelledPage.onLoad({ token, format: "jpg", styleId: "default", action: "share" });
await cancelledPage.sharePosterImage();
assert(cancelledPage.data.statusText === "已取消发送，图片还在这里。", "cancelled sharing must not report success");
assert(
  telemetryEvents.some((event) => event.name === "native_share_cancelled" && event.fields?.result === "cancelled"),
  "cancelled sharing should be recorded as a user outcome, not a technical failure",
);
assert(
  !telemetryEvents.some((event) => event.name === "poster_failed" && event.fields?.result === "cancelled"),
  "cancelled sharing must not be recorded as poster_failed",
);

const invalidPage = createPageInstance(capturedPage);
invalidPage.onLoad({ token: "bad/token", format: "png" });
assert(invalidPage.data.token === "", "poster page should reject malformed tokens");
assert(invalidPage.data.imageUrl === "", "invalid poster should not build a remote URL");
assert(invalidPage.data.showStyleAction === false, "invalid poster should never expose style switching");

const singleTemplatePage = createPageInstance(capturedPage);
singleTemplatePage.onLoad({
  token,
  format: "jpg",
  styleId: "default",
  posterType: "today_menu",
  defaultToken: token,
  defaultFormat: "jpg",
});
assert(singleTemplatePage.data.showStyleAction === false, "single-template poster types should hide style switching");
await singleTemplatePage.changeStyle();
assert(singleTemplatePage.data.imageUrl === `https://api.humi-home.com/poster-shares/${token}.jpg`, "single-template style action should be inert");

const telemetryDump = JSON.stringify(telemetryEvents);
assert(!telemetryDump.includes(token), "poster telemetry must not contain opaque image tokens");
assert(!telemetryDump.includes(themeToken), "poster telemetry must not contain alternate opaque image tokens");

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  calls,
  imageUrl: page.data.imageUrl,
  sharePath: page.onShareAppMessage().path,
}, null, 2));

function createPageInstance(definition) {
  const instance = {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) {
      this.data = { ...this.data, ...patch };
    },
  };
  for (const [key, value] of Object.entries(definition)) {
    if (typeof value === "function") instance[key] = value.bind(instance);
  }
  return instance;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
