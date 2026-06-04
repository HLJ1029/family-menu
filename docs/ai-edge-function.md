# DeepSeek AI Edge Functions

呼米 Humi 里所有 AI 能力都不在前端直接调用 DeepSeek。前端只把推荐上下文或本地兜底结果发给 Supabase Edge Function，由 Edge Function 使用 `DEEPSEEK_API_KEY` 调用 DeepSeek Chat Completions API。

## Functions

- AI 推荐
  - Path: `supabase/functions/recommend-meals/index.ts`
  - Input: candidate recipes, pantry items, family preferences, recent recipe ids, rule fallback.
  - Output: `{ recipeIds, reason, explanation, source }`
  - Fallback: 前端调用失败时回退到本地规则推荐。
  - Auth: 默认要求 Supabase 登录用户 JWT，避免 DeepSeek 额度被公开接口滥用。
- AI 解释
  - Path: `supabase/functions/explain-recommendation/index.ts`
  - Input: `{ recommendation }`
  - Output: `{ text, source }`
  - Fallback: 前端调用失败时回退到规则解释文案。
  - Auth: 默认要求 Supabase 登录用户 JWT。

## Required Secrets

在 Supabase 项目中配置：

```bash
supabase secrets set DEEPSEEK_API_KEY=your_key
supabase secrets set DEEPSEEK_MODEL=deepseek-v4-flash
```

`DEEPSEEK_MODEL` 默认会使用 `deepseek-v4-flash`。如果后续想测试其他 DeepSeek 模型，可以改这个 secret，不需要改前端代码。

可选配置：

```bash
supabase secrets set DEEPSEEK_BASE_URL=https://api.deepseek.com
```

## Deploy

```bash
supabase functions deploy recommend-meals
supabase functions deploy explain-recommendation
```

部署前需要本机登录 Supabase CLI，并链接到当前项目。

## References

- DeepSeek API Docs: https://api-docs.deepseek.com
- DeepSeek Chat Completions: https://api-docs.deepseek.com/api/create-chat-completion
