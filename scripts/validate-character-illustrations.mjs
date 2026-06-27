import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getHumiCharacterCandidates,
  humiCharacterAssets,
  humiCharacterVariantPools,
  pickHumiCharacterIllustration,
} from "../src/components/ui/characterIllustrations.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

assert.equal(humiCharacterAssets.length, 60, "expected all 60 Lovart character assets");

for (const asset of humiCharacterAssets) {
  assert.ok(asset.id, "asset id is required");
  assert.ok(asset.action, `asset action is required for ${asset.id}`);
  assert.match(asset.gender, /^(m|f|u)$/, `asset gender is invalid for ${asset.id}`);
  assert.ok(existsSync(join(repoRoot, "public", asset.src)), `missing webp asset ${asset.src}`);
  assert.ok(existsSync(join(repoRoot, "public", asset.png)), `missing transparent png asset ${asset.png}`);
}

for (const variant of Object.keys(humiCharacterVariantPools)) {
  assert.ok(getHumiCharacterCandidates(variant).length > 0, `variant has no candidates: ${variant}`);
}

const stableA = pickHumiCharacterIllustration("recommendation", {
  seed: "family-a",
  contextKey: "recommendation-hero",
});
const stableB = pickHumiCharacterIllustration("recommendation", {
  seed: "family-a",
  contextKey: "recommendation-hero",
});
assert.deepEqual(stableA, stableB, "same seed and context should pick the same illustration");

const firstPantry = pickHumiCharacterIllustration("pantry", {
  seed: "family-a",
  contextKey: "inventory-empty",
});
const avoided = pickHumiCharacterIllustration("pantry", {
  seed: "family-a",
  contextKey: "inventory-empty",
  usedIds: [firstPantry.id],
  usedActions: [firstPantry.action],
});
assert.notEqual(avoided.id, firstPantry.id, "usedIds should avoid repeating the same asset in one page");
assert.notEqual(avoided.action, firstPantry.action, "usedActions should prefer a different action in one page");

const profilePicks = Array.from({ length: 24 }, (_, index) =>
  pickHumiCharacterIllustration("profile", {
    seed: `family-${index}`,
    contextKey: "profile-hero",
  }).gender,
);
const knownProfilePicks = profilePicks.filter((gender) => gender !== "u");
assert.ok(knownProfilePicks.includes("m"), "profile pool should include male picks across stable seeds");
assert.ok(knownProfilePicks.includes("f"), "profile pool should include female picks across stable seeds");

const fallback = pickHumiCharacterIllustration("unknown-variant", { seed: "x" });
assert.ok(fallback.src, "unknown variants should fall back to a valid illustration");

console.log("Character illustration validation passed.");
