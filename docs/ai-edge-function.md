# DeepSeek Recommendation Explanation Edge Function

FamilyOS 的 AI 文案解释不在前端直接调用 DeepSeek。前端只把规则推荐结果发给 Supabase Edge Function，由 Edge Function 使用 `DEEPSEEK_API_KEY` 调用 DeepSeek Chat Completions API。

## Function

- Path: `supabase/functions/explain-recommendation/index.ts`
- Input: `{ recommendation }`
- Output: `{ text, source }`
- Fallback: 前端调用失败时回退到规则解释文案。

## Required Secrets

在 Supabase 项目中配置：

```bash
supabase secrets set DEEPSEEK_API_KEY=your_key
supabase secrets set DEEPSEEK_MODEL=deepseek-chat
```

`DEEPSEEK_MODEL` 默认会使用 `deepseek-chat`。如果后续想测试推理模型，可以把它改成 DeepSeek 当前支持的其他模型。

可选配置：

```bash
supabase secrets set DEEPSEEK_BASE_URL=https://api.deepseek.com
```

## Deploy

```bash
supabase functions deploy explain-recommendation
```

部署前需要本机登录 Supabase CLI，并链接到当前项目。

## References

- DeepSeek API Docs: https://api-docs.deepseek.com
- DeepSeek Chat Completions: https://api-docs.deepseek.com/api/create-chat-completion
