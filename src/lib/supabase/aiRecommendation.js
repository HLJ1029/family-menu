import { isHumiAiViaApiEnabled, recommendMealsViaApi } from "../aiViaHumiApi";

export async function recommendMeals(context) {
  if (isHumiAiViaApiEnabled) {
    return recommendMealsViaApi(context);
  }
  throw new Error("精准推荐 API 未开启，已回到基础推荐。");
}
