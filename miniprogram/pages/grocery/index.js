const { appStore } = require("../../utils/store");
const { guardNativeTab } = require("../../utils/native-shell-guard");
const { enqueueMutation } = require("../../utils/offline-queue");
const {
  applyGroceryState,
  createMutationId,
  deriveGroceryItems,
  getActiveHousehold,
  getHouseholdRole,
  saveHouseholdStatePatch,
} = require("../../utils/household-state");
const shareablePage = require("../../behaviors/shareable-page");

Page({
  behaviors: [shareablePage],

  data: {
    status: "loading",
    errorText: "",
    cacheState: "",
    items: [],
    currentMemberId: "",
    currentMemberName: "",
    canCollaborate: false,
    pendingAction: "",
    conflictVisible: false,
  },
  async onShow() {
    if (!guardNativeTab()) return;
    this.syncState();
    await this.prepareGroceryShare().catch(() => null);
  },
  syncState() {
    const bootstrap = appStore.getState().bootstrap;
    if (!bootstrap) {
      this.setData({ status: "empty", errorText: "", items: [], canCollaborate: false });
      return;
    }
    if (bootstrap.cacheState === "cached") this.invalidateNativeShare("grocery");
    const household = getActiveHousehold(bootstrap);
    const householdState = bootstrap.householdState || {};
    const derivedItems = deriveGroceryItems(
      householdState.mealPlan || {},
      householdState.pantryItems || [],
    );
    const baseStatusById = new Map(derivedItems.map((item) => [item.id, item.status]));
    const items = applyGroceryState(
      derivedItems,
      householdState,
    ).map((item) => ({
      ...item,
      baseStatus: baseStatusById.get(item.id) || item.baseStatus || "pending",
    }));
    this.setData({
      status: bootstrap.cacheState === "cached" ? "cached" : "ready",
      cacheState: bootstrap.cacheState || "",
      errorText: "",
      items,
      currentMemberId: bootstrap.user?.id || "",
      currentMemberName: bootstrap.user?.displayName || "家人",
      canCollaborate: ["owner", "member"].includes(getHouseholdRole(bootstrap)),
      householdName: household?.name || "我的家",
    });
  },
  async checkItem(event = {}) {
    const itemId = String(event?.detail?.itemId || event?.currentTarget?.dataset?.itemId || "");
    const checked = event?.detail?.checked ?? event?.currentTarget?.dataset?.checked;
    if (!itemId || typeof checked !== "boolean" || this.data.pendingAction || !this.data.canCollaborate) return null;
    const bootstrap = appStore.getState().bootstrap;
    const mutationId = createMutationId("grocery-check");
    this.invalidateNativeShare("grocery");
    this.setData({ pendingAction: `check:${itemId}`, errorText: "", conflictVisible: false });
    try {
      const envelope = await saveHouseholdStatePatch({ checkedItems: { [itemId]: checked } }, {
        householdId: bootstrap.activeHouseholdId,
        stateVersion: bootstrap.stateVersion,
        idempotencyKey: mutationId,
      });
      appStore.replaceBootstrap(envelope);
      this.syncState();
      await this.prepareGroceryShare({ force: true }).catch(() => null);
      return envelope;
    } catch (error) {
      if (error?.status === 409 && error?.code === "state_version_conflict" && error.latestEnvelope) {
        appStore.replaceBootstrap(error.latestEnvelope);
        this.syncState();
        this.setData({ conflictVisible: true, errorText: "家人刚更新了清单，已载入最新状态。" });
        await this.prepareGroceryShare({ force: true }).catch(() => null);
        return null;
      }
      if (isOfflineError(error)) {
        enqueueMutation({
          id: mutationId,
          type: "grocery_item_check",
          householdId: bootstrap.activeHouseholdId,
          stateVersion: bootstrap.stateVersion,
          createdAt: Date.now(),
          data: { itemId, checked },
        });
        this.setData({
          items: this.data.items.map((item) => item.id === itemId
            ? {
                ...item,
                checked,
                status: checked ? "bought" : item.baseStatus || (item.status === "bought" ? "pending" : item.status),
              }
            : item),
          cacheState: "cached",
          errorText: "已离线保存，联网后会同步这项勾选。",
        });
        this.invalidateNativeShare("grocery");
        return { queued: true };
      }
      this.setData({ errorText: "这项清单没有保存成功，请重试。" });
      await this.prepareGroceryShare({ force: true }).catch(() => null);
      throw error;
    } finally {
      this.setData({ pendingAction: "" });
    }
  },
  async claimItem(event = {}) {
    const itemId = String(event?.detail?.itemId || event?.currentTarget?.dataset?.itemId || "");
    if (!itemId || this.data.pendingAction || !this.data.canCollaborate) return null;
    const bootstrap = appStore.getState().bootstrap;
    const item = this.data.items.find((candidate) => candidate.id === itemId);
    if (!item) return null;
    this.invalidateNativeShare("grocery");
    if (this.data.cacheState === "cached") {
      const error = new Error("offline_grocery_claim_unavailable");
      error.code = "offline_grocery_claim_unavailable";
      throw error;
    }
    const now = new Date().toISOString();
    this.setData({ pendingAction: `claim:${itemId}`, errorText: "" });
    try {
      const envelope = await saveHouseholdStatePatch({
        groceryClaims: {
          [itemId]: {
            itemKey: itemId,
            itemName: item.name,
            memberId: bootstrap.user.id,
            memberName: bootstrap.user.displayName || "家人",
            status: "claimed",
            claimedAt: now,
          },
        },
      }, {
        householdId: bootstrap.activeHouseholdId,
        stateVersion: bootstrap.stateVersion,
        idempotencyKey: createMutationId("grocery-claim"),
      });
      appStore.replaceBootstrap(envelope);
      this.syncState();
      await this.prepareGroceryShare({ force: true }).catch(() => null);
      return envelope;
    } catch (error) {
      if (error?.status === 409 && error?.latestEnvelope) {
        appStore.replaceBootstrap(error.latestEnvelope);
        this.syncState();
        this.setData({ conflictVisible: true, errorText: "清单刚被家人更新，请按最新状态再试。" });
        await this.prepareGroceryShare({ force: true }).catch(() => null);
        return null;
      }
      this.setData({ errorText: "暂时无法领取这项食材，请联网后重试。" });
      await this.prepareGroceryShare({ force: true }).catch(() => null);
      throw error;
    } finally {
      this.setData({ pendingAction: "" });
    }
  },
  async prepareGroceryShare(options = {}) {
    if (!this.data.canCollaborate || (this.data.pendingAction && !options.force)) return null;
    if (this.data.cacheState === "cached") {
      const error = new Error("offline_share_unavailable");
      error.code = "offline_share_unavailable";
      throw error;
    }
    const bootstrap = appStore.getState().bootstrap;
    return this.prepareNativeShare("grocery", {
      page: "grocery",
      householdId: bootstrap.activeHouseholdId,
      stateVersion: bootstrap.stateVersion,
      mealRunId: bootstrap.currentMealRun?.id || "",
      householdName: this.data.householdName,
      itemCount: this.data.items.length,
      data: {
        mode: "read_only",
        householdId: bootstrap.activeHouseholdId,
        householdName: this.data.householdName,
        initiatorName: this.data.currentMemberName,
        title: "这周买菜清单",
        items: this.data.items.map((item) => ({
          id: item.id,
          name: item.name,
          amount: item.amount,
          category: item.category || "",
          checked: item.checked,
        })),
      },
    });
  },

  prepareShare() {
    return this.prepareGroceryShare();
  },

  onShareAppMessage(event) {
    return this.getNativeSharePayload(event, {
      title: "Humi 买菜清单",
      path: "/pages/grocery/index",
    }, "grocery");
  },

  regenerateList() {
    if (this.data.cacheState === "cached") {
      const error = new Error("offline_grocery_regeneration_unavailable");
      error.code = "offline_grocery_regeneration_unavailable";
      throw error;
    }
    this.syncState();
  },
  retry() { this.setData({ status: "loading", errorText: "" }); this.syncState(); }
});

function isOfflineError(error) {
  return Number(error?.status) === 0 && error?.retryable !== false;
}
