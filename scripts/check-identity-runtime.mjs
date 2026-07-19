import assert from "node:assert/strict";
import fs from "node:fs";

const appConfig = JSON.parse(fs.readFileSync("miniprogram/app.json", "utf8"));
assert.ok(appConfig.pages.includes("pages/identity/index"));

const appSource = fs.readFileSync("miniprogram/app.js", "utf8");
assert.match(appSource, /getStorageSync\(NATIVE_SESSION_KEY\)/);
assert.match(appSource, /setHumiSession\(session\)/);
assert.match(appSource, /clearHumiSession\(\)/);

const identityJs = fs.readFileSync("miniprogram/pages/identity/index.js", "utf8");
const identityWxml = fs.readFileSync("miniprogram/pages/identity/index.wxml", "utf8");
assert.match(identityWxml, /open-type="chooseAvatar"/);
assert.match(identityWxml, /type="nickname"/);
assert.match(identityJs, /\/identity\/profile/);
assert.match(identityJs, /\/identity\/avatar/);
assert.match(identityJs, /wx\.reLaunch/);

console.log("Identity runtime checks passed.");
