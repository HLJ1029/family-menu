Component({
  properties: {
    step: { type: Object, value: null },
    nextStep: { type: Object, value: null },
    actionLabel: { type: String, value: "" },
    actionFromStepId: { type: String, value: "" },
    hasRemainingSteps: { type: Boolean, value: false },
    pending: { type: Boolean, value: false },
  },

  methods: {
    advance() {
      if (this.data.pending || !this.data.actionLabel || !this.data.actionFromStepId) return;
      this.triggerEvent("advance", { stepId: this.data.actionFromStepId });
    },
  },
});
