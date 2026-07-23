const { validateShareLandingOptions } = require("../../utils/bootstrap");

Page({
  data: {
    ...buildShareData({}),
    canShare: false
  },

  onLoad(options = {}) {
    const landing = validateShareLandingOptions(options);
    if (!landing) {
      this.setData({
        ...buildShareData({}),
        canShare: false,
        helper: "这份内容没有准备完整，请返回 Humi 重新打开。"
      });
      this.enableShare();
      return;
    }
    const data = buildShareData({ ...options, ...landing });
    this.setData({
      ...data,
      canShare: true,
      helper: data.helper
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
    if (!this.data.canShare) return null;
    return {
      title: this.data.title,
      path: this.data.path,
      imageUrl: this.data.imageUrl || undefined
    };
  },

  onShareTimeline() {
    if (!this.data.canShare) return null;
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
    wx.reLaunch({ url: "/pages/boot/index" });
  }
});

function buildShareData(options = {}) {
  const type = normalizeText(options.type) || "crave";
  const token = normalizeText(options.token);
  const householdName = normalizeText(options.householdName) || (type === "invite" ? "这个家" : "我家");
  const initiatorName = normalizeText(options.initiatorName) || "主厨";
  const inviterName = normalizeText(options.inviterName) || initiatorName;
  const itemCount = Number(options.itemCount || 0);

  if (type === "meal_task") {
    const label = normalizeText(options.label) || "一起把今晚这顿端上桌";
    return {
      type,
      token,
      householdName,
      title: label,
      eyebrow: "今晚协作任务",
      body: "发给同住家人，对方登录并加入这个家后，可以认领并标记完成。",
      meta: "不阻塞你继续做饭",
      actionLabel: "选择家人发任务",
      helper: "再点一下，就能选择发给哪位家人。",
      detailRows: [
        { label: "家人打开后", value: "登录 Humi 后认领这件具体小事" },
        { label: "你继续做", value: "任务不会卡住单人做饭流程" }
      ],
      path: `/pages/boot/index?mealTask=${encodeURIComponent(token)}&shareSource=meal_task`
    };
  }

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
      actionLabel: "选择家人发清单",
      helper: "再点一下，就能选择发给哪位家人。",
      detailRows: [
        { label: "家人打开后", value: "可以直接查看，不用先登录" },
        { label: "你回来后", value: "刷新就能看到谁来买、买了什么" }
      ],
      path: `/pages/boot/index?groceryShare=${encodeURIComponent(token)}`
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
      actionLabel: "选择家人发送",
      helper: "再点一下，就能选择发给哪位家人。",
      detailRows: [
        { label: "家人打开后", value: "不用登录，写一道菜就行" },
        { label: "你回来后", value: "刷新“最近想吃”就能看到" }
      ],
      path: `/pages/boot/index?wishShare=${encodeURIComponent(token)}`
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
      actionLabel: "选择家人发菜单",
      helper: "再点一下，就能选择发给哪位家人。",
      detailRows: [
        { label: "家人会看到", value: "今晚的菜和份数" },
        { label: "菜单还会带上", value: "对应的买菜清单" }
      ],
      path: `/pages/boot/index?menuShare=${encodeURIComponent(token)}`
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
      actionLabel: "选择家人发邀请",
      helper: "再点一下，就能选择发给哪位家人。",
      detailRows: [
        { label: "家人打开后", value: "登录一次就能加入这个家" },
        { label: "加入以后", value: "菜单、清单和回复都在一起" }
      ],
      path: `/pages/boot/index?invite=${encodeURIComponent(token)}`
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
    actionLabel: "选择家人发送",
    helper: "再点一下，就能选择发给哪位家人。",
    detailRows: [
      { label: "家人打开后", value: "不用登录，点一个感觉就行" },
      { label: "你回来后", value: "刷新就能看到大家的回复" }
    ],
    path: `/pages/boot/index?crave=${encodeURIComponent(token)}`
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
