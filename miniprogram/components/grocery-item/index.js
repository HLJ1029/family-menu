Component({
  properties: {
    item: { type: Object, value: null },
    currentMemberId: { type: String, value: "" },
    busy: { type: Boolean, value: false },
  },
  methods: {
    toggleChecked() {
      if (this.properties.busy || !this.properties.item?.id) return;
      this.triggerEvent("check", {
        itemId: this.properties.item.id,
        checked: !this.properties.item.checked,
      });
    },
    claimItem() {
      if (this.properties.busy || !this.properties.item?.id || this.properties.item.checked) return;
      this.triggerEvent("claim", { itemId: this.properties.item.id });
    },
  },
});
