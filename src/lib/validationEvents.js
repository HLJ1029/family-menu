const VALIDATION_EVENTS_KEY = "humi:validation-events:v1";
const VALIDATION_SESSION_KEY = "humi:validation-session-id";

export const validationEvents = {
  homeViewed: "home_viewed",
  recommendationSeen: "recommendation_seen",
  recommendationRefreshed: "recommendation_refreshed",
  recommendationAccepted: "recommendation_accepted",
  recommendationRejected: "recommendation_rejected",
  recommendationRejectedReason: "recommendation_rejected_reason",
  dinnerSourceSelected: "dinner_source_selected",
  mealSourceSelected: "meal_source_selected",
  mealConfirmed: "meal_confirmed",
  groceryViewed: "grocery_viewed",
  groceryItemChecked: "grocery_item_checked",
  posterGenerated: "poster_generated",
  posterSavedAttempted: "poster_saved_attempted",
  posterSharedIntent: "poster_shared_intent",
  shareBridgeStage: "share_bridge_stage",
  day2Returned: "day2_returned",
  performanceMeasured: "performance_measured",
};

export const productEvents = {
  appOpen: "app_open",
  recommendationRequest: "recommendation_request",
  recommendationShown: "recommendation_shown",
  recommendationFeedback: "recommendation_feedback",
  recommendationRejected: "recommendation_rejected",
  recommendationRejectedReason: "recommendation_rejected_reason",
  recommendationAccepted: "recommendation_accepted",
  weekPlanAdd: "week_plan_add",
  share: "share",
  auth: "auth",
  familyCreated: "family_created",
  profileSaved: "profile_saved",
  effortTierViewed: "effort_tier_viewed",
  effortTierSelected: "effort_tier_selected",
  planPresented: "plan_presented",
  planAccepted: "plan_accepted",
  reminderOpened: "reminder_opened",
};

export function trackValidationEvent(eventName, payload = {}) {
  if (typeof window === "undefined" || !eventName) return null;
  const event = {
    id: `${Date.now()}:${Math.random().toString(16).slice(2)}`,
    eventName,
    payload,
    sessionId: getValidationSessionId(),
    createdAt: new Date().toISOString(),
  };
  const events = readValidationEvents();
  window.localStorage.setItem(VALIDATION_EVENTS_KEY, JSON.stringify([event, ...events].slice(0, 1000)));
  return event;
}

export function readValidationEvents() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(VALIDATION_EVENTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function buildValidationSummary(events = readValidationEvents()) {
  const count = (name) => events.filter((event) => event.eventName === name).length;
  const seen = count(validationEvents.recommendationSeen);
  const accepted = count(validationEvents.recommendationAccepted);
  const rejected = count(validationEvents.recommendationRejected);
  const rejectedWithReason = count(validationEvents.recommendationRejectedReason);
  const sources = events.filter((event) => event.eventName === validationEvents.dinnerSourceSelected);
  const reasonCounts = events
    .filter((event) => event.eventName === validationEvents.recommendationRejectedReason)
    .reduce((summary, event) => {
      const label = event.payload?.reasonLabel ?? "未说明";
      summary[label] = (summary[label] ?? 0) + 1;
      return summary;
    }, {});

  return {
    totalEvents: events.length,
    recommendationSeen: seen,
    recommendationAccepted: accepted,
    recommendationRejected: rejected,
    recommendationAcceptanceRate: seen > 0 ? Math.round((accepted / seen) * 100) : 0,
    rejectedReasonCaptureRate: rejected > 0 ? Math.round((rejectedWithReason / rejected) * 100) : 0,
    dinnerSourceSelected: sources.length,
    mealSourceSelected: count(validationEvents.mealSourceSelected),
    groceryViewed: count(validationEvents.groceryViewed),
    posterGenerated: count(validationEvents.posterGenerated),
    topRejectedReasons: Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, value]) => ({ label, value })),
  };
}

export function exportValidationData({ mealLogs = {}, familyProfile = {}, recommendationFeedback = [] } = {}) {
  const events = readValidationEvents();
  return {
    exportedAt: new Date().toISOString(),
    sessionId: getValidationSessionId(),
    summary: buildValidationSummary(events),
    events,
    mealLogs,
    familyProfile,
    recommendationFeedback,
  };
}

function getValidationSessionId() {
  const existing = window.localStorage.getItem(VALIDATION_SESSION_KEY);
  if (existing) return existing;
  const nextId =
    window.crypto?.randomUUID?.() ??
    `validation:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(VALIDATION_SESSION_KEY, nextId);
  return nextId;
}
