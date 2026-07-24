Component({
  properties: {
    member: { type: Object, value: null },
    canManage: { type: Boolean, value: false },
    currentMemberId: { type: String, value: "" },
    pendingAction: { type: String, value: "" },
  },
  methods: {
    transfer() {
      this.triggerEvent("transfer", { memberId: this.properties.member?.id || "" });
    },
    remove() {
      this.triggerEvent("remove", { memberId: this.properties.member?.id || "" });
    },
  },
});
