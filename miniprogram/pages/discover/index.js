const { guardNativeTab } = require("../../utils/native-shell-guard");
const { rawRequest } = require("../../utils/request");
const { getHumiApiBaseUrl } = require("../../utils/config");

const CATEGORIES = ["全部", "家常菜", "省时菜", "素菜", "汤", "肉菜"];
const SEARCH_DELAY_MS = 250;
const THUMBNAIL_PATH = /^\/assets\/dishes\/thumbs\/[A-Za-z0-9_-]+\.webp$/;

Page({
  data: {
    status: "loading",
    errorText: "",
    recipes: [],
    categories: CATEGORIES,
    category: "",
    query: "",
    nextCursor: null,
    hasMore: false,
    loadingMore: false,
    skeletons: [1, 2, 3, 4, 5, 6]
  },

  onLoad() {
    this._searchDelayMs = SEARCH_DELAY_MS;
    if (!guardNativeTab()) return;
    return this.loadFirstPage();
  },

  onShow() {
    guardNativeTab();
  },

  onUnload() {
    clearTimeout(this._searchTimer);
  },

  async loadFirstPage(overrides = {}) {
    const query = String(overrides.query ?? this.data.query ?? "").slice(0, 40);
    const category = String(overrides.category ?? this.data.category ?? "").slice(0, 40);
    const requestGeneration = (this._requestGeneration || 0) + 1;
    this._requestGeneration = requestGeneration;
    this.setData({
      query,
      category,
      status: this.data.recipes.length ? "refreshing" : "loading",
      errorText: "",
      nextCursor: null,
      hasMore: false,
      loadingMore: false
    });
    try {
      const payload = await rawRequest({
        path: buildRecipeSummaryPath({ query, category, limit: 20 }),
        method: "GET"
      });
      if (requestGeneration !== this._requestGeneration) return;
      const recipes = normalizeRecipeSummaries(payload?.recipes);
      this.setData({
        recipes,
        nextCursor: typeof payload?.nextCursor === "string" ? payload.nextCursor : null,
        hasMore: typeof payload?.nextCursor === "string",
        status: recipes.length ? "ready" : "empty",
        errorText: ""
      });
    } catch (_) {
      if (requestGeneration !== this._requestGeneration) return;
      this.setData({
        status: this.data.recipes.length ? "stale" : "error",
        errorText: this.data.recipes.length ? "刷新失败，已保留当前菜谱。" : "菜谱暂时没有加载出来，请重试。"
      });
    }
  },

  async loadMore() {
    if (!this.data.hasMore || this.data.loadingMore || !this.data.nextCursor) return;
    const requestGeneration = this._requestGeneration || 0;
    const query = this.data.query;
    const category = this.data.category;
    const cursor = this.data.nextCursor;
    this.setData({ loadingMore: true });
    try {
      const payload = await rawRequest({
        path: buildRecipeSummaryPath({
          query,
          category,
          cursor,
          limit: 20
        }),
        method: "GET"
      });
      if (
        requestGeneration !== this._requestGeneration
        || query !== this.data.query
        || category !== this.data.category
      ) return;
      const existingIds = new Set(this.data.recipes.map((recipe) => recipe.id));
      const recipes = normalizeRecipeSummaries(payload?.recipes)
        .filter((recipe) => !existingIds.has(recipe.id));
      this.setData({
        recipes: [...this.data.recipes, ...recipes],
        nextCursor: typeof payload?.nextCursor === "string" ? payload.nextCursor : null,
        hasMore: typeof payload?.nextCursor === "string",
        errorText: ""
      });
    } catch (_) {
      if (requestGeneration === this._requestGeneration) {
        this.setData({ errorText: "没有加载到更多菜谱，稍后再试。" });
      }
    } finally {
      if (requestGeneration === this._requestGeneration) this.setData({ loadingMore: false });
    }
  },

  onSearchInput(event) {
    clearTimeout(this._searchTimer);
    const query = String(event.detail?.value || "").slice(0, 40);
    this.setData({ query });
    this._searchTimer = setTimeout(() => this.loadFirstPage({ query }), SEARCH_DELAY_MS);
  },

  selectCategory(event) {
    clearTimeout(this._searchTimer);
    const selected = String(event.currentTarget?.dataset?.category || "");
    const category = selected === "全部" ? "" : selected.slice(0, 40);
    if (category === this.data.category) return;
    this.setData({ category });
    return this.loadFirstPage({ category });
  },

  openRecipe(event) {
    const recipeId = String(event.detail?.recipeId || "");
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(recipeId)) return;
    wx.navigateTo({
      url: `/packageContent/pages/recipe/index?recipeId=${encodeURIComponent(recipeId)}`
    });
  },

  retry() {
    return this.loadFirstPage();
  },

  onReachBottom() {
    return this.loadMore();
  }
});

function buildRecipeSummaryPath({ query = "", category = "", cursor = "", limit = 20 }) {
  const params = [
    ["limit", String(limit)],
    ["query", String(query).slice(0, 40)],
    ["category", String(category).slice(0, 40)],
    ["cursor", String(cursor)]
  ].filter(([, value]) => value);
  return `/recipes?${params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")}`;
}

function normalizeRecipeSummaries(value) {
  const apiBase = getHumiApiBaseUrl().replace(/\/$/, "");
  return (Array.isArray(value) ? value : []).map((recipe) => {
    const thumbnailPath = String(recipe?.thumbnailUrl || "");
    return {
      id: String(recipe?.id || ""),
      title: String(recipe?.title || ""),
      category: String(recipe?.category || "家常菜"),
      minutes: Math.max(1, Number.parseInt(recipe?.minutes, 10) || 1),
      thumbnailUrl: THUMBNAIL_PATH.test(thumbnailPath) ? `${apiBase}${thumbnailPath}` : ""
    };
  }).filter((recipe) => /^[A-Za-z0-9_-]{1,80}$/.test(recipe.id) && recipe.title);
}
