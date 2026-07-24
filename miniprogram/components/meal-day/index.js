Component({
  properties: {
    day: { type: Object, value: null },
    canEdit: { type: Boolean, value: false },
    busy: { type: Boolean, value: false },
  },
  methods: {
    clearDinner() {
      if (!this.properties.canEdit || this.properties.busy || !this.properties.day?.dateKey) return;
      this.triggerEvent("replace", {
        dateKey: this.properties.day.dateKey,
        entries: [],
      });
    },
  },
});
