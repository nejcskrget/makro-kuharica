import { supabase } from "./supabaseClient";

export async function fetchPublishedRecipes() {
  const { data, error } = await supabase
    .from("admin_recipes")
    .select("*")
    .eq("status", "published")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapRecipe);
}

export async function fetchCatalogSnacks() {
  const { data, error } = await supabase
    .from("catalog_snacks")
    .select("key,name,unit,default_qty,kcal,protein,fat,carbs,category")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data || []).map((snack) => ({
    key: snack.key,
    name: snack.name,
    unit: snack.unit,
    defaultQty: Number(snack.default_qty) || 0,
    rate: {
      kcal: Number(snack.kcal) || 0,
      p: Number(snack.protein) || 0,
      f: Number(snack.fat) || 0,
      c: Number(snack.carbs) || 0,
    },
    category: snack.category,
  }));
}

function mapRecipe(recipe) {
  return {
    code: recipe.code,
    title: recipe.title,
    type: recipe.meal_type,
    prepMinutes: recipe.prep_minutes,
    batch: Number(recipe.portions) || 1,
    fiber: Number(recipe.fiber) || 0,
    original: recipe.original_summary || "",
    micro: recipe.micronutrients || {},
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
    brand: ingredient.brand || undefined,
  };
}
