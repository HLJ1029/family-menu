Component({
  properties: {
    household: { type: Object, value: null },
    householdOptions: { type: Array, value: [] },
    roleLabel: { type: String, value: "家人" },
    memberCount: { type: Number, value: 0 },
    dinner: { type: Object, value: null },
    canInvite: { type: Boolean, value: false },
    canOpenSettings: { type: Boolean, value: false },
    pendingAction: { type: String, value: "" },
  },
  methods: {
    switchHousehold(event) {
      this.triggerEvent("switch", { householdId: event.currentTarget.dataset.householdId });
    },
    invite() {
      this.triggerEvent("invite");
    },
    cook() {
      this.triggerEvent("cook");
    },
    settings() {
      this.triggerEvent("settings");
    },
  },
});
