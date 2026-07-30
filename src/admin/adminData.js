import { supabase } from "../supabaseClient";

export async function fetchAdminRecipes() {
  const { data, error } = await supabase.from("admin_recipes").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveAdminRecipe(recipe) {
  const payload = {
    ...(recipe.id ? { id: recipe.id } : {}),
    code: recipe.code.trim().toUpperCase(),
    title: recipe.title.trim(),
    meal_type: recipe.meal_type,
    prep_minutes: Number(recipe.prep_minutes) || 0,
    portions: Number(recipe.portions) || 1,
    fiber: Number(recipe.fiber) || 0,
    ingredients: recipe.ingredients,
    macros: recipe.macros,
    steps: recipe.steps.trim(),
    note: recipe.note.trim() || null,
    status: recipe.status,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("admin_recipes")
    .upsert(payload, { onConflict: "code" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchWeekPlan(userId, firstDate, lastDate) {
  const { data, error } = await supabase
    .from("day_plans")
    .select("*")
    .eq("user_id", userId)
    .gte("plan_date", firstDate)
    .lte("plan_date", lastDate);
  if (error) throw error;
  return data || [];
}

export async function saveWeekPlan(userId, days) {
  const filledDays = days.filter(hasPlanContent);
  const clearedIds = days.filter((day) => day.id && !hasPlanContent(day)).map((day) => day.id);
  const payload = filledDays.map((day) => ({
    ...(day.id ? { id: day.id } : {}),
    user_id: userId,
    plan_date: day.date,
    zajtrk_koda: day.zajtrk_koda || null,
    kosilo_koda: day.kosilo_koda || null,
    vecerja_koda: day.vecerja_koda || null,
    malice: day.malice || [],
    updated_at: new Date().toISOString(),
  }));
  const [savedResult, deletedResult] = await Promise.all([
    payload.length
      ? supabase.from("day_plans").upsert(payload, { onConflict: "user_id,plan_date" }).select()
      : Promise.resolve({ data: [], error: null }),
    clearedIds.length
      ? supabase.from("day_plans").delete().in("id", clearedIds)
      : Promise.resolve({ error: null }),
  ]);
  if (savedResult.error) throw savedResult.error;
  if (deletedResult.error) throw deletedResult.error;
  return savedResult.data || [];
}

export function hasPlanContent(day) {
  return Boolean(day.zajtrk_koda || day.kosilo_koda || day.vecerja_koda || day.malice?.length);
}
