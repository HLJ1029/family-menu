const asset = (id, label) => ({
  id,
  label,
  src: `/assets/brand/lovart-v2/${id}.webp`,
});

export const humiBrandScenes = {
  dashboard: asset("humi-home-family-dinner-01", "一家人准备吃晚饭"),
  discover: asset("humi-discover-pick-dish-01", "挑选今晚的菜"),
  planner: asset("humi-planner-week-calendar-01", "规划一周菜单"),
  grocery: asset("humi-grocery-checking-list-01", "核对买菜清单"),
  user: asset("humi-user-family-profile-01", "整理家庭口味"),
  calendar: asset("humi-nutrition-calendar-01", "查看营养日历"),
  recipe: asset("humi-recipe-reading-step-01", "边做边看菜谱"),
  achievement: asset("humi-achievement-small-win-01", "完成一件小事"),
  feedbackFull: asset("humi-feedback-full-happy-01", "吃饱后的满足"),
  feedbackExcited: asset("humi-feedback-excited-picked-01", "选到喜欢的菜"),
  loadingMenu: asset("humi-state-loading-menu-01", "正在准备菜单"),
  offline: asset("humi-state-offline-local-save-01", "内容已保存在本机"),
  syncConflict: asset("humi-state-sync-conflict-01", "需要确认同步内容"),
  syncSuccess: asset("humi-state-sync-success-01", "内容已同步到我的家"),
  linkExpired: asset("humi-state-link-expired-01", "分享链接已经失效"),
  wechatLogin: asset("humi-state-wechat-login-01", "使用微信登录"),
  phoneBind: asset("humi-state-phone-bind-01", "绑定手机号"),
  emptyFamily: asset("humi-state-empty-family-01", "创建我的家"),
  emptyWishPool: asset("humi-state-empty-wish-pool-01", "想吃池还是空的"),
  inviteJoin: asset("humi-invite-family-join-01", "加入一个家"),
  inviteAccepted: asset("humi-invite-family-accepted-01", "已经加入这个家"),
  craveThinking: asset("humi-crave-vote-thinking-01", "想想今晚想吃什么"),
  craveSubmitted: asset("humi-crave-vote-submitted-01", "今晚想吃的已经提交"),
  menuShare: asset("humi-menu-share-open-01", "查看家人分享的菜单"),
  wishWrite: asset("humi-wish-write-dish-01", "写下一道想吃的菜"),
  wishSubmitted: asset("humi-wish-submitted-01", "想吃的菜已经提交"),
  groceryClaim: asset("humi-grocery-claim-open-01", "认领买菜任务"),
  groceryBought: asset("humi-grocery-claim-bought-01", "已经买到清单里的东西"),
  groceryDeclined: asset("humi-grocery-claim-declined-01", "这次暂时买不了"),
  groceryProgress: asset("humi-grocery-progress-sync-01", "买菜进度正在同步"),
};

export const humiAvatarScenes = [
  asset("humi-avatar-dev-front-m-01", "Humi 用户头像"),
  asset("humi-avatar-dev-side-m-01", "Humi 用户头像"),
  asset("humi-avatar-dev-thinking-m-01", "Humi 用户头像"),
  asset("humi-avatar-dev-laptop-m-01", "Humi 用户头像"),
  asset("humi-avatar-family-f-01", "Humi 家庭成员头像"),
  asset("humi-avatar-family-m-01", "Humi 家庭成员头像"),
  asset("humi-avatar-parent-f-01", "Humi 家庭成员头像"),
  asset("humi-avatar-parent-m-01", "Humi 家庭成员头像"),
];

export const humiPosterScenes = [
  "humi-poster-shopping-bag-01",
  "humi-poster-family-taste-01",
  "humi-poster-tonight-eating-01",
  "humi-poster-low-fat-meal-01",
  "humi-poster-weekly-planning-01",
  "humi-poster-breakfast-01",
  "humi-poster-fridge-leftover-01",
  "humi-poster-wish-pool-01",
].map((id) => asset(id, "Humi 海报插画"));

export const humiSocialScenes = [
  "humi-social-cover-fridge-leftover-01",
  "humi-social-cover-dev-diary-01",
  "humi-social-cover-dinner-question-01",
  "humi-social-cover-shopping-list-01",
  "humi-social-cover-low-fat-week-01",
  "humi-social-cover-family-taste-01",
].map((id) => asset(id, "Humi 社媒封面插画"));

export function getHumiBrandScene(scene) {
  if (!scene) return humiBrandScenes.dashboard;
  if (typeof scene === "string") return humiBrandScenes[scene] || asset(scene, "Humi 生活场景");
  return scene;
}
