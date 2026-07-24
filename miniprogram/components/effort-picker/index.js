const OPTIONS = [
  { id: "quick_15", title: "15 分钟·只求开饭", detail: "一锅或一盘，配现成主食", badge: "最快" },
  { id: "easy_30", title: "30 分钟·简单做", detail: "一道主菜加极简配菜或汤", badge: "刚刚好" },
  { id: "normal", title: "正常做·今天有精力", detail: "完整菜单，先看时间和缺什么", badge: "更丰富" },
];
const TIERS = new Set(OPTIONS.map((option) => option.id));

Component({
  properties: {
    selectedTier: { type: String, value: "" },
    pending: { type: Boolean, value: false },
  },
  data: { options: OPTIONS },
  methods: {
    selectEffort(event) {
      const tier = String(event.currentTarget?.dataset?.tier || "");
      if (!this.data.pending && TIERS.has(tier)) this.triggerEvent("select", { tier });
    },
  },
});
