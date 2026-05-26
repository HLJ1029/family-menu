const recipes = [
  {
    id: "tomato-egg",
    name: "西红柿炒鸡蛋",
    categories: ["家常菜", "快手菜"],
    tags: ["新手友好", "下饭菜", "15分钟"],
    servings: 2,
    difficulty: "简单",
    timeMinutes: 15,
    accent: "tomato",
    description: "酸甜开胃的经典家常菜，适合新手快速上手。",
    ingredients: [
      { name: "西红柿", amount: 2, unit: "个", required: true },
      { name: "鸡蛋", amount: 3, unit: "个", required: true },
      { name: "小葱", amount: 1, unit: "根", required: false },
    ],
    seasonings: [
      { name: "食用油", amount: "适量", unit: "", pantryItem: true },
      { name: "盐", amount: 2, unit: "克", pantryItem: true },
      { name: "白糖", amount: 3, unit: "克", pantryItem: true },
    ],
    steps: [
      "西红柿洗净切块，鸡蛋打散备用。",
      "热锅加油，倒入鸡蛋炒至凝固后盛出。",
      "锅中补少量油，放入西红柿翻炒出汁。",
      "倒回鸡蛋，加盐和少量白糖调味。",
      "翻炒均匀，撒小葱后出锅。",
    ],
    tips: "想要汤汁更多，可以把西红柿多炒 1 分钟。",
  },
  {
    id: "potato-shreds",
    name: "青椒土豆丝",
    categories: ["家常菜", "素菜"],
    tags: ["清爽", "下饭菜", "20分钟"],
    servings: 2,
    difficulty: "简单",
    timeMinutes: 20,
    accent: "green",
    description: "口感脆爽，适合作为日常素菜。",
    ingredients: [
      { name: "土豆", amount: 2, unit: "个", required: true },
      { name: "青椒", amount: 1, unit: "个", required: true },
      { name: "蒜", amount: 2, unit: "瓣", required: true },
    ],
    seasonings: [
      { name: "食用油", amount: "适量", unit: "", pantryItem: true },
      { name: "盐", amount: 2, unit: "克", pantryItem: true },
      { name: "白醋", amount: 1, unit: "勺", pantryItem: true },
    ],
    steps: [
      "土豆切细丝，用清水冲洗去淀粉。",
      "青椒切丝，蒜切末。",
      "热锅加油爆香蒜末。",
      "放入土豆丝快速翻炒。",
      "加入青椒、盐和白醋，炒至断生出锅。",
    ],
    tips: "土豆丝冲水后更容易炒出脆感。",
  },
  {
    id: "seaweed-egg-soup",
    name: "紫菜蛋花汤",
    categories: ["汤", "快手菜"],
    tags: ["10分钟", "清淡", "新手友好"],
    servings: 2,
    difficulty: "简单",
    timeMinutes: 10,
    accent: "soup",
    description: "快速暖胃的家常汤，适合搭配主菜。",
    ingredients: [
      { name: "紫菜", amount: 5, unit: "克", required: true },
      { name: "鸡蛋", amount: 1, unit: "个", required: true },
      { name: "小葱", amount: 1, unit: "根", required: false },
    ],
    seasonings: [
      { name: "盐", amount: 2, unit: "克", pantryItem: true },
      { name: "香油", amount: 0.5, unit: "勺", pantryItem: true },
      { name: "白胡椒粉", amount: "少许", unit: "", pantryItem: true },
    ],
    steps: [
      "锅中加水烧开，放入紫菜。",
      "鸡蛋打散，沿锅边慢慢淋入。",
      "加盐和白胡椒粉调味。",
      "关火后滴香油，撒小葱即可。",
    ],
    tips: "蛋液要慢慢淋入，蛋花会更细。",
  },
  {
    id: "garlic-broccoli",
    name: "蒜蓉西兰花",
    categories: ["素菜", "快手菜"],
    tags: ["清淡", "15分钟", "低脂"],
    servings: 2,
    difficulty: "简单",
    timeMinutes: 15,
    accent: "broccoli",
    description: "颜色清爽，适合补充蔬菜。",
    ingredients: [
      { name: "西兰花", amount: 1, unit: "颗", required: true },
      { name: "蒜", amount: 4, unit: "瓣", required: true },
    ],
    seasonings: [
      { name: "食用油", amount: "适量", unit: "", pantryItem: true },
      { name: "盐", amount: 2, unit: "克", pantryItem: true },
      { name: "生抽", amount: 1, unit: "勺", pantryItem: true },
    ],
    steps: [
      "西兰花切小朵，洗净备用。",
      "锅中烧水，加少量盐，焯水 1 分钟后捞出。",
      "热锅加油，放入蒜末炒香。",
      "加入西兰花翻炒，放盐和生抽调味。",
      "炒匀后出锅。",
    ],
    tips: "焯水后过一下冷水，颜色会更翠绿。",
  },
  {
    id: "cola-wings",
    name: "可乐鸡翅",
    categories: ["肉菜", "家常菜"],
    tags: ["孩子爱吃", "35分钟", "微甜"],
    servings: 2,
    difficulty: "中等",
    timeMinutes: 35,
    accent: "meat",
    description: "甜咸适中，适合家庭聚餐。",
    ingredients: [
      { name: "鸡翅中", amount: 8, unit: "个", required: true },
      { name: "姜", amount: 3, unit: "片", required: true },
      { name: "可乐", amount: 330, unit: "毫升", required: true },
    ],
    seasonings: [
      { name: "生抽", amount: 2, unit: "勺", pantryItem: true },
      { name: "老抽", amount: 0.5, unit: "勺", pantryItem: true },
      { name: "食用油", amount: "适量", unit: "", pantryItem: true },
    ],
    steps: [
      "鸡翅两面划口，冷水下锅焯水后捞出。",
      "热锅加油，放姜片和鸡翅煎至两面微黄。",
      "加入生抽、老抽和可乐。",
      "中小火炖煮 20 分钟。",
      "转大火收汁，裹匀鸡翅即可。",
    ],
    tips: "收汁时要勤翻动，避免糖分糊锅。",
  },
  {
    id: "mapo-tofu",
    name: "麻婆豆腐",
    categories: ["家常菜", "下饭菜"],
    tags: ["微辣", "25分钟", "下饭菜"],
    servings: 2,
    difficulty: "中等",
    timeMinutes: 25,
    accent: "spicy",
    description: "香辣入味，适合配米饭。",
    ingredients: [
      { name: "嫩豆腐", amount: 1, unit: "盒", required: true },
      { name: "猪肉末", amount: 100, unit: "克", required: true },
      { name: "蒜", amount: 3, unit: "瓣", required: true },
    ],
    seasonings: [
      { name: "豆瓣酱", amount: 1, unit: "勺", pantryItem: true },
      { name: "生抽", amount: 1, unit: "勺", pantryItem: true },
      { name: "淀粉", amount: 1, unit: "勺", pantryItem: true },
      { name: "花椒粉", amount: "少许", unit: "", pantryItem: true },
    ],
    steps: [
      "豆腐切块，蒜切末。",
      "热锅加油，放肉末炒散。",
      "加入豆瓣酱和蒜末炒出红油。",
      "加少量水，放入豆腐小火煮 5 分钟。",
      "淋入水淀粉勾芡，撒花椒粉出锅。",
    ],
    tips: "翻动豆腐时用锅铲轻推，避免碎掉。",
  },
  {
    id: "cucumber-egg",
    name: "黄瓜炒鸡蛋",
    categories: ["快手菜", "家常菜"],
    tags: ["清爽", "15分钟", "新手友好"],
    servings: 2,
    difficulty: "简单",
    timeMinutes: 15,
    accent: "fresh",
    description: "清淡快手，适合工作日晚餐。",
    ingredients: [
      { name: "黄瓜", amount: 1, unit: "根", required: true },
      { name: "鸡蛋", amount: 2, unit: "个", required: true },
      { name: "蒜", amount: 2, unit: "瓣", required: false },
    ],
    seasonings: [
      { name: "食用油", amount: "适量", unit: "", pantryItem: true },
      { name: "盐", amount: 2, unit: "克", pantryItem: true },
    ],
    steps: [
      "黄瓜切片，鸡蛋打散。",
      "热锅加油，先炒鸡蛋后盛出。",
      "锅中放蒜片和黄瓜翻炒。",
      "倒回鸡蛋，加盐调味。",
      "快速炒匀后出锅。",
    ],
    tips: "黄瓜不要炒太久，保留脆感。",
  },
  {
    id: "wintermelon-rib-soup",
    name: "冬瓜排骨汤",
    categories: ["汤", "肉菜"],
    tags: ["清淡", "60分钟", "家庭汤"],
    servings: 3,
    difficulty: "中等",
    timeMinutes: 60,
    accent: "soup2",
    description: "清甜不腻，适合家庭正餐。",
    ingredients: [
      { name: "排骨", amount: 500, unit: "克", required: true },
      { name: "冬瓜", amount: 400, unit: "克", required: true },
      { name: "姜", amount: 4, unit: "片", required: true },
    ],
    seasonings: [
      { name: "盐", amount: 4, unit: "克", pantryItem: true },
      { name: "料酒", amount: 1, unit: "勺", pantryItem: true },
    ],
    steps: [
      "排骨冷水下锅，加料酒焯水后洗净。",
      "锅中加水，放排骨和姜片炖 40 分钟。",
      "冬瓜切块后加入锅中。",
      "继续炖 15 分钟，加盐调味。",
      "冬瓜变软后即可出锅。",
    ],
    tips: "排骨焯水后汤会更清。",
  },
  {
    id: "egg-fried-rice",
    name: "蛋炒饭",
    categories: ["主食", "快手菜"],
    tags: ["10分钟", "剩饭友好", "新手友好"],
    servings: 1,
    difficulty: "简单",
    timeMinutes: 10,
    accent: "rice",
    description: "处理剩米饭的快速主食。",
    ingredients: [
      { name: "米饭", amount: 1, unit: "碗", required: true },
      { name: "鸡蛋", amount: 2, unit: "个", required: true },
      { name: "小葱", amount: 1, unit: "根", required: false },
    ],
    seasonings: [
      { name: "食用油", amount: "适量", unit: "", pantryItem: true },
      { name: "盐", amount: 2, unit: "克", pantryItem: true },
      { name: "生抽", amount: 0.5, unit: "勺", pantryItem: true },
    ],
    steps: [
      "鸡蛋打散，小葱切碎。",
      "热锅加油，炒散鸡蛋。",
      "加入米饭压散翻炒。",
      "加盐和少量生抽调味。",
      "撒葱花炒匀出锅。",
    ],
    tips: "隔夜米饭更容易炒散。",
  },
  {
    id: "braised-eggplant",
    name: "红烧茄子",
    categories: ["素菜", "下饭菜"],
    tags: ["浓香", "30分钟", "下饭菜"],
    servings: 2,
    difficulty: "中等",
    timeMinutes: 30,
    accent: "eggplant",
    description: "软糯入味，适合搭配米饭。",
    ingredients: [
      { name: "茄子", amount: 2, unit: "根", required: true },
      { name: "蒜", amount: 4, unit: "瓣", required: true },
      { name: "青椒", amount: 1, unit: "个", required: false },
    ],
    seasonings: [
      { name: "生抽", amount: 2, unit: "勺", pantryItem: true },
      { name: "老抽", amount: 0.5, unit: "勺", pantryItem: true },
      { name: "白糖", amount: 3, unit: "克", pantryItem: true },
      { name: "淀粉", amount: 1, unit: "勺", pantryItem: true },
    ],
    steps: [
      "茄子切条，蒜切末。",
      "调一碗料汁：生抽、老抽、白糖、淀粉和少量水。",
      "锅中加油，将茄子炒软。",
      "加入蒜末和青椒翻炒。",
      "倒入料汁，翻炒至浓稠即可。",
    ],
    tips: "茄子提前撒少量盐静置，可以减少吸油。",
  },
];

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

renderCategories();
renderAll();

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
