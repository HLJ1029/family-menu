const { remainingSeconds } = require("../../utils/meal-timeline");

Component({
  properties: {
    label: { type: String, value: "" },
    endsAt: {
      type: String,
      value: "",
      observer() {
        this.refresh();
      },
    },
    remainingSeconds: { type: Number, value: 0 },
  },

  data: {
    displaySeconds: 0,
    minuteText: "00",
    secondText: "00",
    expired: false,
  },

  lifetimes: {
    attached() {
      this.refresh();
      this._clock = setInterval(() => this.refresh(), 1000);
    },
    detached() {
      if (this._clock) clearInterval(this._clock);
      this._clock = null;
    },
  },

  pageLifetimes: {
    show() {
      this.refresh();
    },
  },

  methods: {
    refresh() {
      const seconds = this.data.endsAt
        ? remainingSeconds(this.data.endsAt)
        : Math.max(0, Number(this.data.remainingSeconds) || 0);
      this.setData({
        displaySeconds: seconds,
        minuteText: String(Math.floor(seconds / 60)).padStart(2, "0"),
        secondText: String(seconds % 60).padStart(2, "0"),
        expired: seconds === 0,
      });
    },
  },
});
