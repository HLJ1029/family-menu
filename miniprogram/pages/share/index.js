Page({
  data: {
    ...buildShareData({}),
    canShare: false
  },

  onLoad(options = {}) {
    const data = buildShareData(options);
    const canShare = Boolean(data.token);
    this.setData({
      ...data,
      canShare,
      helper: canShare
        ? data.helper
        : "这份内容没有准备完整，请返回 Humi 重新打开。"
    });
    this.enableShare();
  },

  onShow() {
    this.enableShare();
  },

  enableShare() {
    if (!this.data.canShare) {
      wx.hideShareMenu();
      return;
    }
    wx.showShareMenu({ withShareTicket: false, menus: ["shareAppMessage"] });
  },

  onShareAppMessage() {
    return {
      title: this.data.title,
      path: this.data.path,
      imageUrl: this.data.imageUrl || undefined
    };
  },

  onShareTimeline() {
    return {
      title: this.data.title,
      query: String(this.data.path || "").split("?")[1] || ""
    };
  },

  goBack() {
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/index/index" });
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
      eyebrow: "发买菜清单",
      body: "家人打开后可以说自己买哪些，也能直接勾选已经买到的东西。",
      meta: itemCount > 0 ? `${itemCount} 样要买` : "一起买更轻松",
      actionLabel: "发清单给家人",
      helper: "点下面的黑色按钮，微信会让你选择要发给谁。",
      detailRows: [
        { label: "家人打开后", value: "可以直接查看，不用先登录" },
        { label: "你回来后", value: "刷新就能看到谁来买、买了什么" }
      ],
      path: `/pages/index/index?groceryShare=${encodeURIComponent(token)}`
    };
  }

  if (type === "wish") {
    return {
      type,
      token,
      householdName,
      title: `${initiatorName}想收集家里最近想吃的菜`,
      eyebrow: "问问最近想吃什么",
      body: "家人写一道最近想吃的菜就行，你安排晚饭时会看到。",
      meta: "写一道就够了",
      actionLabel: "发给家人",
      helper: "点下面的黑色按钮，微信会让你选择要发给谁。",
      detailRows: [
        { label: "家人打开后", value: "不用登录，写一道菜就行" },
        { label: "你回来后", value: "刷新“最近想吃”就能看到" }
      ],
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
      body: "把今晚吃什么发给家人，大家打开就能看到菜单和要买的东西。",
      meta: "今晚就吃这些",
      actionLabel: "发菜单给家人",
      helper: "点下面的黑色按钮，微信会让你选择要发给谁。",
      detailRows: [
        { label: "家人会看到", value: "今晚的菜和份数" },
        { label: "菜单还会带上", value: "对应的买菜清单" }
      ],
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
      eyebrow: "邀请家人",
      body: "加入后，家人可以一起看今晚菜单、买菜清单，也能告诉你最近想吃什么。",
      meta: "一起安排家里的饭",
      actionLabel: "发邀请给家人",
      helper: "点下面的黑色按钮，微信会让你选择要发给谁。",
      detailRows: [
        { label: "家人打开后", value: "登录一次就能加入这个家" },
        { label: "加入以后", value: "菜单、清单和回复都在一起" }
      ],
      path: `/pages/index/index?invite=${encodeURIComponent(token)}`
    };
  }

  const title = normalizeText(options.title) || `${householdName}今晚征集口味，点一下就行`;
  return {
    type: "crave",
    token,
    householdName,
    title,
    eyebrow: "问问大家今晚想吃什么",
    body: "家人不用登录，点一个现在想吃的感觉就行。你回来后可以照着大家的回复安排。",
    meta: "点一下就能回复",
    actionLabel: "发给家人",
    helper: "点下面的黑色按钮，微信会让你选择要发给谁。",
    detailRows: [
      { label: "家人打开后", value: "不用登录，点一个感觉就行" },
      { label: "你回来后", value: "刷新就能看到大家的回复" }
    ],
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
