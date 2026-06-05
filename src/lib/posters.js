import { formatRawAmount } from "./grocery";

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

const checklistStyles = ["fresh", "market", "receipt"];
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
    const featuredRecipes = weekRecipes.slice(0, 6);
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
  const style = checklistStyles[Math.floor(Math.random() * checklistStyles.length)];
  return createPosterBlob((ctx) => {
    drawPosterBase(ctx, {
      eyebrow: "SHOPPING LIST",
      title: "购物清单",
      subtitle: "照着买，今晚就稳了。",
      style,
    });
    drawChecklist(ctx, { items, customItems, style });
    drawFooterBar(ctx, `${items.length + customItems.length} 项`, "买完一项，心里轻一点");
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
  drawText(ctx, "Week Menu", 840, 96, { size: 22, weight: 850, color: COLORS.muted, maxWidth: 180 });

  if (dishCount === 0) {
    drawText(ctx, "这一周", 74, 250, { size: 106, weight: 950, lineHeight: 112, maxWidth: 900 });
    drawText(ctx, "还没安排", 74, 362, { size: 106, weight: 950, lineHeight: 112, maxWidth: 900 });
    drawMarker(ctx, 80, 386, 360, 28);
    drawEmptyBlock(ctx, "回到首页，把晚饭先安排起来。", 560);
    drawText(ctx, "HUMI", 884, 1328, { size: 32, weight: 950, maxWidth: 140 });
    return;
  }

  drawText(ctx, "这一周", 74, 244, { size: 104, weight: 950, lineHeight: 110, maxWidth: 880 });
  drawText(ctx, "心里有数", 74, 350, { size: 104, weight: 950, lineHeight: 110, maxWidth: 880 });
  drawMarker(ctx, 78, 374, 420, 30);
  drawText(ctx, "不用每天临时想，家里的饭先有个方向。", 78, 438, {
    size: 29,
    weight: 850,
    color: COLORS.muted,
    maxWidth: 760,
  });

  drawWeeklyStats(ctx, { dishCount, extraCount: Math.max(0, recipes.length - featuredRecipes.length) });
  drawWeeklyCollage(ctx, { featuredRecipes, featuredImages });

  const names = featuredRecipes.map((recipe) => recipe.name).join("  /  ");
  drawText(ctx, names, 82, 1252, {
    size: 25,
    weight: 900,
    color: COLORS.muted,
    maxWidth: 900,
    maxLines: 2,
    lineHeight: 34,
  });
  drawText(ctx, "这一周，晚饭慢慢吃。", 82, 1326, {
    size: 22,
    weight: 850,
    color: COLORS.muted,
    maxWidth: 460,
  });
  drawText(ctx, "HUMI", 884, 1328, {
    size: 32,
    weight: 950,
    color: COLORS.ink,
    maxWidth: 140,
  });
}

function drawWeeklyStats(ctx, { dishCount, extraCount }) {
  const stats = [
    { label: "7 天", value: "本周" },
    { label: `${dishCount} 道`, value: "已安排" },
    { label: extraCount > 0 ? `还有 ${extraCount} 道` : "刚刚好", value: "慢慢吃" },
  ];

  stats.forEach((item, index) => {
    const x = 78 + index * 304;
    ctx.fillStyle = index === 1 ? COLORS.acid : COLORS.white;
    roundRect(ctx, x, 498, 270, 112, 30, true);
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 2;
    roundRect(ctx, x, 498, 270, 112, 30, false);
    drawText(ctx, item.label, x + 26, 552, { size: 38, weight: 950, maxWidth: 210 });
    drawText(ctx, item.value, x + 28, 584, { size: 21, weight: 850, color: COLORS.muted, maxWidth: 210 });
  });
}

function drawWeeklyCollage(ctx, { featuredRecipes, featuredImages }) {
  const slots = [
    { x: 78, y: 672, width: 400, height: 320, radius: 36 },
    { x: 512, y: 636, width: 490, height: 382, radius: 40 },
    { x: 78, y: 1028, width: 282, height: 178, radius: 28 },
    { x: 388, y: 1044, width: 282, height: 178, radius: 28 },
    { x: 700, y: 1040, width: 302, height: 178, radius: 28 },
    { x: 748, y: 842, width: 254, height: 164, radius: 28 },
  ];

  featuredRecipes.forEach((recipe, index) => {
    const slot = slots[index];
    if (!slot) return;
    const image = featuredImages[index];
    drawWeeklyDishCard(ctx, { recipe, image, slot, index });
  });
}

function drawWeeklyDishCard(ctx, { recipe, image, slot, index }) {
  ctx.save();
  ctx.shadowColor = "rgba(17, 17, 17, 0.12)";
  ctx.shadowBlur = index < 2 ? 54 : 32;
  ctx.shadowOffsetY = index < 2 ? 24 : 14;
  ctx.fillStyle = COLORS.white;
  roundRect(ctx, slot.x, slot.y, slot.width, slot.height, slot.radius, true);
  ctx.restore();

  if (image) {
    const horizontalDish = isHorizontalDish(recipe);
    drawRoundedImage(ctx, image, slot.x, slot.y, slot.width, slot.height, slot.radius, {
      fit: horizontalDish ? "contain" : "cover",
      background: "#F7F3EA",
      padding: horizontalDish ? 16 : 0,
    });
  } else {
    drawDishPlaceholder(ctx, recipe.name, slot);
  }

  const labelWidth = Math.min(slot.width - 34, Math.max(120, recipe.name.length * 28 + 34));
  ctx.fillStyle = index === 1 ? COLORS.acid : "rgba(255,255,255,0.9)";
  roundRect(ctx, slot.x + 16, slot.y + slot.height - 56, labelWidth, 40, 20, true);
  drawText(ctx, recipe.name, slot.x + 32, slot.y + slot.height - 29, {
    size: 22,
    weight: 950,
    color: COLORS.ink,
    maxWidth: labelWidth - 32,
    maxLines: 1,
  });
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

function drawChecklist(ctx, { items, customItems, style }) {
  const allItems = [
    ...items.slice(0, 14).map((item) => ({
      name: item.name,
      amount: formatPosterAmount(item),
      tag: item.type === "seasoning" || item.pantryItem ? "调料" : "食材",
    })),
    ...customItems.slice(0, 4).map((item) => ({ name: item.name, amount: "顺手买", tag: "其他" })),
  ].slice(0, 18);

  if (allItems.length === 0) {
    drawEmptyBlock(ctx, "清单还是空的，先安排一顿饭。", 540);
    return;
  }

  if (style === "market") {
    drawChecklistMarket(ctx, allItems);
  } else if (style === "receipt") {
    drawChecklistReceipt(ctx, allItems);
  } else {
    drawChecklistFresh(ctx, allItems);
  }
}

function drawChecklistFresh(ctx, items) {
  items.forEach((item, index) => {
    const y = 520 + index * 58;
    drawCheckBox(ctx, 84, y + 10, index);
    drawText(ctx, item.name, 138, y + 39, { size: 32, weight: 900, maxWidth: 470 });
    drawText(ctx, item.amount, 750, y + 38, { size: 24, weight: 850, color: COLORS.muted, maxWidth: 230 });
  });
}

function drawChecklistMarket(ctx, items) {
  items.forEach((item, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 70 + col * 480;
    const y = 520 + row * 128;
    ctx.fillStyle = COLORS.white;
    roundRect(ctx, x, y, 450, 102, 30, true);
    drawCheckBox(ctx, x + 24, y + 32, index);
    drawText(ctx, item.name, x + 76, y + 54, { size: 30, weight: 950, maxWidth: 270, maxLines: 1 });
    drawText(ctx, item.amount, x + 76, y + 82, { size: 20, weight: 800, color: COLORS.muted, maxWidth: 290 });
  });
}

function drawChecklistReceipt(ctx, items) {
  drawText(ctx, "BUY LIST", 96, 505, { size: 28, weight: 950, color: COLORS.muted });
  items.forEach((item, index) => {
    const y = 566 + index * 46;
    drawText(ctx, `${String(index + 1).padStart(2, "0")}. ${item.name}`, 96, y, {
      size: 28,
      weight: 900,
      maxWidth: 560,
    });
    drawText(ctx, item.amount, 780, y, { size: 22, weight: 800, color: COLORS.muted, maxWidth: 190 });
  });
}

function drawCheckBox(ctx, x, y, index) {
  ctx.fillStyle = index % 3 === 0 ? COLORS.acid : COLORS.white;
  roundRect(ctx, x, y, 34, 34, 10, true);
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 3;
  roundRect(ctx, x, y, 34, 34, 10, false);
}

function drawFooterBar(ctx, left, right) {
  ctx.fillStyle = COLORS.ink;
  roundRect(ctx, 70, 1260, 940, 104, 36, true);
  drawText(ctx, left, 110, 1322, { size: 34, weight: 950, color: COLORS.acid, maxWidth: 330 });
  drawText(ctx, right, 490, 1321, { size: 27, weight: 850, color: COLORS.white, maxWidth: 460 });
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

function formatPosterAmount(item) {
  if (item.type === "seasoning" || item.pantryItem) return "家里确认";
  if (typeof item.amount !== "number") return item.amount;
  if (["个", "颗", "根", "只", "块", "片"].includes(item.unit)) return `${item.amount}${item.unit}左右`;
  return `约 ${formatRawAmount(item)}`;
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
