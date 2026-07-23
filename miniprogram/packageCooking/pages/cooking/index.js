Page({
  data: { status: "empty", errorText: "" },
  retry() { this.setData({ status: "empty", errorText: "" }); }
});
