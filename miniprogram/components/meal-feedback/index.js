const OPTIONS = [
  { id: "want_again", label: "下次还想吃" },
  { id: "change_it", label: "可以换换" },
  { id: "too_hard", label: "太费劲" },
];

Component({
  properties: {
    pending: { type: Boolean, value: false },
  },

  data: {
    options: OPTIONS,
  },

  methods: {
    select(event) {
      const value = String(event?.currentTarget?.dataset?.value || "");
      if (this.data.pending || !OPTIONS.some((option) => option.id === value)) return;
      this.triggerEvent("select", { value });
    },
  },
});
