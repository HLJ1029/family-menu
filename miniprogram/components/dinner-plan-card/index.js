Component({
  properties: {
    plan: { type: Object, value: null },
    pending: { type: Boolean, value: false },
    canAccept: { type: Boolean, value: true },
  },
  methods: {
    accept() {
      if (!this.data.pending && this.data.canAccept !== false) this.triggerEvent("accept");
    },
    next() {
      if (!this.data.pending) this.triggerEvent("next");
    },
  },
});
