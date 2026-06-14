import fs from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.ARK_API_KEY || process.env.VOLCENGINE_API_KEY;
const MODEL = process.env.SEEDREAM_MODEL || "doubao-seedream-4-0-250828";
const API_URL =
  process.env.SEEDREAM_API_URL ||
  "https://ark.cn-beijing.volces.com/api/v3/images/generations";

const ROOT = process.cwd();
const PREVIEW_DIR = path.join(ROOT, "public", "assets", "dishes", "preview-variants");

if (!API_KEY) {
  console.error("Missing ARK_API_KEY. Please add it to your .env or shell environment.");
  process.exit(1);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

// Original prompt
function buildOriginalPrompt(recipe) {
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

// New prompt (老板要求的新风格)
function buildNewPrompt(recipe) {
  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.join("、")
    : String(recipe.ingredients || "");

  return `生成一张 Humi 菜品库素材图，不是海报，不是卡片。

菜名：${recipe.name}
主要食材：${ingredients}
口味：${recipe.taste || ""}

画风：
水彩手绘美食插画，线条自然，食物有温度和烟火气，
颜色可以比普通水彩更浓一点，酱汁有轻微光泽，但不要真实摄影感。

构图：
- 单盘菜，完整餐盘必须全部出现在画面内
- 45度轻俯视或接近俯视视角
- 菜品主体居中，占画面 62%-72%
- 四周保留稳定奶白留白（背景色 #F5F4F1）

背景：
纯奶白纸张背景，颜色接近 #F5F4F1

禁止：
不要文字，不要菜名，不要 logo，不要水印，不要边框
不要圆角卡片，不要投影/阴影，不要桌布，不要餐具装饰
不要额外排版层，不要裁切盘子，不要过近特写
不要生成海报、不要生成卡片 UI、不要生成真实摄影感
`.trim();
}

async function generateSingle(prompt, name, outputPath) {
  console.log(`[generate] ${name}`);

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
    console.error("API response:", JSON.stringify(data, null, 2));
    throw new Error(`Seedream API error: ${res.status} ${res.statusText}`);
  }

  const imageUrl =
    data?.data?.[0]?.url ||
    data?.data?.[0]?.b64_json ||
    data?.images?.[0]?.url ||
    data?.images?.[0];

  if (!imageUrl) {
    console.error("No image URL from API:", JSON.stringify(data, null, 2));
    throw new Error("No image URL returned from Seedream API.");
  }

  let buffer;
  if (typeof imageUrl === "string" && imageUrl.startsWith("http")) {
    const imgRes = await fetch(imageUrl);
    const ab = await imgRes.arrayBuffer();
    buffer = Buffer.from(ab);
  } else if (typeof imageUrl === "string") {
    buffer = Buffer.from(imageUrl, "base64");
  } else {
    throw new Error("Unsupported image response format.");
  }

  await fs.writeFile(outputPath, buffer);
  console.log(`[saved] ${path.basename(outputPath)} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);
}

async function main() {
  await ensureDir(PREVIEW_DIR);

  // 选择 2 个有代表性的菜做对比
  const testRecipes = [
    {
      name: "鱼香肉丝",
      ingredients: ["猪里脊", "胡萝卜", "青椒", "木耳"],
      taste: "鱼香酸甜微辣",
    },
    {
      name: "宫保鸡丁",
      ingredients: ["鸡腿肉", "花生米", "黄瓜", "干辣椒"],
      taste: "香辣酸甜",
    },
  ];

  for (const recipe of testRecipes) {
    // Generate original variant
    const origPrompt = buildOriginalPrompt(recipe);
    const origPath = path.join(PREVIEW_DIR, `${recipe.name}-original.png`);

    try {
      await fs.access(origPath);
      console.log(`[skip original] ${recipe.name}`);
    } catch {
      try {
        await generateSingle(origPrompt, recipe.name, origPath);
      } catch (e) {
        console.error(`[failed original] ${recipe.name}: ${e.message}`);
      }
    }

    await new Promise((r) => setTimeout(r, 2000));

    // Generate new variant
    const newPrompt = buildNewPrompt(recipe);
    const newPath = path.join(PREVIEW_DIR, `${recipe.name}-new.png`);

    try {
      await fs.access(newPath);
      console.log(`[skip new] ${recipe.name}`);
    } catch {
      try {
        await generateSingle(newPrompt, recipe.name, newPath);
      } catch (e) {
        console.error(`[failed new] ${recipe.name}: ${e.message}`);
      }
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\nDone.");
  console.log(`Preview images saved to: ${PREVIEW_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
