function buildHumiUrl(baseUrl, options = {}) {
  const separator = baseUrl.includes("?") ? "&" : "?";
  const params = [];
  if (options.crave) params.push(`crave=${encodeURIComponent(options.crave)}`);
  if (options.groceryShare) params.push(`groceryShare=${encodeURIComponent(options.groceryShare)}`);
  if (options.menuShare) params.push(`menuShare=${encodeURIComponent(options.menuShare)}`);
  if (options.wishShare) params.push(`wishShare=${encodeURIComponent(options.wishShare)}`);
  if (options.invite) params.push(`invite=${encodeURIComponent(options.invite)}`);
  if (options.mealTask) params.push(`mealTask=${encodeURIComponent(options.mealTask)}`);
  if (options.view) params.push(`view=${encodeURIComponent(options.view)}`);
  if (options.shareSource) params.push(`shareSource=${encodeURIComponent(options.shareSource)}`);
  const query = params.join("&");
  return query ? `${baseUrl}${separator}${query}` : baseUrl;
}

function shouldOpenAsGuest(options = {}) {
  return Boolean(options.crave || options.groceryShare || options.menuShare || options.wishShare || options.invite || options.mealTask || options.view === "grocery" || options.view === "today");
}

function normalizeLaunchOptions(options = {}) {
  return {
    crave: sanitizeOption(options.crave),
    groceryShare: sanitizeOption(options.groceryShare),
    menuShare: sanitizeOption(options.menuShare),
    wishShare: sanitizeOption(options.wishShare),
    invite: sanitizeOption(options.invite),
    mealTask: sanitizeOption(options.mealTask),
    view: sanitizeOption(options.view),
    shareSource: sanitizeOption(options.shareSource),
  };
}

function encodeShareParams(payload = {}) {
  const params = [];
  Object.keys(payload).forEach((key) => {
    const value = payload[key];
    if (value !== undefined && value !== null && value !== "") {
      params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  });
  return params.join("&");
}

function buildSharePayload(payload = {}) {
  const type = sanitizeOption(payload.type || "crave");
  if (type === "meal_task") {
    const token = sanitizeOption(payload.token);
    const label = sanitizeOption(payload.label) || "一起把今晚这顿端上桌";
    return {
      title: label,
      path: token
        ? `/pages/index/index?mealTask=${encodeURIComponent(token)}&shareSource=meal_task`
        : "/pages/index/index",
    };
  }
  if (type === "invite") {
    const token = sanitizeOption(payload.token);
    const householdName = sanitizeOption(payload.householdName) || "我的家";
    return {
      title: `邀请你加入 ${householdName}，一起用 Humi`,
      path: token
        ? `/pages/index/index?invite=${encodeURIComponent(token)}&shareSource=invite`
        : "/pages/index/index?view=user&shareSource=invite",
    };
  }
  if (type === "grocery") {
    const token = sanitizeOption(payload.token);
    const itemCount = Number.parseInt(payload.itemCount, 10) || 0;
    return {
      title: itemCount > 0 ? `Humi 买菜清单：${itemCount} 项` : "Humi 买菜清单",
      path: token
        ? `/pages/index/index?groceryShare=${encodeURIComponent(token)}&shareSource=grocery`
        : "/pages/index/index?view=grocery&shareSource=grocery",
    };
  }
  if (type === "today_menu") {
    const token = sanitizeOption(payload.token);
    const title = sanitizeOption(payload.title) || "今晚菜单";
    return {
      title: `Humi 今晚菜单：${title}`,
      path: token
        ? `/pages/index/index?menuShare=${encodeURIComponent(token)}&shareSource=today_menu`
        : "/pages/index/index?view=today&shareSource=today_menu",
    };
  }
  if (type === "wish") {
    const token = sanitizeOption(payload.token);
    const householdName = sanitizeOption(payload.householdName) || "我家";
    return {
      title: `${householdName}最近想吃什么？写一道给 Humi`,
      path: token
        ? `/pages/index/index?wishShare=${encodeURIComponent(token)}&shareSource=wish`
        : "/pages/index/index?view=user&shareSource=wish",
    };
  }
  const token = sanitizeOption(payload.token);
  const householdName = sanitizeOption(payload.householdName) || "我家";
  return {
    title: `${householdName}今晚要做饭，你想吃点啥？`,
    path: token
      ? `/pages/index/index?crave=${encodeURIComponent(token)}&shareSource=crave`
      : "/pages/index/index",
  };
}

function pathToQuery(path = "") {
  const queryIndex = path.indexOf("?");
  return queryIndex >= 0 ? path.slice(queryIndex + 1) : "";
}

function sanitizeOption(value = "") {
  return String(value || "").slice(0, 120);
}

module.exports = {
  buildHumiUrl,
  buildSharePayload,
  encodeShareParams,
  normalizeLaunchOptions,
  pathToQuery,
  shouldOpenAsGuest,
};
