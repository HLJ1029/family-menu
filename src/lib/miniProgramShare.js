const DEFAULT_NAVIGATION_TIMEOUT_MS = 1500;

export function openCraveMiniProgramShare(payload) {
  return openMiniProgramShare("crave", {
    messageType: "humi:share-crave",
    messagePayload: payload,
    navigationPayload: payload,
  });
}

export function openHouseholdInviteMiniProgramShare(payload) {
  return openMiniProgramShare("invite", {
    messageType: "humi:share-household-invite",
    messagePayload: {
      token: payload.token,
      householdName: payload.householdName || "我的家",
      inviterName: payload.inviterName || "主厨",
    },
    navigationPayload: payload,
  });
}

export function openGroceryMiniProgramShare(payload) {
  const itemCount = Array.isArray(payload.items)
    ? payload.items.length
    : Math.max(0, Number(payload.itemCount || 0));
  return openMiniProgramShare("grocery", {
    messageType: "humi:share-grocery",
    messagePayload: {
      token: payload.token,
      householdName: payload.householdName || "我家",
      initiatorName: payload.initiatorName || "主厨",
      itemCount,
    },
    navigationPayload: { ...payload, itemCount },
  });
}

export function buildMiniProgramShareUrl(type, payload = {}) {
  const params = new URLSearchParams();
  params.set("type", type);
  params.set("token", payload.token || "");
  if (payload.householdName) params.set("householdName", payload.householdName);
  if (payload.initiatorName) params.set("initiatorName", payload.initiatorName);
  if (payload.inviterName) params.set("inviterName", payload.inviterName);
  if (payload.title) params.set("title", payload.title);
  if (payload.itemCount !== undefined) params.set("itemCount", String(payload.itemCount));
  return `/pages/share/index?${params.toString()}`;
}

async function openMiniProgramShare(type, options) {
  if (typeof window === "undefined") return false;
  if (!String(options.navigationPayload?.token || "").trim()) return false;
  const miniProgram = window.wx?.miniProgram;
  if (typeof miniProgram?.navigateTo !== "function") return false;

  if (typeof miniProgram.postMessage === "function") {
    try {
      miniProgram.postMessage({
        data: {
          type: options.messageType,
          ...options.messagePayload,
          requestedAt: Date.now(),
        },
      });
    } catch {
      // The native share page receives its full payload through the route.
    }
  }

  return navigateToMiniProgramShare(
    miniProgram,
    buildMiniProgramShareUrl(type, options.navigationPayload),
  );
}

function navigateToMiniProgramShare(miniProgram, url, timeoutMs = DEFAULT_NAVIGATION_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false;
    let timeoutId;
    const finish = (opened) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(opened);
    };
    timeoutId = setTimeout(() => finish(false), timeoutMs);

    try {
      miniProgram.navigateTo({
        url,
        success: () => finish(true),
        fail: () => finish(false),
      });
    } catch {
      finish(false);
    }
  });
}
