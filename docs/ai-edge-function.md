# AI Recommendation Explanation Edge Function

FamilyOS 的 AI 文案解释不在前端直接调用 OpenAI。前端只把规则推荐结果发给 Supabase Edge Function，由 Edge Function 使用 `OPENAI_API_KEY` 调用 OpenAI Responses API。

## Function

- Path: `supabase/functions/explain-recommendation/index.ts`
- Input: `{ recommendation }`
- Output: `{ text, source }`
- Fallback: 前端调用失败时回退到规则解释文案。

## Required Secrets

在 Supabase 项目中配置：

```bash
supabase secrets set OPENAI_API_KEY=your_key
supabase secrets set OPENAI_MODEL=your_model
```

`OPENAI_MODEL` 不写死在仓库里，避免模型升级时需要改代码。

## Deploy

```bash
supabase functions deploy explain-recommendation
```

部署前需要本机登录 Supabase CLI，并链接到当前项目。
