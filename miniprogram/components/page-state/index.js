Component({
  properties: {
    status: { type: String, value: "loading" },
    errorText: { type: String, value: "暂时无法加载。" }
  },
  methods: {
    retry() {
      this.triggerEvent("retry");
    }
  }
});
