# Humi Poster Design System V1

## Purpose

Humi posters are not screenshots, exports, or data reports.

They are lifestyle content people may want to send to family, friends, or a social feed:

- Tonight, this is what we are eating.
- This week, meals are loosely handled.
- For this grocery run, buy these things.

The product can contain many future poster types, so the first goal is to define a reusable design system, not to tune one perfect template.

## Core Principle

Design can explore. Generation must be template-based.

Production poster generation must use:

1. Humi recipe data
2. Humi dish images
3. Canvas templates
4. Instant PNG rendering

Production poster generation must not call an image-generation API.

## Brand Position

Humi poster content should feel like family life, not productivity software.

Keywords:

- Warm
- Clean
- Everyday
- Food-forward
- Lightly editorial
- Calm, but not boring
- Trendy, but not childish

Reference feeling:

- MUJI restraint
- Apple clarity
- Kinfolk whitespace
- Xiaohongshu food cover energy
- Monocle editorial structure
- Xiachufang food-first usefulness

## Shared Elements

### HUMI Signature

Every poster must include `HUMI`.

Use it as a quiet brand signature, usually near the bottom or a corner. Do not use it as a huge watermark.

### Brand Green

Primary accent color:

```text
#D4EB5A
```

Use it for:

- Marker underline
- Small dot
- Label background
- Highlight number
- Small brand block

Avoid using it as a full-poster background.

### Black Heavy Title

Main Chinese titles should be heavy, short, and cover-like.

They should feel like poster headlines, not UI labels.

### Marker Underline

The marker underline is a core Humi recognition element.

It should feel like a casual highlighter mark under a title or dish name. It should not look like a button background.

### Paper Texture

Base background:

```text
#F5F4F1
```

Use a subtle warm paper texture or soft grain. The poster should feel tactile, but not dirty.

### Emotional Copy

Each poster may include one short emotional line.

Good examples:

- 晚饭已经有着落。
- 这周，心里有数。
- 买完这一趟，晚饭轻松一点。
- 打开冰箱前，先把饭想好。

Avoid explaining product mechanics.

### Dish Images

Dish images are the first driver of shareability.

Rules:

- Use Humi recipe images first.
- Do not generate new dish images during sharing.
- Do not replace existing dish photos with AI-generated images.
- Cropping rules must make many dishes work, not only one ideal sample.
- If an image is weak, the template should use cropping, paper framing, blur-safe background, or partial zoom to protect the layout.

## Color System

```text
Background: #F5F4F1
Primary text: #111111
Accent green: #D4EB5A
Card white: #FFFFFF
Muted text: rgba(17, 17, 17, 0.52)
Fine line: rgba(17, 17, 17, 0.12)
```

## Typography

Hierarchy:

1. Main title
2. Dish name or poster subject
3. Emotional copy
4. Minimal data
5. HUMI signature

Rules:

- Chinese headline: very bold, short, high impact.
- English brand text: uppercase `HUMI`, compact and signature-like.
- Body copy: minimal, human, never instructional.
- Avoid dense small text.

## Information Rules

Each poster should express one core message.

Reduce information before adding decoration.

Forbidden:

- Complete database export
- Full schedule table
- Long grocery accounting list
- AI/model/algorithm details
- Technical status
- QR code as the primary visual

## Poster Types V1

### Tonight

Core message:

```text
今晚吃什么？
```

Recommended structure:

- Image 70%
- Text 30%
- 1-2 dishes shown clearly
- If more than 2 dishes, feature the main dish and mention the rest lightly.

Tone:

- Want-to-eat
- Immediate
- Food cover

#### Tonight Template A: Clean Editorial Card

This is the first production-ready Tonight template direction.

Chosen from the 10-recipe stress test because it is more stable and closer to Humi's current taste than the full-bleed magazine variants.

Structure:

- Warm paper background.
- Small official Humi app icon in the upper-left.
- Quiet `HUMI` signature near the icon.
- One large rounded dish image area in the upper half.
- `今晚吃什么？` below the image with a brand-green marker underline.
- Large dish name below the question.
- Minimal time/taste metadata.
- Bottom emotional copy and small `HUMI` signature.

Rules:

- Use Humi's existing recipe image.
- Do not generate a new dish image.
- Use `cover` image crop by default.
- Use a safer horizontal crop rule for wide dishes such as whole fish.
- Keep the image clear; do not overuse fog or heavy gradient.
- Keep metadata small. The dish image and dish name should do most of the work.

Known constraints:

- Long dish names may reduce title size.
- Horizontal dishes need a crop fallback.
- If a dish image is low quality, use the same template with conservative crop rather than creating a one-off design.

### Weekly

Core message:

```text
这一周，心里有数。
```

Recommended structure:

- Collage/image 50%
- Information 50%
- Show up to 6 dishes.
- Do not show a full Monday-to-Sunday table.
- Extra dishes should collapse into a soft phrase like `还有 7 道慢慢吃`.

Tone:

- Calm
- Family rhythm
- Magazine spread

#### Weekly Poster V1 Candidate: Lifestyle Cover

This is the confirmed production direction for weekly menu posters.

It should feel like a weekly family food cover, not a schedule table or menu export.

Structure:

- Warm paper background.
- Small official Humi app icon in the upper-left.
- Large headline: `这一周 心里有数`.
- One light count line: dish count and 7-day context.
- Four representative dish images.
- One hero dish image with no label, so the food stays clean.
- Three supporting dish images with light labels.
- Slight rotation and overlap to create a fridge-photo / lifestyle-cover feeling.
- Bottom emotional copy and `HUMI` signature.

Rules:

- Never render a Monday-to-Sunday table.
- Never show all dishes when the week is dense.
- Use up to 4 dish images.
- Collapse the rest into `还有 X 道慢慢吃`.
- The hero image should carry most of the visual weight.
- Supporting images can identify the menu mix, but should not become product cards.
- Keep the collage stable with mixed dish image shapes and menu types.
- The poster should read as a lifestyle magazine page, not a planner export.
- Future variants may change headline copy by menu type, while preserving the same system.

### Shopping

Core message:

```text
买完这些，晚饭就稳了。
```

Recommended structure:

- Checklist 70%
- Decoration 30%
- Use grocery-friendly names, not exact recipe accounting.
- Separate ingredients and seasonings.
- Show up to 5 ingredients and 3 seasonings in the default poster.
- Extra items collapse into a soft line like `还有 X 样，路过再顺手拿。`.

Tone:

- MUJI memo
- Fridge note
- Light grocery ritual

#### Shopping Poster A: MUJI Memo

This is the default production template for shopping posters.

It should feel like a family grocery memo, not a purchase report.

Structure:

- Warm paper background.
- Small official Humi app icon in the upper-left.
- Large headline: `买完这些 晚饭就稳了`.
- Brand-green marker under the title, positioned as support rather than covering the text.
- A white memo card with ingredients on the left and seasonings on the right.
- No exact spoon/count accounting in the visual hierarchy.
- Bottom emotional copy and `HUMI` signature.

Rules:

- Use this template for daily sharing by default.
- Keep the list short enough to be readable on a phone.
- Ingredient names should feel like a grocery checklist.
- Seasonings should be visually lighter than main ingredients.
- Do not show recipe-by-recipe grouping inside the poster.

#### Shopping Poster B: Fridge Note Theme

This is a secondary theme template for higher-energy sharing moments.

Use it for:

- Weekend shopping
- Hotpot night
- Holiday grocery runs
- Party or family gathering prep

Structure:

- Black background with Humi green glow.
- Large headline: `菜买好 饭就快了`.
- One tilted paper note with a short checklist.
- Green tape as a physical note cue.
- Bottom emotional copy and `HUMI` signature.

Rules:

- Do not use this as the default daily poster.
- Keep the list even shorter than the MUJI memo.
- Use it when the sharing moment needs more personality.
- It should be memorable, but not become the whole Shopping visual system.

## Future Poster Types

Future poster types should inherit the same shared elements.

Possible types:

- Recipe detail
- Family taste profile
- Inventory summary
- Recommendation result
- Holiday menu
- Fat-loss menu
- Kids menu
- Seasonal menu

Naming should stay human:

- Use `今晚适合吃`, not `AI 推荐`.
- Use `家里现有`, not `库存命中`.
- Use `还差这些`, not `采购缺口`.

## Forbidden Visuals

Do not use:

- App screenshots
- Dashboard layout
- Admin tables
- Excel-like schedules
- Course timetable structure
- More than 6 images
- More than 12 text items
- Dense cards
- Generic SaaS gradients
- Large technical labels
- Model names or AI provider names

## Production Generation Strategy

Production flow:

```text
User taps generate poster
↓
Read menu/list/week data
↓
Read Humi recipe images
↓
Apply Humi Poster Template
↓
Render Canvas PNG
↓
Preview / Save / Share
```

Constraints:

- No image-generation API calls.
- No per-dish manual templates.
- No network dependency beyond already loaded/static assets.
- Poster rendering should feel near-instant.
- Templates must handle future recipe scale: 200, 500, 1000+ dishes.

## Template Validation Rules

Every poster template must be pressure-tested with real Humi data before shipping.

### Tonight Test

Generate 10 posters from real recipes.

Include:

- Dark dishes
- Light dishes
- Soup dishes
- Meat dishes
- Vegetable dishes
- Long dish names
- Single-dish and two-dish menus

Check:

- Dish is appetizing.
- Title is readable.
- Brand feels like Humi.
- Image crop does not break.
- Long names do not overflow.
- The result does not look like an app screen.

### Weekly Test

Test:

- 3 dishes
- 6 dishes
- 12 dishes

Check:

- It does not become a table.
- It still feels like a lifestyle magazine.
- Extra dishes collapse gracefully.

### Shopping Test

Test:

- 3 items
- 8 items
- 15 items
- With seasonings
- Without seasonings

Check:

- It feels like a grocery memo.
- It does not become an accounting sheet.
- Amounts are helpful but not overly precise.

## One-Line Rule

Humi posters should turn a family meal into a piece of lifestyle content worth sharing.
