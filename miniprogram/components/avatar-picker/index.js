const { getHumiApiBaseUrl } = require("../../utils/config");

const AVATAR_KEYS = [
  "humi-avatar-dev-front-m-01",
  "humi-avatar-dev-side-m-01",
  "humi-avatar-dev-thinking-m-01",
  "humi-avatar-dev-laptop-m-01",
  "humi-avatar-family-f-01",
  "humi-avatar-family-m-01",
  "humi-avatar-parent-f-01",
  "humi-avatar-parent-m-01"
];

Component({
  properties: {
    selectedAvatarKey: { type: String, value: "" }
  },
  data: {
    avatars: AVATAR_KEYS.map((key) => ({
      key,
      src: `${getHumiApiBaseUrl()}/assets/brand/lovart-v2/${key}.webp`
    }))
  },
  methods: {
    selectAvatar(event) {
      const avatarKey = String(event.currentTarget.dataset.avatarKey || "");
      if (AVATAR_KEYS.includes(avatarKey)) this.triggerEvent("select", { avatarKey });
    }
  }
});
