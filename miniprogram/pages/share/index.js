Page({
  data: buildShareData({}),

  onLoad(options = {}) {
    const data = buildShareData(options);
    this.setData(data);
    wx.showShareMenu({ withShareTicket: false, menus: ["shareAppMessage"] });
  },

  onShareAppMessage() {
    return {
      title: this.data.title,
      path: this.data.path
    };
  },

  goBack() {
    wx.navigateBack();
  }
});

function buildShareData(options = {}) {
  const type = normalizeText(options.type) || "crave";
  const token = normalizeText(options.token);
  const householdName = normalizeText(options.householdName) || (type === "invite" ? "这个家" : "我家");
  const initiatorName = normalizeText(options.initiatorName) || "主厨";
  const inviterName = normalizeText(options.inviterName) || initiatorName;
  const itemCount = Number(options.itemCount || 0);

  if (type === "grocery") {
    const title = itemCount > 0
      ? `${initiatorName}发来 ${itemCount} 项买菜清单`
      : `${initiatorName}发来买菜清单`;
    return {
      type,
      token,
      householdName,
      title,
      eyebrow: "买菜清单",
      body: "家里要买的东西都在这张卡片里，点开就能认领和标记买到。",
      meta: itemCount > 0 ? `${itemCount} 项待买` : "待确认",
      path: `/pages/index/index?groceryShare=${encodeURIComponent(token)}`
    };
  }

  if (type === "wish") {
    return {
      type,
      token,
      householdName,
      title: `${initiatorName}想收集家里最近想吃的菜`,
      eyebrow: "想吃池",
      body: "写一道最近想吃的菜就行，主厨会在安排晚饭时看到。",
      meta: "免登录写一道",
      path: `/pages/index/index?wishShare=${encodeURIComponent(token)}`
    };
  }

  if (type === "menu" || type === "today_menu") {
    return {
      type: "menu",
      token,
      householdName,
      title: normalizeText(options.title) || `${householdName}今晚菜单已经安排好`,
      eyebrow: "今晚菜单",
      body: "点开就能看今晚吃什么，以及这顿饭的安排。",
      meta: "今晚一起吃",
      path: `/pages/index/index?menuShare=${encodeURIComponent(token)}`
    };
  }

  if (type === "invite") {
    const title = `${inviterName}邀请你加入 ${householdName}`;
    return {
      type,
      token,
      householdName,
      title,
      eyebrow: "家庭邀请",
      body: "加入后可以一起看今晚菜单、买菜清单和家里的口味偏好。",
      meta: "一起安排",
      path: `/pages/index/index?invite=${encodeURIComponent(token)}`
    };
  }

  const title = normalizeText(options.title) || `${householdName}今晚征集口味，点一下就行`;
  return {
    type: "crave",
    token,
    householdName,
    title,
    eyebrow: "今晚征集口味",
    body: "家人点一个感觉就能参与，Humi 会把大家的口味汇总成今晚菜单。",
    meta: "免登录参与",
    path: `/pages/index/index?crave=${encodeURIComponent(token)}`
  };
}

function normalizeText(value) {
  const text = String(value || "").trim();
  try {
    return decodeURIComponent(text).trim();
  } catch {
    return text;
  }
}

module.exports = {
  buildShareData
};
