import fs from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.ARK_API_KEY || process.env.VOLCENGINE_API_KEY;
const MODEL = process.env.SEEDREAM_MODEL || "doubao-seedream-4-0-250828";
const API_URL =
  process.env.SEEDREAM_API_URL ||
  "https://ark.cn-beijing.volces.com/api/v3/images/generations";

const ROOT = process.cwd();
const INPUT_FILE = path.join(ROOT, "recipe-image-prompts.json");
const OUTPUT_DIR = path.join(ROOT, "public", "assets", "dishes");
const MANIFEST_FILE = path.join(OUTPUT_DIR, "manifest.json");

if (!API_KEY) {
  console.error("Missing ARK_API_KEY. Please add it to your .env or shell environment.");
  process.exit(1);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function buildPrompt(recipe) {
  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.join("、")
    : String(recipe.ingredients || "");

  return `
生成一张单道中式家常菜插画，用于 Family Menu App 的菜品卡片。

菜名：${recipe.name}
主要食材：${ingredients}
口味：${recipe.taste || ""}
分类：${recipe.category || ""}

视觉风格：
现代 Urban Family Kitchen 风格，米白纸感背景，干净留白，手绘水彩上色，细墨线勾边，轻微纸张纹理，温暖但克制，适合现代极简 App。
不要传统中餐馆菜单感，不要真实照片质感，不要 3D 渲染感，不要油腻商业摄影感。

构图要求：
单道菜居中展示，一个盘子或碗，45 度俯视角，统一盘子比例，柔和阴影，背景干净，适合 1024x1024 App 卡片裁切。

严格禁止：
不要文字，不要菜名，不要 UI 元素，不要标签，不要按钮，不要筷子，不要手，不要人物，不要桌布，不要水印。
`.trim();
}

async function downloadImage(url, outputPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download image: ${res.status} ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(arrayBuffer));
}

async function generateImage(recipe, index, total) {
  const outputPath = path.join(OUTPUT_DIR, recipe.filename);

  try {
    await fs.access(outputPath);
    console.log(`[skip] ${index + 1}/${total} ${recipe.name} -> ${recipe.filename}`);
    return;
  } catch {}

  const prompt = buildPrompt(recipe);

  console.log(`[generate] ${index + 1}/${total} ${recipe.name}`);

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      response_format: "url",
      size: "1024x1024",
      watermark: false,
      sequential_image_generation: "disabled",
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error(data);
    throw new Error(`Seedream API error: ${res.status} ${res.statusText}`);
  }

  const imageUrl =
    data?.data?.[0]?.url ||
    data?.data?.[0]?.b64_json ||
    data?.images?.[0]?.url ||
    data?.images?.[0];

  if (!imageUrl) {
    console.error(JSON.stringify(data, null, 2));
    throw new Error("No image URL returned from Seedream API.");
  }

  if (typeof imageUrl === "string" && imageUrl.startsWith("http")) {
    await downloadImage(imageUrl, outputPath);
  } else if (typeof imageUrl === "string") {
    await fs.writeFile(outputPath, Buffer.from(imageUrl, "base64"));
  } else {
    throw new Error("Unsupported image response format.");
  }

  console.log(`[saved] ${recipe.filename}`);
}

async function main() {
  await ensureDir(OUTPUT_DIR);

  const raw = await fs.readFile(INPUT_FILE, "utf-8");
  const recipes = JSON.parse(raw);

  if (!Array.isArray(recipes)) {
    throw new Error("recipe-image-prompts.json must be an array.");
  }

  const manifest = recipes.map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    category: recipe.category,
    image: `/assets/dishes/${recipe.filename}`,
  }));

  for (let i = 0; i < recipes.length; i++) {
    await generateImage(recipes[i], i, recipes.length);

    // 防止触发限流，保守等待 1.5 秒
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  await fs.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2), "utf-8");

  console.log("");
  console.log("Done.");
  console.log(`Images saved to: ${OUTPUT_DIR}`);
  console.log(`Manifest saved to: ${MANIFEST_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
