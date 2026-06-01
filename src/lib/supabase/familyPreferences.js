import { getSupabase } from "./client";

export async function loadFamilyPreferences(familyId) {
  const supabase = await getSupabase();
  const [{ data: members, error: membersError }, { data: preferences, error: preferencesError }] =
    await Promise.all([
      supabase
        .from("family_members")
        .select("id, email, role, status, created_at")
        .eq("family_id", familyId)
        .order("created_at", { ascending: true }),
      supabase
        .from("member_preferences")
        .select("id, member_id, likes, dislikes, allergies, goals")
        .eq("family_id", familyId),
    ]);

  if (membersError) throw membersError;
  if (preferencesError) throw preferencesError;

  const preferenceByMember = new Map((preferences ?? []).map((item) => [item.member_id, item]));
  return (members ?? []).map((member) => ({
    ...member,
    preference: normalizePreference(preferenceByMember.get(member.id)),
  }));
}

export async function saveMemberPreference({ familyId, memberId, preference }) {
  const supabase = await getSupabase();
  const { error: deleteError } = await supabase
    .from("member_preferences")
    .delete()
    .eq("family_id", familyId)
    .eq("member_id", memberId);

  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase.from("member_preferences").insert({
    family_id: familyId,
    member_id: memberId,
    likes: preference.likes,
    dislikes: preference.dislikes,
    allergies: preference.allergies,
    goals: preference.goals,
  });

  if (insertError) throw insertError;
}

export async function inviteFamilyMember({ familyId, email }) {
  const supabase = await getSupabase();
  const normalizedEmail = email.trim().toLowerCase();

  const { error } = await supabase.from("family_members").insert({
    family_id: familyId,
    email: normalizedEmail,
    role: "member",
    status: "invited",
  });

  if (error) throw error;
}

export function normalizePreference(preference = {}) {
  return {
    likes: cleanList(preference.likes),
    dislikes: cleanList(preference.dislikes),
    allergies: cleanList(preference.allergies),
    goals: cleanList(preference.goals),
  };
}

export function parsePreferenceText(value) {
  return value
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function preferenceToDraft(preference) {
  return {
    likes: preference.likes.join("、"),
    dislikes: preference.dislikes.join("、"),
    allergies: preference.allergies.join("、"),
    goals: preference.goals.join("、"),
  };
}

export function draftToPreference(draft) {
  return {
    likes: parsePreferenceText(draft.likes ?? ""),
    dislikes: parsePreferenceText(draft.dislikes ?? ""),
    allergies: parsePreferenceText(draft.allergies ?? ""),
    goals: parsePreferenceText(draft.goals ?? ""),
  };
}

function cleanList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
