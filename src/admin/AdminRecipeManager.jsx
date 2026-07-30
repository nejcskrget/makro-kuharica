import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  CirclePlus,
  Clock3,
  FilePenLine,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { deleteAdminRecipe, fetchAdminRecipes, saveAdminRecipe } from "./adminData";
import { DeleteRecipeDialog } from "./DeleteRecipeDialog";

const EMPTY_INGREDIENT = {
  name: "",
  qty: "",
  unit: "g",
  rate: { kcal: "", p: "", f: "", c: "" },
  core: false,
  priloga: false,
};

const EMPTY_RECIPE = {
  id: null,
  code: "",
  title: "",
  meal_type: "zajtrk-vecerja",
  prep_minutes: 15,
  portions: 1,
  fiber: 0,
  ingredients: [{ ...EMPTY_INGREDIENT, rate: { ...EMPTY_INGREDIENT.rate } }],
  steps: "",
  note: "",
  status: "draft",
};

export function AdminRecipeManager() {
  const [recipes, setRecipes] = useState([]);
  const [form, setForm] = useState(EMPTY_RECIPE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [recipeToDelete, setRecipeToDelete] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchAdminRecipes()
      .then((data) => {
        if (!cancelled) setRecipes(data);
      })
      .catch((error) => {
        if (!cancelled) setMessage({ type: "error", text: schemaErrorMessage(error) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const macros = useMemo(() => calculateMacros(form.ingredients, form.portions), [form.ingredients, form.portions]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  }

  function updateIngredient(index, field, value) {
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((ingredient, ingredientIndex) => {
        if (ingredientIndex !== index) return ingredient;
        if (field.startsWith("rate.")) {
          return { ...ingredient, rate: { ...ingredient.rate, [field.slice(5)]: value } };
        }
        if (field === "core" && value) return { ...ingredient, core: true, priloga: false };
        if (field === "priloga" && value) return { ...ingredient, priloga: true, core: false };
        return { ...ingredient, [field]: value };
      }),
    }));
  }

  function addIngredient() {
    setForm((current) => ({
      ...current,
      ingredients: [...current.ingredients, { ...EMPTY_INGREDIENT, rate: { ...EMPTY_INGREDIENT.rate } }],
    }));
  }

  function updateIngredientRole(index, role) {
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((ingredient, ingredientIndex) =>
        ingredientIndex === index
          ? { ...ingredient, core: role === "core", priloga: role === "priloga" }
          : ingredient
      ),
    }));
  }

  function removeIngredient(index) {
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.filter((_, ingredientIndex) => ingredientIndex !== index),
    }));
  }

  function startNewRecipe() {
    setForm({ ...EMPTY_RECIPE, ingredients: [{ ...EMPTY_INGREDIENT, rate: { ...EMPTY_INGREDIENT.rate } }] });
    setMessage(null);
  }

  function editRecipe(recipe) {
    setForm({
      ...recipe,
      note: recipe.note || "",
      ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    });
    setMessage(null);
  }

  async function handleSave(status) {
    const validationError = validateRecipe(form, recipes);
    if (validationError) {
      setMessage({ type: "error", text: validationError });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const normalizedIngredients = form.ingredients.map(normalizeIngredient);
      const saved = await saveAdminRecipe({
        ...form,
        status,
        ingredients: normalizedIngredients,
        macros: calculateMacros(normalizedIngredients, form.portions),
      });
      setRecipes((current) => [saved, ...current.filter((recipe) => recipe.id !== saved.id)]);
      setForm({ ...saved, note: saved.note || "" });
      setMessage({ type: "success", text: status === "published" ? "Recept je objavljen in viden strankam." : "Osnutek je shranjen." });
    } catch (error) {
      setMessage({ type: "error", text: schemaErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!recipeToDelete?.id) return;
    setDeleting(true);
    setMessage(null);
    try {
      await deleteAdminRecipe(recipeToDelete.id);
      setRecipes((current) => current.filter((recipe) => recipe.id !== recipeToDelete.id));
      setForm({ ...EMPTY_RECIPE, ingredients: [{ ...EMPTY_INGREDIENT, rate: { ...EMPTY_INGREDIENT.rate } }] });
      setRecipeToDelete(null);
      setMessage({ type: "success", text: `Recept »${recipeToDelete.title}« je izbrisan.` });
    } catch (error) {
      setRecipeToDelete(null);
      setMessage({ type: "error", text: schemaErrorMessage(error) });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="admin-workspace">
      <header className="admin-workspace__header">
        <div>
          <span>RECEPTI / UREJANJE VSEBINE</span>
          <h3>Receptna delavnica</h3>
          <p>Sestavi recept, preveri makrohranila in ga objavi neposredno strankam.</p>
        </div>
        <button className="admin-primary-button" onClick={startNewRecipe}><Plus size={16} /> Nov recept</button>
      </header>

      <div className="admin-recipe-layout">
        <aside className="admin-recipe-library">
          <div className="admin-library-heading">
            <div><BookOpen size={17} /><strong>Vsi recepti</strong></div>
            <span>{recipes.length}</span>
          </div>
          {loading ? <div className="admin-mini-loader" /> : recipes.length ? recipes.map((recipe) => (
            <button
              className={`admin-library-item ${form.id === recipe.id ? "is-selected" : ""}`}
              key={recipe.id}
              onClick={() => editRecipe(recipe)}
            >
              <span className="admin-library-item__icon"><FilePenLine size={15} /></span>
              <span className="admin-library-item__copy">
                <strong title={recipe.title}>{recipe.title}</strong>
                <small>{recipe.code} · {recipe.meal_type === "kosilo" ? "Kosilo" : "Zajtrk / večerja"}</small>
              </span>
              <i className={recipe.status === "published" ? "is-published" : ""}>{recipe.status === "published" ? "Objavljeno" : "Osnutek"}</i>
              <ChevronRight size={14} />
            </button>
          )) : <div className="admin-library-empty"><CirclePlus size={22} /><p>Prvi recept ustvari v obrazcu na desni.</p></div>}
        </aside>

        <main className="admin-recipe-editor">
          <section className="admin-editor-section">
            <EditorHeading number="01" title="Osnovni podatki" note="Jasno ime in pravilna kategorija pomagata pri načrtovanju." />
            <div className="admin-form-grid">
              <Field label="Ime recepta" className="is-wide"><input value={form.title} onChange={(event) => updateField("title", event.target.value)} placeholder="npr. Piščanec s kvinojo" /></Field>
              <Field label="Koda recepta"><input value={form.code} onChange={(event) => updateField("code", event.target.value.toUpperCase())} placeholder="npr. R-01" disabled={Boolean(form.id)} /></Field>
              <Field label="Kategorija"><select value={form.meal_type} onChange={(event) => updateField("meal_type", event.target.value)}><option value="zajtrk-vecerja">Zajtrk / večerja</option><option value="kosilo">Kosilo</option></select></Field>
              <Field label="Čas priprave"><div className="admin-input-with-unit"><Clock3 size={14} /><input type="number" min="0" value={form.prep_minutes} onChange={(event) => updateField("prep_minutes", event.target.value)} /><span>min</span></div></Field>
              <Field label="Število porcij"><input type="number" min="1" value={form.portions} onChange={(event) => updateField("portions", event.target.value)} /></Field>
              <Field label="Vlaknine na porcijo"><div className="admin-input-with-unit"><input type="number" min="0" step="0.1" value={form.fiber} onChange={(event) => updateField("fiber", event.target.value)} /><span>g</span></div></Field>
            </div>
          </section>

          <section className="admin-editor-section">
            <EditorHeading number="02" title="Sestavine" note="Vnesi hranilne vrednosti na 100 g oziroma kos; makri porcije se izračunajo samodejno." />
            <div className="admin-ingredient-table-wrap">
              <div className="admin-ingredient-table">
                <div className="admin-ingredient-row admin-ingredient-row--head"><span>Sestavina</span><span>Količina</span><span>kcal</span><span>B</span><span>M</span><span>OH</span><span>Vloga</span><span /></div>
                {form.ingredients.map((ingredient, index) => (
                  <div className="admin-ingredient-row" key={index}>
                    <input aria-label={`Sestavina ${index + 1}`} value={ingredient.name} onChange={(event) => updateIngredient(index, "name", event.target.value)} placeholder="Ime živila" />
                    <div className="admin-ingredient-quantity"><input aria-label={`Količina ${index + 1}`} type="number" min="0" value={ingredient.qty} onChange={(event) => updateIngredient(index, "qty", event.target.value)} /><select aria-label={`Enota ${index + 1}`} value={ingredient.unit} onChange={(event) => updateIngredient(index, "unit", event.target.value)}><option value="g">g</option><option value="ml">ml</option><option value="kos">kos</option></select></div>
                    {["kcal", "p", "f", "c"].map((macro) => <input key={macro} aria-label={`${macro} sestavine ${index + 1}`} type="number" min="0" step="0.1" value={ingredient.rate?.[macro] ?? ""} onChange={(event) => updateIngredient(index, `rate.${macro}`, event.target.value)} />)}
                    <select aria-label={`Vloga sestavine ${index + 1}`} value={ingredient.core ? "core" : ingredient.priloga ? "priloga" : "other"} onChange={(event) => updateIngredientRole(index, event.target.value)}><option value="other">Ostalo</option><option value="core">Glavna</option><option value="priloga">Priloga</option></select>
                    <button aria-label={`Odstrani sestavino ${index + 1}`} onClick={() => removeIngredient(index)} disabled={form.ingredients.length === 1}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
            <button className="admin-text-button" onClick={addIngredient}><Plus size={14} /> Dodaj sestavino</button>
          </section>

          <section className="admin-editor-section">
            <EditorHeading number="03" title="Makro na porcijo" note={`Izračunano za ${Number(form.portions) || 1} ${Number(form.portions) === 1 ? "porcijo" : "porcij"}.`} />
            <div className="admin-macro-grid">
              <Macro value={macros.kcal} label="Kalorije" unit="kcal" />
              <Macro value={macros.p} label="Beljakovine" unit="g" />
              <Macro value={macros.f} label="Maščobe" unit="g" />
              <Macro value={macros.c} label="Ogljikovi hidrati" unit="g" />
            </div>
          </section>

          <section className="admin-editor-section">
            <EditorHeading number="04" title="Postopek priprave" note="Zapiši kratka, jasna navodila za stranko." />
            <Field label="Navodila"><textarea rows="5" value={form.steps} onChange={(event) => updateField("steps", event.target.value)} placeholder="Opiši pripravo recepta ..." /></Field>
            <Field label="Opomba trenerja"><textarea rows="2" value={form.note} onChange={(event) => updateField("note", event.target.value)} placeholder="Neobvezna zamenjava sestavin ali nasvet." /></Field>
          </section>

          {message ? <div className={`admin-form-message is-${message.type}`}>{message.type === "success" ? <Check size={15} /> : null}{message.text}</div> : null}
          <div className="admin-editor-actions">
            {form.id ? (
              <button className="admin-danger-text-button" disabled={saving || deleting} onClick={() => setRecipeToDelete(form)}>
                <Trash2 size={15} /> Izbriši recept
              </button>
            ) : null}
            <button className="admin-secondary-button" disabled={saving} onClick={() => handleSave("draft")}><Save size={15} /> Shrani osnutek</button>
            <button className="admin-primary-button" disabled={saving} onClick={() => handleSave("published")}><Check size={15} /> {saving ? "Shranjujem ..." : "Objavi recept"}</button>
          </div>
        </main>
      </div>
      <DeleteRecipeDialog
        recipe={recipeToDelete}
        deleting={deleting}
        onCancel={() => setRecipeToDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function Field({ label, className = "", children }) {
  return <label className={`admin-field ${className}`}><span>{label}</span>{children}</label>;
}

function EditorHeading({ number, title, note }) {
  return <div className="admin-editor-heading"><span>{number}</span><div><h4>{title}</h4><p>{note}</p></div></div>;
}

function Macro({ value, label, unit }) {
  return <div><strong>{Math.round(value * 10) / 10}</strong><span>{unit}</span><small>{label}</small></div>;
}

function normalizeIngredient(ingredient) {
  return {
    name: ingredient.name.trim(),
    qty: Number(ingredient.qty) || 0,
    unit: ingredient.unit,
    rate: {
      kcal: Number(ingredient.rate?.kcal) || 0,
      p: Number(ingredient.rate?.p) || 0,
      f: Number(ingredient.rate?.f) || 0,
      c: Number(ingredient.rate?.c) || 0,
    },
    core: Boolean(ingredient.core),
    priloga: Boolean(ingredient.priloga),
    ...(ingredient.brand ? { brand: ingredient.brand } : {}),
  };
}

function calculateMacros(ingredients, portions) {
  const divisor = Number(portions) || 1;
  const totals = ingredients.reduce((result, ingredient) => {
    const quantity = Number(ingredient.qty) || 0;
    const factor = ingredient.unit === "kos" ? quantity : quantity / 100;
    return {
      kcal: result.kcal + (Number(ingredient.rate?.kcal) || 0) * factor,
      p: result.p + (Number(ingredient.rate?.p) || 0) * factor,
      f: result.f + (Number(ingredient.rate?.f) || 0) * factor,
      c: result.c + (Number(ingredient.rate?.c) || 0) * factor,
    };
  }, { kcal: 0, p: 0, f: 0, c: 0 });
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value / divisor]));
}

function validateRecipe(recipe, existingRecipes) {
  if (!recipe.title.trim()) return "Vnesi ime recepta.";
  if (!recipe.code.trim()) return "Vnesi unikatno kodo recepta.";
  if (existingRecipes.some((existing) => existing.code === recipe.code.trim().toUpperCase() && existing.id !== recipe.id)) return "Recept s to kodo že obstaja.";
  if (!recipe.ingredients.length || recipe.ingredients.some((ingredient) => !ingredient.name.trim() || !Number(ingredient.qty))) return "Vsaka sestavina potrebuje ime in količino.";
  if (!recipe.steps.trim()) return "Dodaj postopek priprave.";
  return null;
}

function schemaErrorMessage(error) {
  if (error?.code === "42P01" || error?.message?.includes("admin_recipes")) {
    return "Najprej poženi datoteko supabase-schema-admin.sql v Supabase SQL Editorju.";
  }
  return error?.message || "Prišlo je do nepričakovane napake.";
}
