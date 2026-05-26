let recipes = [];

const artThemes = {
  tomato: "linear-gradient(135deg, #d94c35, #f6bd46)",
  green: "linear-gradient(135deg, #7fa35a, #f0d77a)",
  soup: "linear-gradient(135deg, #6a5b8c, #f2d7a6)",
  broccoli: "linear-gradient(135deg, #2f7d51, #b7d46b)",
  meat: "linear-gradient(135deg, #a83e2b, #6d2d22)",
  spicy: "linear-gradient(135deg, #c0392b, #f39c12)",
  fresh: "linear-gradient(135deg, #69a85f, #dcebd3)",
  soup2: "linear-gradient(135deg, #86a67f, #f1ead7)",
  rice: "linear-gradient(135deg, #f3bd45, #fff1be)",
  eggplant: "linear-gradient(135deg, #5b477e, #cf6f60)",
};

const state = {
  view: "recipes",
  category: "全部",
  query: "",
  menu: readStorage("family-menu-items", []),
  checked: readStorage("family-menu-checked", {}),
};

const nodes = {
  tabs: document.querySelectorAll(".tab"),
  views: {
    recipes: document.querySelector("#recipesView"),
    menu: document.querySelector("#menuView"),
    shopping: document.querySelector("#shoppingView"),
  },
  recipeGrid: document.querySelector("#recipeGrid"),
  categoryChips: document.querySelector("#categoryChips"),
  searchInput: document.querySelector("#searchInput"),
  menuCount: document.querySelector("#menuCount"),
  shoppingBadge: document.querySelector("#shoppingBadge"),
  menuList: document.querySelector("#menuList"),
  shoppingList: document.querySelector("#shoppingList"),
  shoppingSummary: document.querySelector("#shoppingSummary"),
  recipeDialog: document.querySelector("#recipeDialog"),
  recipeDetail: document.querySelector("#recipeDetail"),
};

document.querySelector("#openShoppingButton").addEventListener("click", () => switchView("shopping"));
document.querySelector("#goShoppingButton").addEventListener("click", () => switchView("shopping"));
document.querySelector("#clearCheckedButton").addEventListener("click", clearCheckedShoppingItems);

nodes.tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
});

nodes.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  renderRecipes();
});

nodes.recipeDialog.addEventListener("click", (event) => {
  if (event.target === nodes.recipeDialog) {
    nodes.recipeDialog.close();
  }
});

initApp();

async function initApp() {
  try {
    recipes = await loadRecipes();
    pruneMissingMenuItems();
    renderCategories();
    renderAll();
  } catch (error) {
    renderLoadError(error);
  }
}

async function loadRecipes() {
  const response = await fetch("./data/recipes.json");
  if (!response.ok) {
    throw new Error(`菜谱数据读取失败：${response.status}`);
  }
  return response.json();
}

function renderLoadError(error) {
  nodes.recipeGrid.innerHTML = '<div class="empty-state">菜谱数据加载失败。请通过本地服务访问页面，例如 python3 -m http.server 4173。</div>';
  nodes.menuList.innerHTML = `<div class="empty-state">${error.message}</div>`;
  nodes.shoppingSummary.textContent = "菜谱数据加载失败。";
  nodes.shoppingList.innerHTML = "";
  nodes.menuCount.textContent = state.menu.length;
  nodes.shoppingBadge.textContent = 0;
}

function pruneMissingMenuItems() {
  const validRecipeIds = new Set(recipes.map((recipe) => recipe.id));
  const nextMenu = state.menu.filter((item) => validRecipeIds.has(item.recipeId));
  if (nextMenu.length !== state.menu.length) {
    state.menu = nextMenu;
    saveMenu();
  }
}

function renderAll() {
  renderRecipes();
  renderMenu();
  renderShoppingList();
  updateCounts();
}

function renderCategories() {
  const categories = ["全部", ...new Set(recipes.flatMap((recipe) => recipe.categories))];
  nodes.categoryChips.innerHTML = categories
    .map(
      (category) => `
        <button class="chip ${category === state.category ? "active" : ""}" type="button" data-category="${category}">
          ${category}
        </button>
      `,
    )
    .join("");

  nodes.categoryChips.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.category = chip.dataset.category;
      renderCategories();
      renderRecipes();
    });
  });
}

function renderRecipes() {
  const query = state.query.toLowerCase();
  const filtered = recipes.filter((recipe) => {
    const inCategory = state.category === "全部" || recipe.categories.includes(state.category);
    const text = [
      recipe.name,
      recipe.description,
      ...recipe.tags,
      ...recipe.categories,
      ...recipe.ingredients.map((item) => item.name),
    ]
      .join(" ")
      .toLowerCase();

    return inCategory && (!query || text.includes(query));
  });

  nodes.recipeGrid.innerHTML =
    filtered.length > 0
      ? filtered.map(renderRecipeCard).join("")
      : `<div class="empty-state">没有找到对应菜品，换个关键词试试。</div>`;

  nodes.recipeGrid.querySelectorAll("[data-action='detail']").forEach((button) => {
    button.addEventListener("click", () => openRecipeDetail(button.dataset.id));
  });

  nodes.recipeGrid.querySelectorAll("[data-action='add']").forEach((button) => {
    button.addEventListener("click", () => addToMenu(button.dataset.id));
  });
}

function renderRecipeCard(recipe) {
  return `
    <article class="recipe-card">
      <div class="dish-art" style="--dish-bg: ${artThemes[recipe.accent]}">
        <span>${recipe.categories[0]} · ${recipe.timeMinutes} 分钟</span>
      </div>
      <div class="recipe-body">
        <h3>${recipe.name}</h3>
        <div class="meta">
          <span>${recipe.difficulty}</span>
          <span>${recipe.servings} 人份</span>
          <span>${recipe.tags[0]}</span>
        </div>
        <div class="card-actions">
          <button class="small-button" type="button" data-action="detail" data-id="${recipe.id}">看做法</button>
          <button class="primary-button" type="button" data-action="add" data-id="${recipe.id}">加入菜单</button>
        </div>
      </div>
    </article>
  `;
}

function renderMenu() {
  if (state.menu.length === 0) {
    nodes.menuList.innerHTML = `<div class="empty-state">还没有选择菜品。先去“点菜”里加入今天想吃的菜。</div>`;
    return;
  }

  nodes.menuList.innerHTML = state.menu
    .map((item) => {
      const recipe = getRecipe(item.recipeId);
      return `
        <article class="menu-card">
          <div>
            <h3>${recipe.name}</h3>
            <div class="meta">
              <span>${recipe.timeMinutes} 分钟</span>
              <span>${recipe.difficulty}</span>
              <span>${item.servings} 人份</span>
            </div>
          </div>
          <div class="stepper" aria-label="${recipe.name} 人份调整">
            <button type="button" data-action="decrease" data-id="${recipe.id}">-</button>
            <strong>${item.servings}</strong>
            <button type="button" data-action="increase" data-id="${recipe.id}">+</button>
            <button class="small-button" type="button" data-action="remove" data-id="${recipe.id}">移除</button>
          </div>
        </article>
      `;
    })
    .join("");

  nodes.menuList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const { action, id } = button.dataset;
      if (action === "increase") updateServings(id, 1);
      if (action === "decrease") updateServings(id, -1);
      if (action === "remove") removeFromMenu(id);
    });
  });
}

function renderShoppingList() {
  const items = buildShoppingList();
  const ingredients = items.filter((item) => item.type === "ingredient");
  const seasonings = items.filter((item) => item.type === "seasoning");
  const checkedCount = items.filter((item) => state.checked[item.key]).length;

  nodes.shoppingSummary.textContent =
    items.length > 0
      ? `共 ${items.length} 项，已勾选 ${checkedCount} 项。常见调料会标记为“家中可能已有”。`
      : "今日菜单为空，生成清单前请先选择菜品。";

  if (items.length === 0) {
    nodes.shoppingList.innerHTML = `<div class="empty-state">暂无购物清单。</div>`;
    return;
  }

  nodes.shoppingList.innerHTML = [
    renderShoppingGroup("食材", ingredients),
    renderShoppingGroup("调料", seasonings),
  ].join("");

  nodes.shoppingList.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      state.checked[checkbox.dataset.key] = checkbox.checked;
      writeStorage("family-menu-checked", state.checked);
      renderShoppingList();
      updateCounts();
    });
  });
}

function renderShoppingGroup(title, items) {
  if (items.length === 0) return "";

  return `
    <section class="shopping-group">
      <h3>${title}</h3>
      ${items
        .map((item) => {
          const checked = Boolean(state.checked[item.key]);
          return `
            <label class="shopping-item ${checked ? "checked" : ""}">
              <input type="checkbox" data-key="${item.key}" ${checked ? "checked" : ""} />
              <span>
                <span class="item-name">${item.name}</span>
                ${item.pantryItem ? `<span class="item-note">家中可能已有</span>` : ""}
              </span>
              <span class="item-amount">${formatAmount(item)}</span>
            </label>
          `;
        })
        .join("")}
    </section>
  `;
}

function openRecipeDetail(recipeId) {
  const recipe = getRecipe(recipeId);
  nodes.recipeDetail.innerHTML = `
    <div class="detail-cover" style="--dish-bg: ${artThemes[recipe.accent]}">
      <button class="dialog-close" type="button" aria-label="关闭">×</button>
    </div>
    <div class="detail-content">
      <h2>${recipe.name}</h2>
      <p>${recipe.description}</p>
      <div class="meta">
        <span>${recipe.servings} 人份</span>
        <span>${recipe.timeMinutes} 分钟</span>
        <span>${recipe.difficulty}</span>
      </div>
      <div class="detail-grid">
        <section class="detail-section">
          <h3>食材</h3>
          <ul class="plain-list">
            ${recipe.ingredients.map((item) => `<li>${item.name} ${formatRawAmount(item)}</li>`).join("")}
          </ul>
        </section>
        <section class="detail-section">
          <h3>调料</h3>
          <ul class="plain-list">
            ${recipe.seasonings.map((item) => `<li>${item.name} ${formatRawAmount(item)}</li>`).join("")}
          </ul>
        </section>
      </div>
      <section class="detail-section">
        <h3>做法</h3>
        <ol class="steps">
          ${recipe.steps.map((step) => `<li>${step}</li>`).join("")}
        </ol>
      </section>
      <section class="detail-section">
        <h3>小贴士</h3>
        <p>${recipe.tips}</p>
      </section>
      <button class="primary-button" type="button" data-action="add" data-id="${recipe.id}">加入今日菜单</button>
    </div>
  `;

  nodes.recipeDetail.querySelector(".dialog-close").addEventListener("click", () => nodes.recipeDialog.close());
  nodes.recipeDetail.querySelector("[data-action='add']").addEventListener("click", () => {
    addToMenu(recipe.id);
    nodes.recipeDialog.close();
  });
  nodes.recipeDialog.showModal();
}

function addToMenu(recipeId) {
  const recipe = getRecipe(recipeId);
  const existing = state.menu.find((item) => item.recipeId === recipeId);

  if (existing) {
    existing.servings += recipe.servings;
  } else {
    state.menu.push({ recipeId, servings: recipe.servings });
  }

  saveMenu();
  renderAll();
}

function removeFromMenu(recipeId) {
  state.menu = state.menu.filter((item) => item.recipeId !== recipeId);
  saveMenu();
  renderAll();
}

function updateServings(recipeId, delta) {
  const item = state.menu.find((menuItem) => menuItem.recipeId === recipeId);
  if (!item) return;

  item.servings = Math.max(1, item.servings + delta);
  saveMenu();
  renderAll();
}

function buildShoppingList() {
  const merged = new Map();

  state.menu.forEach((menuItem) => {
    const recipe = getRecipe(menuItem.recipeId);
    if (!recipe) return;

    const ratio = menuItem.servings / recipe.servings;

    [
      ...recipe.ingredients.map((item) => ({ ...item, type: "ingredient" })),
      ...recipe.seasonings.map((item) => ({ ...item, type: "seasoning" })),
    ].forEach((rawItem) => {
      const scaled = scaleItem(rawItem, ratio);
      const key = `${scaled.type}:${scaled.name}:${scaled.unit}:${typeof scaled.amount}`;
      const current = merged.get(key);

      if (current && typeof current.amount === "number" && typeof scaled.amount === "number") {
        current.amount += scaled.amount;
        current.from.push(recipe.name);
      } else if (current) {
        current.amount = "适量";
        current.from.push(recipe.name);
      } else {
        merged.set(key, {
          ...scaled,
          key,
          pantryItem: Boolean(scaled.pantryItem),
          from: [recipe.name],
        });
      }
    });
  });

  return Array.from(merged.values()).sort((a, b) => Number(a.pantryItem) - Number(b.pantryItem));
}

function scaleItem(item, ratio) {
  if (typeof item.amount !== "number") return { ...item };
  const amount = Math.round(item.amount * ratio * 10) / 10;
  return { ...item, amount };
}

function clearCheckedShoppingItems() {
  state.checked = {};
  writeStorage("family-menu-checked", state.checked);
  renderShoppingList();
  updateCounts();
}

function switchView(view) {
  state.view = view;
  nodes.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  Object.entries(nodes.views).forEach(([name, node]) => node.classList.toggle("active", name === view));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateCounts() {
  const shoppingItems = buildShoppingList();
  nodes.menuCount.textContent = state.menu.length;
  nodes.shoppingBadge.textContent = shoppingItems.filter((item) => !state.checked[item.key]).length;
}

function saveMenu() {
  writeStorage("family-menu-items", state.menu);
}

function getRecipe(recipeId) {
  return recipes.find((recipe) => recipe.id === recipeId);
}

function formatRawAmount(item) {
  return `${item.amount}${item.unit || ""}${item.required === false ? "，可选" : ""}`;
}

function formatAmount(item) {
  if (typeof item.amount !== "number") return item.amount;
  return `${Number.isInteger(item.amount) ? item.amount : item.amount.toFixed(1)}${item.unit || ""}`;
}

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
