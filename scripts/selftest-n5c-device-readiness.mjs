import assert from "node:assert/strict";
import {
  parseN5cDoctorArgs,
  summarizeAdbDevices,
  summarizeIosDevices,
  summarizeN5cDeviceReadiness,
} from "./check-n5c-device-readiness.mjs";

assert.deepEqual(parseN5cDoctorArgs(["--session", "/tmp/n5c"]), { session: "/tmp/n5c" });
assert.throws(() => parseN5cDoctorArgs([]), (error) => error.code === "arguments_invalid");

const availableIos = summarizeIosDevices([{
  hardwareProperties: { marketingName: "iPhone 16 Pro", reality: "physical" },
  connectionProperties: { pairingState: "paired", tunnelState: "connected" },
}]);
assert.deepEqual(availableIos, {
  iphoneConnected: true,
  connectedIphoneCount: 1,
  pairedButUnavailableCount: 0,
});

const unavailableIpad = summarizeIosDevices([{
  hardwareProperties: { marketingName: "iPad Pro", reality: "physical" },
  connectionProperties: { pairingState: "paired", tunnelState: "unavailable" },
}]);
assert.deepEqual(unavailableIpad, {
  iphoneConnected: false,
  connectedIphoneCount: 0,
  pairedButUnavailableCount: 1,
});

assert.deepEqual(summarizeAdbDevices([
  "List of devices attached",
  "emulator-5554 device product:sdk_gphone64_arm64",
  "redacted-physical device product:pixel",
  "unauthorized-id unauthorized",
  "",
].join("\n")), { phoneConnected: true, connectedAndroidCount: 1 });

const blocked = summarizeN5cDeviceReadiness({
  session: {
    ok: false,
    sessionId: "n5c-test",
    candidate: "1.1.75@fbb4938",
    passed: 0,
    required: 56,
    performance: { ok: false },
  },
  ios: unavailableIpad,
  android: { phoneConnected: false, connectedAndroidCount: 0 },
  devtools: { loggedIn: true },
});
assert.equal(blocked.ok, false);
assert.deepEqual(blocked.blockers, [
  "ios_390x844_phone_missing",
  "android_phone_missing",
  "true_device_evidence_incomplete",
]);
assert.equal(JSON.stringify(blocked).includes("iPad Pro"), false);

const ready = summarizeN5cDeviceReadiness({
  session: {
    ok: true,
    sessionId: "n5c-test",
    candidate: "1.1.75@fbb4938",
    passed: 56,
    required: 56,
    performance: { ok: true },
  },
  ios: availableIos,
  android: { phoneConnected: true, connectedAndroidCount: 1 },
  devtools: { loggedIn: true },
});
assert.equal(ready.ok, true);
assert.deepEqual(ready.blockers, []);

console.log("N5c device readiness selftest passed.");
