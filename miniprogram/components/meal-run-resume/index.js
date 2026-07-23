Component({
  properties: {
    mealRun: { type: Object, value: null },
    plan: { type: Object, value: null },
    canReplacePlan: { type: Boolean, value: false },
  },
  methods: {
    primaryAction() {
      if (this.data.mealRun?.status === "planned") this.triggerEvent("start");
      if (this.data.mealRun?.status === "cooking") this.triggerEvent("resume");
    },
    replace() {
      if (this.data.mealRun?.status === "planned" && this.data.canReplacePlan) this.triggerEvent("replace");
    },
  },
});
