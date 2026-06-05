const POSTER_WIDTH = 1080;
const POSTER_HEIGHT = 1440;
const COLORS = {
  acid: "#D4EB5A",
  ink: "#111111",
  canvas: "#F5F4F1",
  white: "#FFFFFF",
  muted: "rgba(17, 17, 17, 0.54)",
  line: "rgba(17, 17, 17, 0.12)",
};

const shoppingPosterStyles = ["default", "default", "default", "default", "theme"];
const HUMI_ICON_URL = "/family-menu/icons/humi-icon-512.png";

export async function createTodayMenuPoster({ recipes = [], groceryCount = 0 }) {
  return createPosterBlob(async (ctx) => {
    const icon = await loadImageSafe(HUMI_ICON_URL);
    const heroRecipe = recipes[0];
    const heroImage = await loadImageSafe(heroRecipe?.image?.url);
    drawTonightTemplateA(ctx, { recipes, groceryCount, icon, heroImage });
  });
}

export async function createWeekMenuPoster({ weekPlan = {}, getRecipe }) {
  const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const plannedDays = days.map((day) => ({
    day,
    recipes: (weekPlan[day] ?? []).map((recipeId) => getRecipe(recipeId)).filter(Boolean),
  }));
  const weekRecipes = plannedDays.flatMap((day) => day.recipes.map((recipe) => ({ ...recipe, plannedDay: day.day })));
  const dishCount = weekRecipes.length;

  return createPosterBlob(async (ctx) => {
    const icon = await loadImageSafe(HUMI_ICON_URL);
    const featuredRecipes = weekRecipes.slice(0, 4);
    const featuredImages = await Promise.all(featuredRecipes.map((recipe) => loadImageSafe(recipe.image?.url)));
    drawWeeklyTemplateA(ctx, {
      icon,
      plannedDays,
      recipes: weekRecipes,
      featuredRecipes,
      featuredImages,
      dishCount,
    });
  });
}

export async function createGroceryPoster({ items = [], customItems = [] }) {
  const style = shoppingPosterStyles[Math.floor(Math.random() * shoppingPosterStyles.length)];
  return createPosterBlob(async (ctx) => {
    const icon = await loadImageSafe(HUMI_ICON_URL);
    const groups = buildShoppingPosterGroups(items, customItems);
    if (style === "theme") {
      drawShoppingThemePoster(ctx, { icon, groups });
      return;
    }
    drawShoppingDefaultPoster(ctx, { icon, groups });
  });
}

export async function sharePoster({ blob, title, filename, text }) {
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    await navigator.share({ title, text, files: [file] });
    return "shared";
  }
  downloadPoster(blob, filename);
  return "downloaded";
}

export function downloadPoster(blob, filename) {
  downloadBlob(blob, filename);
}

async function createPosterBlob(draw) {
  const canvas = document.createElement("canvas");
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const ctx = canvas.getContext("2d");
  await draw(ctx);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Poster export failed"));
    }, "image/png");
  });
}

function drawTonightTemplateA(ctx, { recipes, groceryCount, icon, heroImage }) {
  const heroRecipe = recipes[0];
  drawPaperBackground(ctx);

  if (icon) {
    drawRoundedImage(ctx, icon, 64, 58, 58, 58, 17, { fit: "cover" });
  } else {
    drawMiniLogo(ctx, 64, 58);
  }
  drawText(ctx, "HUMI", 140, 99, { size: 28, weight: 950, maxWidth: 160 });
  drawText(ctx, "Tonight", 906, 96, { size: 22, weight: 850, color: COLORS.muted, maxWidth: 120 });

  if (!heroRecipe) {
    drawEmptyTonightPoster(ctx);
    return;
  }

  const heroBox = { x: 78, y: 184, width: 924, height: 712, radius: 38 };
  ctx.save();
  ctx.shadowColor = "rgba(17, 17, 17, 0.12)";
  ctx.shadowBlur = 58;
  ctx.shadowOffsetY = 28;
  ctx.fillStyle = COLORS.white;
  roundRect(ctx, heroBox.x, heroBox.y, heroBox.width, heroBox.height, heroBox.radius, true);
  ctx.restore();

  if (heroImage) {
    const horizontalDish = isHorizontalDish(heroRecipe);
    drawRoundedImage(ctx, heroImage, heroBox.x, heroBox.y, heroBox.width, heroBox.height, heroBox.radius, {
      fit: horizontalDish ? "contain" : "cover",
      background: "#F7F3EA",
      padding: horizontalDish ? 26 : 0,
    });
  } else {
    drawDishPlaceholder(ctx, heroRecipe.name, heroBox);
  }

  drawQuestionBlock(ctx, 78, 945);
  const dishSize = heroRecipe.name.length >= 6 ? 94 : 112;
  drawText(ctx, heroRecipe.name, 78, 1100, {
    size: dishSize,
    weight: 950,
    lineHeight: dishSize + 8,
    maxWidth: 900,
    maxLines: 2,
  });

  const secondRecipe = recipes[1];
  const metadata = buildTonightMetadata(heroRecipe, secondRecipe, groceryCount);
  drawText(ctx, metadata, 82, 1190, {
    size: 29,
    weight: 900,
    color: COLORS.muted,
    maxWidth: 820,
    maxLines: 1,
  });

  drawText(ctx, "晚饭已经有着落。", 82, 1326, {
    size: 22,
    weight: 850,
    color: COLORS.muted,
    maxWidth: 420,
  });
  drawText(ctx, "HUMI", 884, 1328, {
    size: 32,
    weight: 950,
    color: COLORS.ink,
    maxWidth: 140,
  });
}

function drawPaperBackground(ctx) {
  ctx.fillStyle = COLORS.canvas;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  const glow = ctx.createRadialGradient(910, 180, 20, 910, 180, 260);
  glow.addColorStop(0, "rgba(212, 235, 90, 0.35)");
  glow.addColorStop(1, "rgba(212, 235, 90, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = "rgba(17, 17, 17, 0.035)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= POSTER_WIDTH; x += 42) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, POSTER_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= POSTER_HEIGHT; y += 42) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(POSTER_WIDTH, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMiniLogo(ctx, x, y) {
  ctx.fillStyle = COLORS.ink;
  roundRect(ctx, x, y, 58, 58, 17, true);
  drawText(ctx, "H", x + 16, y + 41, { size: 34, weight: 950, color: COLORS.acid });
}

function drawPosterHeader(ctx, { icon, dark = false }) {
  if (icon) {
    drawRoundedImage(ctx, icon, 64, 58, 58, 58, 17, { fit: "cover" });
  } else {
    drawMiniLogo(ctx, 64, 58);
  }
  drawText(ctx, "HUMI", 140, 99, {
    size: 28,
    weight: 950,
    color: dark ? COLORS.white : COLORS.ink,
    maxWidth: 160,
  });
}

function drawEmptyTonightPoster(ctx) {
  drawEmptyBlock(ctx, "回到首页点「帮我安排晚饭」", 360);
  drawQuestionBlock(ctx, 78, 945);
  drawText(ctx, "今晚还没安排", 78, 1100, {
    size: 100,
    weight: 950,
    lineHeight: 110,
    maxWidth: 900,
  });
  drawText(ctx, "HUMI", 884, 1328, { size: 32, weight: 950, maxWidth: 140 });
}

function drawQuestionBlock(ctx, x, y) {
  drawMarker(ctx, x + 4, y - 20, 320, 26);
  drawText(ctx, "今晚吃什么？", x, y, {
    size: 76,
    weight: 950,
    lineHeight: 82,
    maxWidth: 600,
  });
}

function drawMarker(ctx, x, y, width, height) {
  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate((-1.2 * Math.PI) / 180);
  ctx.fillStyle = COLORS.acid;
  roundRect(ctx, -width / 2, -height / 2, width, height, height / 2, true);
  ctx.restore();
}

function drawDishPlaceholder(ctx, title, box) {
  ctx.fillStyle = "#F7F3EA";
  roundRect(ctx, box.x, box.y, box.width, box.height, box.radius, true);
  drawCircle(ctx, box.x + box.width / 2, box.y + box.height / 2 - 30, 130, "rgba(212, 235, 90, 0.28)");
  drawText(ctx, title, box.x + 90, box.y + box.height / 2 + 70, {
    size: 54,
    weight: 950,
    color: COLORS.ink,
    maxWidth: box.width - 180,
    maxLines: 2,
  });
}

function buildTonightMetadata(recipe, secondRecipe, groceryCount) {
  const parts = [`${recipe.timeMinutes} 分钟搞定`];
  if (recipe.tags?.[0]) parts.push(recipe.tags[0]);
  if (secondRecipe) parts.push(`再配 ${secondRecipe.name}`);
  else if (groceryCount > 0) parts.push(`${groceryCount} 项待买`);
  return parts.join("  ·  ");
}

function isHorizontalDish(recipe) {
  return ["steamed-sea-bass", "braised-crucian-carp", "braised-wuchang-fish"].includes(recipe?.id);
}

function drawWeeklyTemplateA(ctx, { icon, recipes, featuredRecipes, featuredImages, dishCount }) {
  drawPaperBackground(ctx);

  if (icon) {
    drawRoundedImage(ctx, icon, 64, 58, 58, 58, 17, { fit: "cover" });
  } else {
    drawMiniLogo(ctx, 64, 58);
  }
  drawText(ctx, "HUMI", 140, 99, { size: 28, weight: 950, maxWidth: 160 });

  if (dishCount === 0) {
    drawText(ctx, "这一周", 74, 250, { size: 106, weight: 950, lineHeight: 112, maxWidth: 900 });
    drawText(ctx, "还没安排", 74, 362, { size: 106, weight: 950, lineHeight: 112, maxWidth: 900 });
    drawMarker(ctx, 80, 386, 360, 28);
    drawEmptyBlock(ctx, "回到首页，把晚饭先安排起来。", 560);
    drawText(ctx, "HUMI", 884, 1328, { size: 32, weight: 950, maxWidth: 140 });
    return;
  }

  drawText(ctx, "这一周", 72, 292, { size: 118, weight: 950, lineHeight: 116, maxWidth: 900 });
  drawText(ctx, "心里有数", 72, 406, { size: 118, weight: 950, lineHeight: 116, maxWidth: 900 });
  drawMarker(ctx, 80, 384, 492, 34);
  drawText(ctx, "晚饭先安排好，日子就松一点。", 76, 488, {
    size: 31,
    weight: 850,
    color: COLORS.muted,
    maxWidth: 760,
  });

  drawWeeklyCountLine(ctx, { dishCount });
  drawWeeklyCandidateCollage(ctx, { featuredRecipes, featuredImages });

  const extraCount = Math.max(0, recipes.length - featuredRecipes.length);
  drawText(ctx, `还有 ${extraCount} 道`, 78, 1260, {
    size: 34,
    weight: 950,
    color: COLORS.ink,
    maxWidth: 270,
  });
  drawText(ctx, "慢慢吃", 250, 1260, {
    size: 34,
    weight: 950,
    color: COLORS.muted,
    maxWidth: 180,
  });
  drawText(ctx, "把晚饭安排好，生活会轻松很多。", 78, 1326, {
    size: 22,
    weight: 850,
    color: COLORS.muted,
    maxWidth: 560,
  });
  drawText(ctx, "HUMI", 884, 1328, {
    size: 32,
    weight: 950,
    color: COLORS.ink,
    maxWidth: 140,
  });
}

function drawWeeklyCountLine(ctx, { dishCount }) {
  drawText(ctx, String(dishCount), 72, 568, {
    size: 64,
    weight: 950,
    color: COLORS.ink,
    maxWidth: 160,
  });
  drawText(ctx, "道菜 · 7 天晚饭", 154, 568, {
    size: 26,
    weight: 900,
    color: COLORS.muted,
    maxWidth: 360,
  });
}

function drawWeeklyCandidateCollage(ctx, { featuredRecipes, featuredImages }) {
  const slots = [
    { x: 48, y: 570, width: 660, height: 520, radius: 50, angle: -2.1, label: false },
    { x: 726, y: 720, width: 296, height: 238, radius: 34, angle: 2.2, label: true },
    { x: 126, y: 978, width: 286, height: 214, radius: 32, angle: 2, label: true },
    { x: 576, y: 1026, width: 354, height: 270, radius: 38, angle: -1.3, label: true },
  ];

  drawWeeklyTape(ctx, 124, 570, -8);
  drawWeeklyTape(ctx, 800, 706, 9);
  drawWeeklyTape(ctx, 250, 984, -6);
  featuredRecipes.forEach((recipe, index) => {
    const slot = slots[index];
    if (!slot) return;
    const image = featuredImages[index];
    drawWeeklyCandidatePhoto(ctx, { recipe, image, slot });
  });
}

function drawWeeklyTape(ctx, x, y, angle) {
  ctx.save();
  ctx.translate(x + 69, y + 17);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.fillStyle = "rgba(212, 235, 90, 0.78)";
  ctx.shadowColor = "rgba(17, 17, 17, 0.08)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, -69, -17, 138, 34, 17, true);
  ctx.restore();
}

function drawWeeklyCandidatePhoto(ctx, { recipe, image, slot }) {
  ctx.save();
  ctx.translate(slot.x + slot.width / 2, slot.y + slot.height / 2);
  ctx.rotate((slot.angle * Math.PI) / 180);
  ctx.shadowColor = "rgba(17, 17, 17, 0.12)";
  ctx.shadowBlur = slot.label ? 44 : 72;
  ctx.shadowOffsetY = slot.label ? 18 : 28;
  ctx.fillStyle = COLORS.white;
  roundRect(ctx, -slot.width / 2, -slot.height / 2, slot.width, slot.height, slot.radius, true);
  ctx.restore();

  ctx.save();
  ctx.translate(slot.x + slot.width / 2, slot.y + slot.height / 2);
  ctx.rotate((slot.angle * Math.PI) / 180);
  if (image) {
    const horizontalDish = isHorizontalDish(recipe);
    drawRoundedImage(ctx, image, -slot.width / 2, -slot.height / 2, slot.width, slot.height, slot.radius, {
      fit: horizontalDish ? "contain" : "cover",
      background: "#F7F3EA",
      padding: horizontalDish ? 16 : 0,
    });
  } else {
    drawDishPlaceholder(ctx, recipe.name, {
      x: -slot.width / 2,
      y: -slot.height / 2,
      width: slot.width,
      height: slot.height,
      radius: slot.radius,
    });
  }

  if (slot.label) {
    const labelWidth = Math.min(slot.width - 36, Math.max(128, recipe.name.length * 28 + 36));
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    roundRect(ctx, -slot.width / 2 + 18, slot.height / 2 - 58, labelWidth, 40, 20, true);
    drawText(ctx, recipe.name, -slot.width / 2 + 36, slot.height / 2 - 31, {
      size: 22,
      weight: 950,
      color: COLORS.ink,
      maxWidth: labelWidth - 36,
      maxLines: 1,
    });
  }
  ctx.restore();
}

function loadImageSafe(src) {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawRoundedImage(ctx, image, x, y, width, height, radius, options = {}) {
  const fit = options.fit ?? "cover";
  const padding = options.padding ?? 0;
  if (options.background) {
    ctx.fillStyle = options.background;
    roundRect(ctx, x, y, width, height, radius, true);
  }

  ctx.save();
  roundedClip(ctx, x, y, width, height, radius);
  const target = calculateImageFit({
    imageWidth: image.naturalWidth || image.width,
    imageHeight: image.naturalHeight || image.height,
    x: x + padding,
    y: y + padding,
    width: width - padding * 2,
    height: height - padding * 2,
    fit,
  });
  ctx.drawImage(image, target.x, target.y, target.width, target.height);
  ctx.restore();
}

function calculateImageFit({ imageWidth, imageHeight, x, y, width, height, fit }) {
  const imageRatio = imageWidth / imageHeight;
  const boxRatio = width / height;
  const scale =
    fit === "contain"
      ? imageRatio > boxRatio
        ? width / imageWidth
        : height / imageHeight
      : imageRatio > boxRatio
        ? height / imageHeight
        : width / imageWidth;
  const targetWidth = imageWidth * scale;
  const targetHeight = imageHeight * scale;
  return {
    x: x + (width - targetWidth) / 2,
    y: y + (height - targetHeight) / 2,
    width: targetWidth,
    height: targetHeight,
  };
}

function roundedClip(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  ctx.clip();
}

function drawPosterBase(ctx, { eyebrow, title, subtitle, style }) {
  ctx.fillStyle = COLORS.canvas;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  if (style === "market") {
    drawCircle(ctx, 935, 170, 170, COLORS.acid);
    drawCircle(ctx, 90, 1180, 230, "rgba(212, 235, 90, 0.38)");
  } else if (style === "receipt") {
    ctx.fillStyle = COLORS.white;
    roundRect(ctx, 66, 250, 948, 980, 46, true);
  } else {
    drawCircle(ctx, 920, 250, 260, "rgba(212, 235, 90, 0.5)");
  }

  drawLogo(ctx, 70, 70);
  drawPill(ctx, 70, 210, eyebrow);
  drawText(ctx, title, 70, 300, {
    size: 92,
    weight: 900,
    lineHeight: 104,
    maxWidth: 820,
  });
  drawText(ctx, subtitle, 74, 420, {
    size: 34,
    weight: 800,
    color: COLORS.muted,
    lineHeight: 48,
    maxWidth: 720,
  });
}

function drawLogo(ctx, x, y) {
  ctx.fillStyle = COLORS.ink;
  roundRect(ctx, x, y, 98, 98, 28, true);
  ctx.fillStyle = COLORS.acid;
  drawText(ctx, "H", x + 27, y + 68, { size: 58, weight: 950, color: COLORS.acid });
  drawText(ctx, "HUMI", x + 124, y + 65, { size: 42, weight: 950, color: COLORS.ink });
}

function drawMenuAutoLayout(ctx, { items, emptyText, top, bottom }) {
  const visibleItems = items.slice(0, 8);
  if (visibleItems.length === 0) {
    drawEmptyBlock(ctx, emptyText, top);
    return;
  }

  if (visibleItems.length <= 2) {
    drawHeroLayout(ctx, visibleItems, top, bottom);
    return;
  }
  if (visibleItems.length <= 4) {
    drawStandardLayout(ctx, visibleItems, top);
    return;
  }
  drawGridLayout(ctx, visibleItems, top);
}

function drawHeroLayout(ctx, items, top, bottom) {
  const cardHeight = items.length === 1 ? bottom - top : 360;
  items.forEach((item, index) => {
    const y = top + index * (cardHeight + 34);
    drawMenuCard(ctx, item, 70, y, 940, cardHeight, {
      titleSize: items.length === 1 ? 86 : 68,
      large: true,
      index,
    });
  });
}

function drawStandardLayout(ctx, items, top) {
  items.forEach((item, index) => {
    drawMenuCard(ctx, item, 70, top + index * 190, 940, 164, {
      titleSize: 54,
      index,
    });
  });
}

function drawGridLayout(ctx, items, top) {
  items.forEach((item, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    drawMenuCard(ctx, item, 70 + col * 480, top + row * 212, 450, 186, {
      titleSize: 40,
      index,
    });
  });
}

function drawMenuCard(ctx, item, x, y, width, height, { titleSize, large = false, index = 0 }) {
  ctx.fillStyle = index % 2 === 0 ? COLORS.white : COLORS.acid;
  roundRect(ctx, x, y, width, height, 42, true);

  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 3;
  roundRect(ctx, x, y, width, height, 42, false);

  const badge = item.meta || "今晚吃";
  drawPill(ctx, x + 34, y + 32, badge, {
    background: index % 2 === 0 ? COLORS.acid : COLORS.white,
    color: COLORS.ink,
  });
  drawText(ctx, item.title, x + 34, y + (large ? 150 : 108), {
    size: titleSize,
    weight: 950,
    lineHeight: titleSize + 10,
    maxWidth: width - 68,
  });
  if (item.note) {
    drawText(ctx, item.note, x + 36, y + height - (large ? 120 : 52), {
      size: large ? 30 : 24,
      weight: 800,
      color: COLORS.muted,
      lineHeight: large ? 42 : 34,
      maxWidth: width - 72,
      maxLines: large ? 2 : 1,
    });
  }
}

function drawWeekLayout(ctx, plannedDays) {
  const startY = 510;
  plannedDays.forEach((day, index) => {
    const y = startY + index * 106;
    const hasRecipes = day.recipes.length > 0;
    ctx.fillStyle = hasRecipes ? COLORS.white : "rgba(255, 255, 255, 0.52)";
    roundRect(ctx, 70, y, 940, 82, 28, true);
    ctx.fillStyle = index === new Date().getDay() - 1 ? COLORS.acid : COLORS.ink;
    roundRect(ctx, 94, y + 17, 96, 48, 24, true);
    drawText(ctx, day.day, 115, y + 50, {
      size: 24,
      weight: 950,
      color: index === new Date().getDay() - 1 ? COLORS.ink : COLORS.white,
    });
    const names = day.recipes.map((recipe) => recipe.name).join("  /  ") || "还没安排";
    drawText(ctx, names, 220, y + 52, {
      size: 31,
      weight: 900,
      color: hasRecipes ? COLORS.ink : COLORS.muted,
      maxWidth: 720,
      maxLines: 1,
    });
  });
}

function buildShoppingPosterGroups(items, customItems) {
  const regularItems = items.map((item) => ({
    name: item.name,
    type: item.type === "seasoning" || item.pantryItem ? "seasoning" : "ingredient",
  }));
  const manualItems = customItems.map((item) => ({ name: item.name, type: "ingredient" }));
  const allItems = [...regularItems, ...manualItems].filter((item) => item.name);
  const ingredients = allItems.filter((item) => item.type !== "seasoning");
  const seasonings = allItems.filter((item) => item.type === "seasoning");
  return {
    ingredients,
    seasonings,
    totalCount: allItems.length,
  };
}

function drawShoppingDefaultPoster(ctx, { icon, groups }) {
  drawPaperBackground(ctx);
  drawPosterHeader(ctx, { icon, dark: false });

  drawText(ctx, "买完这些", 86, 324, { size: 134, weight: 950, lineHeight: 136, maxWidth: 900 });
  drawText(ctx, "晚饭就稳了", 86, 456, { size: 134, weight: 950, lineHeight: 136, maxWidth: 900 });
  drawMarker(ctx, 90, 486, 470, 36);
  drawText(ctx, "照着买，回家直接开饭。", 90, 562, {
    size: 40,
    weight: 850,
    color: COLORS.muted,
    maxWidth: 760,
  });

  if (groups.totalCount === 0) {
    drawEmptyBlock(ctx, "清单还是空的，先安排一顿饭。", 650);
    drawText(ctx, "HUMI", 884, 1328, { size: 32, weight: 950, maxWidth: 140 });
    return;
  }

  const visibleIngredients = groups.ingredients.slice(0, 5);
  const visibleSeasonings = groups.seasonings.slice(0, 3);
  const hiddenCount = Math.max(0, groups.totalCount - visibleIngredients.length - visibleSeasonings.length);

  drawShoppingMemoCard(ctx, {
    x: 86,
    y: 650,
    width: 920,
    height: 560,
    ingredients: visibleIngredients,
    seasonings: visibleSeasonings,
  });
  drawText(ctx, formatShoppingHiddenCopy(hiddenCount), 90, 1274, {
    size: 32,
    weight: 850,
    color: COLORS.muted,
    maxWidth: 680,
  });
  drawText(ctx, "HUMI", 884, 1328, { size: 32, weight: 950, maxWidth: 140 });
}

function drawShoppingMemoCard(ctx, { x, y, width, height, ingredients, seasonings }) {
  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate((-0.6 * Math.PI) / 180);
  ctx.shadowColor = "rgba(17, 17, 17, 0.1)";
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 24;
  ctx.fillStyle = COLORS.white;
  roundRect(ctx, -width / 2, -height / 2, width, height, 56, true);
  ctx.restore();

  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate((-0.6 * Math.PI) / 180);
  const left = -width / 2 + 64;
  const top = -height / 2 + 62;
  drawShoppingTag(ctx, left, top, "菜篮子便签");
  drawText(ctx, "食材", left, top + 112, { size: 28, weight: 950, color: COLORS.muted, maxWidth: 160 });
  drawShoppingRows(ctx, ingredients, left, top + 166, { size: 50, rowGap: 72, boxSize: 42 });

  ctx.strokeStyle = "rgba(17, 17, 17, 0.1)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(155, -height / 2 + 150);
  ctx.lineTo(155, height / 2 - 70);
  ctx.stroke();

  drawText(ctx, "调料", 205, top + 112, { size: 28, weight: 950, color: COLORS.muted, maxWidth: 160 });
  drawShoppingRows(ctx, seasonings, 205, top + 166, {
    size: 38,
    rowGap: 62,
    boxSize: 34,
    accentBoxes: true,
    maxWidth: 210,
  });
  ctx.restore();
}

function drawShoppingThemePoster(ctx, { icon, groups }) {
  drawDarkShoppingBackground(ctx);
  drawPosterHeader(ctx, { icon, dark: true });
  drawText(ctx, "菜买好", 86, 324, { size: 126, weight: 950, lineHeight: 128, color: COLORS.white, maxWidth: 900 });
  drawText(ctx, "饭就快了", 86, 448, { size: 126, weight: 950, lineHeight: 128, color: COLORS.white, maxWidth: 900 });
  drawMarker(ctx, 90, 476, 570, 40);
  drawText(ctx, "周末这一趟，把晚饭的底气带回家。", 90, 558, {
    size: 38,
    weight: 850,
    color: "rgba(245, 244, 241, 0.64)",
    maxWidth: 820,
  });

  if (groups.totalCount === 0) {
    drawEmptyShoppingSticky(ctx, "清单还是空的，先安排一顿饭。");
    drawText(ctx, "HUMI", 884, 1328, { size: 32, weight: 950, color: COLORS.white, maxWidth: 140 });
    return;
  }

  const visibleItems = [...groups.ingredients, ...groups.seasonings].slice(0, 5);
  drawShoppingTape(ctx, 420, 610, -4);
  drawShoppingSticky(ctx, { items: visibleItems });
  drawText(ctx, "适合周末、火锅、节日前采购。", 90, 1280, {
    size: 34,
    weight: 850,
    color: "rgba(245, 244, 241, 0.68)",
    maxWidth: 660,
  });
  drawText(ctx, "HUMI", 884, 1328, { size: 32, weight: 950, color: COLORS.white, maxWidth: 140 });
}

function drawDarkShoppingBackground(ctx) {
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  const glow = ctx.createRadialGradient(870, 150, 20, 870, 150, 300);
  glow.addColorStop(0, "rgba(212, 235, 90, 0.96)");
  glow.addColorStop(0.58, "rgba(212, 235, 90, 0.9)");
  glow.addColorStop(1, "rgba(212, 235, 90, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
}

function drawEmptyShoppingSticky(ctx, text) {
  drawShoppingTape(ctx, 420, 610, -4);
  ctx.save();
  ctx.translate(540, 915);
  ctx.rotate((1.1 * Math.PI) / 180);
  ctx.fillStyle = COLORS.canvas;
  roundRect(ctx, -440, -270, 880, 540, 54, true);
  drawText(ctx, text, -340, 20, { size: 48, weight: 950, lineHeight: 62, maxWidth: 680 });
  ctx.restore();
}

function drawShoppingSticky(ctx, { items }) {
  ctx.save();
  ctx.translate(540, 915);
  ctx.rotate((1.1 * Math.PI) / 180);
  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 30;
  ctx.fillStyle = COLORS.canvas;
  roundRect(ctx, -440, -270, 880, 540, 54, true);
  ctx.restore();

  ctx.save();
  ctx.translate(540, 915);
  ctx.rotate((1.1 * Math.PI) / 180);
  drawText(ctx, "周末采购", -350, -190, { size: 30, weight: 950, color: COLORS.muted, maxWidth: 220 });
  drawShoppingRows(ctx, items, -350, -108, { size: 50, rowGap: 76, boxSize: 42, maxWidth: 520 });
  ctx.restore();
}

function drawShoppingTape(ctx, x, y, angle) {
  ctx.save();
  ctx.translate(x + 126, y + 30);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.fillStyle = COLORS.acid;
  roundRect(ctx, -126, -30, 252, 60, 30, true);
  ctx.restore();
}

function drawShoppingTag(ctx, x, y, text) {
  ctx.fillStyle = COLORS.acid;
  roundRect(ctx, x, y, 190, 56, 28, true);
  drawText(ctx, text, x + 26, y + 37, { size: 25, weight: 950, color: COLORS.ink, maxWidth: 160 });
}

function drawShoppingRows(ctx, items, x, y, options = {}) {
  const { size = 42, rowGap = 66, boxSize = 38, accentBoxes = false, maxWidth = 420 } = options;
  if (items.length === 0) {
    drawText(ctx, "家里先看一眼", x, y, { size: Math.min(size, 34), weight: 900, color: COLORS.muted, maxWidth });
    return;
  }
  items.forEach((item, index) => {
    const rowY = y + index * rowGap;
    drawShoppingBox(ctx, x, rowY - boxSize + 6, boxSize, accentBoxes);
    drawText(ctx, item.name, x + boxSize + 24, rowY, {
      size,
      weight: 950,
      color: COLORS.ink,
      maxWidth,
      maxLines: 1,
    });
  });
}

function formatShoppingHiddenCopy(hiddenCount) {
  if (hiddenCount <= 0) return "买完这一趟，晚饭轻松一点。";
  if (hiddenCount > 12) return "还有一些，路过再顺手拿。";
  return `还有 ${hiddenCount} 样，路过再顺手拿。`;
}

function drawShoppingBox(ctx, x, y, size, accent = false) {
  ctx.fillStyle = accent ? COLORS.acid : COLORS.white;
  roundRect(ctx, x, y, size, size, Math.max(8, size * 0.28), true);
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 3;
  roundRect(ctx, x, y, size, size, Math.max(8, size * 0.28), false);
}

function drawEmptyBlock(ctx, text, y) {
  ctx.fillStyle = COLORS.white;
  roundRect(ctx, 70, y, 940, 360, 44, true);
  drawText(ctx, text, 130, y + 175, {
    size: 48,
    weight: 950,
    lineHeight: 62,
    maxWidth: 760,
  });
}

function drawPill(ctx, x, y, text, options = {}) {
  ctx.font = font(24, 950);
  const width = Math.min(ctx.measureText(text).width + 48, 560);
  ctx.fillStyle = options.background ?? COLORS.ink;
  roundRect(ctx, x, y, width, 48, 24, true);
  drawText(ctx, text, x + 24, y + 32, {
    size: 24,
    weight: 950,
    color: options.color ?? COLORS.white,
    maxWidth: width - 48,
  });
}

function drawText(ctx, text, x, y, options = {}) {
  const {
    size = 28,
    weight = 800,
    color = COLORS.ink,
    lineHeight = size * 1.25,
    maxWidth = POSTER_WIDTH - x - 70,
    maxLines = 3,
  } = options;
  ctx.fillStyle = color;
  ctx.font = font(size, weight);
  ctx.textBaseline = "alphabetic";
  const lines = wrapText(ctx, String(text), maxWidth, maxLines);
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
}

function wrapText(ctx, text, maxWidth, maxLines) {
  const chars = [...text];
  const lines = [];
  let line = "";
  chars.forEach((char) => {
    const nextLine = line + char;
    if (ctx.measureText(nextLine).width <= maxWidth || line.length === 0) {
      line = nextLine;
      return;
    }
    lines.push(line);
    line = char;
  });
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const clipped = lines.slice(0, maxLines);
  const last = clipped[maxLines - 1];
  clipped[maxLines - 1] = `${last.slice(0, Math.max(1, last.length - 1))}…`;
  return clipped;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function drawCircle(ctx, x, y, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx, x, y, width, height, radius, fill) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  else ctx.stroke();
}

function font(size, weight) {
  return `${weight} ${size}px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
}
