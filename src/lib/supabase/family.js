import { getSupabase, isSupabaseConfigured } from "./client";

export async function getCurrentSession() {
  if (!isSupabaseConfigured) return null;
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export async function signOut() {
  const supabase = await getSupabase();
  await supabase.auth.signOut();
}

export async function ensureUserProfile(user) {
  const supabase = await getSupabase();
  const email = user.email ?? "";
  const displayName = user.user_metadata?.name ?? email.split("@")[0] ?? "FamilyOS 用户";
  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    email,
    display_name: displayName,
  });

  if (error) throw error;
}

export async function loadPrimaryFamily(user) {
  const supabase = await getSupabase();
  await ensureUserProfile(user);

  const { data, error } = await supabase
    .from("family_members")
    .select("role, status, families(id, name, owner_id, created_at)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.families
    ? {
        ...data.families,
        role: data.role,
      }
    : null;
}

export async function createFamilySpace({ user, name }) {
  const supabase = await getSupabase();
  await ensureUserProfile(user);

  const familyName = name.trim() || "我的家庭";
  const { data: family, error: familyError } = await supabase
    .from("families")
    .insert({
      name: familyName,
      owner_id: user.id,
    })
    .select("id, name, owner_id, created_at")
    .single();

  if (familyError) throw familyError;

  const { error: memberError } = await supabase.from("family_members").insert({
    family_id: family.id,
    user_id: user.id,
    email: user.email,
    role: "owner",
    status: "active",
  });

  if (memberError) throw memberError;
  return { ...family, role: "owner" };
}

export async function subscribeToAuthChanges(callback) {
  if (!isSupabaseConfigured) return () => {};
  const supabase = await getSupabase();
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session ?? null);
  });
  return () => data.subscription.unsubscribe();
}
