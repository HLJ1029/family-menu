Component({
  properties: {
    step: { type: Object, value: null },
    nextStep: { type: Object, value: null },
    hasRemainingSteps: { type: Boolean, value: false },
    pending: { type: Boolean, value: false },
  },

  methods: {
    advance() {
      if (this.data.pending || !this.data.step?.id || !this.data.nextStep?.id) return;
      this.triggerEvent("advance", { stepId: this.data.step.id });
    },
  },
});
