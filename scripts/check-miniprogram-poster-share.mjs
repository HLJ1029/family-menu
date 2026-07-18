import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("miniprogram/pages/poster/index.js", "utf8");
const appJson = JSON.parse(await readFile("miniprogram/app.json", "utf8"));
const wxml = await readFile("miniprogram/pages/poster/index.wxml", "utf8");
const calls = {
  download: 0,
  share: 0,
  save: 0,
  toast: 0,
  modal: 0,
  openSetting: 0,
};
let capturedPage = null;
const module = { exports: {} };
const wx = {
  downloadFile(options) {
    calls.download += 1;
    options.success({ statusCode: 200, tempFilePath: "/tmp/humi-poster.jpg" });
    options.complete?.();
  },
  showShareImageMenu(options) {
    calls.share += 1;
    assert(options.path === "/tmp/humi-poster.jpg", "native image share should receive downloaded temp path");
    options.success({});
  },
  saveImageToPhotosAlbum(options) {
    calls.save += 1;
    assert(options.filePath === "/tmp/humi-poster.jpg", "album save should receive downloaded temp path");
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
assert(wxml.includes("show-menu-by-longpress"), "poster image should keep long-press fallback");
assert(wxml.includes("bindtap=\"sharePosterImage\""), "poster page should expose native image share action");
assert(wxml.includes("bindtap=\"savePosterImage\""), "poster page should expose album save action");

const page = createPageInstance(capturedPage);
const token = "abcdefghijklmnopqrstuvwxyzABCD1234";
page.onLoad({ token, format: "jpg", title: encodeURIComponent("今晚菜单"), action: "share" });
assert(page.data.token === token, "poster page should accept an opaque token");
assert(page.data.imageUrl === `https://api.humi-home.com/poster-shares/${token}.jpg`, "poster page should build production image URL");
assert(page.data.title === "今晚菜单", "poster page should decode title");
assert(page.onShareAppMessage().path.includes(`token=${token}`), "poster card fallback should preserve token");

await page.sharePosterImage();
assert(calls.download === 1, "native poster share should download once");
assert(calls.share === 1, "native poster share should open WeChat image share menu");
assert(page.data.statusText === "微信已经接手，选个家人发出去吧。", "poster share should report the native menu state");

await page.savePosterImage();
assert(calls.download === 1, "save should reuse the downloaded temp file");
assert(calls.save === 1, "save should call saveImageToPhotosAlbum");
assert(calls.toast === 1, "successful album save should show a success toast");
assert(page.data.statusText === "已经存进相册了。", "poster save should only report success after native API success");

wx.saveImageToPhotosAlbum = (options) => {
  calls.save += 1;
  options.fail({ errMsg: "saveImageToPhotosAlbum:fail auth deny" });
};
wx.showModal = (options) => {
  calls.modal += 1;
  options.success?.({ confirm: true });
};
const deniedPage = createPageInstance(capturedPage);
deniedPage.onLoad({ token, format: "jpg", action: "save" });
await deniedPage.savePosterImage();
assert(calls.toast === 1, "denied album permission must not show a success toast");
assert(calls.modal === 1, "denied album permission should explain how to enable it");
assert(calls.openSetting === 1, "confirmed permission guidance should open WeChat settings");
assert(deniedPage.data.statusText === "还差相册权限。允许以后，再点一次保存。", "denied album permission should remain truthful");

wx.showShareImageMenu = (options) => {
  calls.share += 1;
  options.fail({ errMsg: "showShareImageMenu:fail cancel" });
};
const cancelledPage = createPageInstance(capturedPage);
cancelledPage.onLoad({ token, format: "jpg", action: "share" });
await cancelledPage.sharePosterImage();
assert(cancelledPage.data.statusText === "已取消发送，图片还在这里。", "cancelled sharing must not report success");

const invalidPage = createPageInstance(capturedPage);
invalidPage.onLoad({ token: "bad/token", format: "png" });
assert(invalidPage.data.token === "", "poster page should reject malformed tokens");
assert(invalidPage.data.imageUrl === "", "invalid poster should not build a remote URL");

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
