const { getHumiApiBaseUrl } = require("../../utils/config");
const APPROVED_AVATAR_KEYS = require("../../data/approved-avatar-keys.json");

Component({
  properties: {
    selectedAvatarKey: { type: String, value: "" }
  },
  data: {
    avatars: APPROVED_AVATAR_KEYS.map((key) => ({
      key,
      src: `${getHumiApiBaseUrl()}/assets/brand/lovart-v2/${key}.webp`
    }))
  },
  methods: {
    selectAvatar(event) {
      const avatarKey = String(event.currentTarget.dataset.avatarKey || "");
      if (APPROVED_AVATAR_KEYS.includes(avatarKey)) this.triggerEvent("select", { avatarKey });
    }
  }
});
