import { isHumiAiViaApiEnabled, explainRecommendationViaApi } from "../aiViaHumiApi";

export async function explainRecommendation(recommendation) {
  if (isHumiAiViaApiEnabled) {
    return explainRecommendationViaApi(recommendation);
  }
  throw new Error("精准解释 API 未开启，已回到基础说明。");
}
