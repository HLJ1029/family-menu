Page({
  data: {
    type: "crave",
    token: "",
    householdName: "我家",
    initiatorName: "主厨",
    title: "大家点了什么感觉",
    subtitle: "卡片已经准备好。发给家人后，家人点开就能免登录选一个感觉。",
    badge: "感觉征集",
    primaryLabel: "转发给家人",
    hint: "如果暂时没人回复，也可以回到 Humi 直接出菜单。",
    itemCount: 0,
    sharePath: "/pages/index/index",
    shareTitle: "我家今晚要做饭，你想吃点啥？",
    previewBody: "家人点开卡片后，会直接进入可操作页面。",
    previewChips: [],
    receiptRows: []
  },

  onLoad(options = {}) {
    const type = options.type || "crave";
    const nextData = buildShareData(type, options);
    this.setData(nextData);
    enableNativeShareMenu();
  },

  onShow() {
    enableNativeShareMenu();
  },

  onShareAppMessage() {
    return {
      title: this.data.shareTitle,
      path: this.data.sharePath
    };
  },

  onShareTimeline() {
    return {
      title: this.data.shareTitle,
      query: pathToQuery(this.data.sharePath)
    };
  },

  goBack() {
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: "/pages/index/index" })
    });
  },

  openHumi() {
    wx.reLaunch({ url: "/pages/index/index" });
  }
});

function buildShareData(type, options) {
  if (type === "invite") {
    const token = sanitize(options.token);
    const householdName = sanitize(options.householdName) || "我的家";
    const inviterName = sanitize(options.initiatorName) || "主厨";
    return {
      type,
      token,
      householdName,
      title: `加入 ${householdName}`,
      subtitle: `${inviterName}邀请你一起看菜单、清单和今晚征集。`,
      badge: "家庭邀请",
      primaryLabel: "转发邀请给家人",
      hint: "点黑色转发按钮发出小程序卡片；家人登录后会自动加入这个家。",
      shareTitle: `邀请你加入 ${householdName}，一起用 Humi`,
      sharePath: token
        ? `/pages/index/index?invite=${encodeURIComponent(token)}&shareSource=invite`
        : "/pages/index/index?view=user&shareSource=invite",
      previewBody: "点开后会进入这个家庭空间的加入页，不会落回普通首页。",
      previewChips: ["正式成员", "共享菜单", "共享清单"],
      receiptRows: [
        { label: "入口", value: "家人打开家庭邀请" },
        { label: "身份", value: "登录后成为正式成员" },
        { label: "加入后", value: "共享菜单、清单和征集" }
      ]
    };
  }

  if (type === "grocery") {
    const itemCount = Number.parseInt(options.itemCount, 10) || 0;
    const token = sanitize(options.token);
    return {
      type,
      token,
      itemCount,
      title: "顺路带这些就够了",
      subtitle: itemCount > 0
        ? `这份清单有 ${itemCount} 项。家人点开卡片后可以直接打开 Humi 看清单。`
        : "清单卡片已经准备好。家人点开后可以直接打开 Humi 看清单。",
      badge: "买菜清单",
      primaryLabel: "转发清单给家人",
      hint: "点黑色转发按钮发出小程序卡片；家人点开后可以直接认领，不需要先登录。",
      shareTitle: itemCount > 0 ? `Humi 买菜清单：${itemCount} 项` : "Humi 买菜清单",
      sharePath: token
        ? `/pages/index/index?groceryShare=${encodeURIComponent(token)}&shareSource=grocery`
        : "/pages/index/index?view=grocery&shareSource=grocery",
      previewBody: "点开后能免登录认领和勾选买到的东西。",
      previewChips: itemCount > 0 ? [`${itemCount} 项`, "可认领", "免登录"] : ["可认领", "免登录"],
      receiptRows: [
        { label: "入口", value: "家人免登录打开清单" },
        { label: "动作", value: itemCount > 0 ? `认领 ${itemCount} 项内的食材` : "认领要买的食材" },
        { label: "回传", value: token ? "主厨刷新后看到认领和已买" : "回到 Humi 查看清单" }
      ]
    };
  }

  if (type === "today_menu") {
    const title = sanitize(options.title) || "今晚菜单";
    const token = sanitize(options.token);
    return {
      type,
      token,
      title: "今晚安排好了",
      subtitle: `${title}。家人点开后可以直接回到 Humi 看今晚菜单。`,
      badge: "今晚菜单",
      primaryLabel: "转发菜单给家人",
      hint: "点黑色转发按钮发出小程序卡片；菜单会继续和买菜清单联动。",
      shareTitle: `Humi 今晚菜单：${title}`,
      sharePath: token
        ? `/pages/index/index?menuShare=${encodeURIComponent(token)}&shareSource=today_menu`
        : "/pages/index/index?view=today&shareSource=today_menu",
      previewBody: token ? "点开后能直接看到这份今晚菜单。" : "点开后能直接看到今晚菜单和买菜清单。",
      previewChips: ["今晚菜单", "清单联动"],
      receiptRows: [
        { label: "入口", value: "家人直接看今晚菜单" },
        { label: "清单", value: "菜单会继续联动买菜清单" },
        { label: "回到", value: "Humi 今晚页" }
      ]
    };
  }

  if (type === "wish") {
    const token = sanitize(options.token);
    const householdName = sanitize(options.householdName) || "我家";
    const shareTitle = `${householdName}最近想吃什么？写一道给 Humi`;
    return {
      type,
      token,
      householdName,
      title: "家里最近想吃什么",
      subtitle: "卡片已经准备好。家人点开后可以免登录写一道想吃的菜。",
      badge: "想吃池",
      primaryLabel: "转发想吃入口",
      hint: "点黑色转发按钮发出小程序卡片；家人写回来的菜不会直接改菜单，主厨刷新后再安排。",
      shareTitle,
      sharePath: token
        ? `/pages/index/index?wishShare=${encodeURIComponent(token)}&shareSource=wish`
        : "/pages/index/index?view=user&shareSource=wish",
      previewBody: "点开后就是一张想吃征集单：写菜名、可补一句、免登录提交。",
      previewChips: ["写一道菜", "免登录", "进想吃池"],
      receiptRows: [
        { label: "入口", value: "家人免登录写想吃" },
        { label: "回传", value: token ? "主厨刷新后收进想吃池" : "回到 Humi 我的家" },
        { label: "收口", value: "主厨决定何时安排到菜单" }
      ]
    };
  }

  const token = sanitize(options.token);
  const householdName = sanitize(options.householdName) || "我家";
  const initiatorName = sanitize(options.initiatorName) || "主厨";
  const shareTitle = `${householdName}今晚要做饭，你想吃点啥？`;
  return {
    type: "crave",
    token,
    householdName,
    initiatorName,
    title: "大家点了什么感觉",
    subtitle: "卡片已经准备好。家人点开就能免登录选一个感觉。",
    badge: "感觉征集",
    primaryLabel: "转发给家人",
    hint: "点黑色转发按钮发出小程序卡片；没人回也可以回到 Humi 直接出菜单。",
    shareTitle,
    sharePath: token
      ? `/pages/index/index?crave=${encodeURIComponent(token)}&shareSource=crave`
      : "/pages/index/index",
    previewBody: "家人免登录点一个感觉：辣一点、想喝汤、随便都行。",
    previewChips: ["随便都行", "想喝汤", "不想动"],
    receiptRows: [
      { label: "入口", value: "家人免登录点感觉" },
      { label: "回传", value: token ? "回复会回到这张征集单" : "普通邀请卡片" },
      { label: "收口", value: "没人回也能直接出菜单" }
    ]
  };
}

function sanitize(value = "") {
  return String(value).slice(0, 80);
}

function pathToQuery(path = "") {
  const queryIndex = path.indexOf("?");
  return queryIndex >= 0 ? path.slice(queryIndex + 1) : "";
}

function enableNativeShareMenu() {
  wx.showShareMenu({
    menus: ["shareAppMessage", "shareTimeline"],
    withShareTicket: false
  });
}
