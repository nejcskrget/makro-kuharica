import { supabase } from "./supabaseClient";

export async function fetchPublishedRecipes() {
  const { data, error } = await supabase
    .from("admin_recipes")
    .select("*")
    .eq("status", "published")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapCustomRecipe);
}

function mapCustomRecipe(recipe) {
  return {
    code: recipe.code,
    title: recipe.title,
    type: recipe.meal_type,
    prepMinutes: recipe.prep_minutes,
    batch: Number(recipe.portions) || 1,
    fiber: Number(recipe.fiber) || 0,
    steps: recipe.steps,
    note: recipe.note,
    ing: Array.isArray(recipe.ingredients) ? recipe.ingredients.map(normalizeIngredient) : [],
  };
}

function normalizeIngredient(ingredient) {
  return {
    name: ingredient.name || "Sestavina",
    qty: Number(ingredient.qty) || 0,
    unit: ["g", "ml", "kos", "note"].includes(ingredient.unit) ? ingredient.unit : "g",
    rate: {
      kcal: Number(ingredient.rate?.kcal) || 0,
      p: Number(ingredient.rate?.p) || 0,
      f: Number(ingredient.rate?.f) || 0,
      c: Number(ingredient.rate?.c) || 0,
    },
    core: Boolean(ingredient.core),
    priloga: Boolean(ingredient.priloga),
  };
}
