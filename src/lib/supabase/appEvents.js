import { getSupabase, isSupabaseConfigured } from "./client";

const SESSION_KEY = "humi:event-session-id";

export const appEvents = {
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
};

export async function trackAppEvent({ eventName, userId, familyId, payload = {} }) {
  if (!isSupabaseConfigured || !eventName) return false;

  try {
    const supabase = await getSupabase();
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const sessionUserId = sessionData?.session?.user?.id;
    if (sessionError || !sessionUserId) return false;

    const { error } = await supabase.from("app_events").insert({
      event_name: eventName,
      user_id: userId ?? sessionUserId,
      family_id: familyId ?? null,
      session_id: getEventSessionId(),
      payload,
    });

    return !error;
  } catch {
    return false;
  }
}

function getEventSessionId() {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;

  const nextId =
    window.crypto?.randomUUID?.() ??
    `humi:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(SESSION_KEY, nextId);
  return nextId;
}
