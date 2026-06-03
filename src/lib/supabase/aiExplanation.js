import { getSupabase, isSupabaseConfigured } from "./client";
import { resolveFunctionError } from "./functionError";

export async function explainRecommendation(recommendation) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke("explain-recommendation", {
    body: { recommendation },
  });

  if (error) throw await resolveFunctionError(error);
  if (data?.error) throw new Error(data.error);
  return data?.text ?? recommendation.reason;
}
