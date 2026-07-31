import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ChefHat,
  Info,
  CalendarDays,
  Plus,
  X,
  RotateCcw,
  Search,
  Heart,
  Clock,
  Coffee,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Flame,
  Moon,
  Sun,
  ShoppingCart,
  Check,
  LayoutDashboard,
  NotebookPen,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import { useProfile, isProfileComplete } from "./useProfile";
import { useDailyLog, todayStr } from "./useDailyLog";
import { ProfileOnboarding } from "./ProfileOnboarding";
import { DailyCheckIn } from "./DailyCheckIn";
import { fetchCatalogSnacks, fetchPublishedRecipes } from "./catalogData";
import { PushNotificationCard } from "./notifications/PushNotificationCard";
import { SnackPickerField } from "./SnackPickerField";
import {
  DayMacroSummary,
  MealAdjustmentControl,
  SnackSection,
} from "./day-planner/DayPlannerControls";

const AdminDashboard = React.lazy(() =>
  import("./admin/AdminDashboard").then((module) => ({ default: module.AdminDashboard }))
);

/* =============================================================================
   MAKRO KUHARICA — premium prehranska aplikacija (SL)
   ---------------------------------------------------------------------------
   Ta datoteka je organizirana v jasne module, da je prehod na pravi
   TypeScript/React (Native) projekt kasneje čim lažji:

     1) TIPI (JSDoc)               — oblika podatkov (Recipe, Ingredient, ...)
     2) DIZAJN TOKENS              — barve, ki jih uporabljajo vse komponente
     3) PODATKI                    — recepti in živila iz Supabase kataloga
     4) ČISTE FUNKCIJE             — izračuni (brez React, lahko se testirajo)
     5) TRAJNO SHRANJEVANJE (hook) — priljubljeni recepti preživijo osvežitev
     6) UI GRADNIKI (atomi)        — Chip, ProgressBar, StatPill ...
     7) RECEPTI — KOMPONENTE       — kartica recepta (seznam + podrobnosti)
     8) ZASLON: RECEPTI            — iskanje, filtri, priljubljeni
     9) ZASLON: DNEVNI JEDILNIK    — obstoječa logika prilagajanja obrokov
    10) NAVIGACIJA + APP           — spodnji meni in korenska komponenta
   ========================================================================= */

/* ---------------------------------------------------------------------------
   1) TIPI (JSDoc) — dokumentira obliko podatkov brez potrebe po pravem TS-ju.
      Ko projekt preide na TypeScript, te definicije postanejo `type`/`interface`.
   ------------------------------------------------------------------------- */
/**
 * @typedef {Object} MacroRate
 * @property {number} kcal - kalorije na 100 g (ali na 1 "kos")
 * @property {number} p - beljakovine (g)
 * @property {number} f - maščobe (g)
 * @property {number} c - ogljikovi hidrati (g)
 *
 * @typedef {Object} Ingredient
 * @property {string} name
 * @property {"g"|"ml"|"kos"|"note"} unit
 * @property {number} [qty]
 * @property {MacroRate} [rate]
 * @property {boolean} [core] - glavna sestavina, se pri prilagajanju NE spreminja
 * @property {boolean} [priloga] - priloga, prva tarča pri prilagajanju obroka
 *
 * @typedef {Object} MicroNutrients
 * @property {number} vitC - vitamin C (mg)
 * @property {number} iron - železo (mg)
 * @property {number} calcium - kalcij (mg)
 * @property {number} vitD - vitamin D (µg)
 * @property {number} potassium - kalij (mg)
 * @property {number} folate - folna kislina / B9 (µg)
 *
 * @typedef {Object} Recipe
 * @property {string} code - npr. "Z/V1", "K7"
 * @property {"zajtrk-vecerja"|"kosilo"} type
 * @property {string} title
 * @property {string} original - besedilni povzetek makrohranil na obrok
 * @property {string} [note]
 * @property {number} fiber - vlaknine (g, ocena na obrok)
 * @property {MicroNutrients} [micro]
 * @property {number} [prepMinutes] - okvirni čas priprave
 * @property {number} [batch] - koliko obrokov da en "serijski" recept (privzeto 1)
 * @property {string} steps
 * @property {Ingredient[]} ing
 *
 * @typedef {Object} SnackItem
 * @property {string} name
 * @property {"g"|"ml"} unit
 * @property {number} defaultQty
 * @property {MacroRate} rate
 */

/* ---------------------------------------------------------------------------
   2) DIZAJN TOKENS
   ------------------------------------------------------------------------- */
const COLOR = {
  ink: "#20241D",
  paper: "#F6F2E9",
  card: "#FFFFFF",
  forest: "#1B3324",
  forestDark: "#12241A",
  sage: "#557A62",
  sageSoft: "#E8EEE7",
  amber: "#C98A2C",
  amberSoft: "#F3E3D3",
  line: "#E1D9C7",
  danger: "#B5533C",
};

/* ---------------------------------------------------------------------------
   3) PODATKI
   ------------------------------------------------------------------------- */

// ---------------------------------------------------------------------------
// RECEPTI — vrednosti sestavin so PRAVE standardne nutritivne vrednosti na
// 100 g/ml (ali na kos), NE umetno prilagojene. Cilji so doseženi izključno s
// smiselnimi količinami (npr. malo manj mesa + avokado za zdrave maščobe,
// namesto neresničnih količin medu ali gorčice).
// Cilji: Zajtrk/Večerja (Z/V) ≈ 450–500 kcal, 30–35 g B
//        Kosilo (K) ≈ 600–650 kcal, ≈ 40 g B
// Olivno olje = pršilo (nizkokalorično, realna raba za peko/praženje).
// Tortilja = navadna/polnozrnata Lidl tortilja, 1 kos ≈ 62 g.
// ---------------------------------------------------------------------------
// Recepti in živila za malice se nalagajo iz Supabase kataloga.
const DAY_TARGET_KCAL = 1600;

const WEEK_DAYS = [
  { key: "pon", label: "Ponedeljek" },
  { key: "tor", label: "Torek" },
  { key: "sre", label: "Sreda" },
  { key: "cet", label: "Četrtek" },
  { key: "pet", label: "Petek" },
  { key: "sob", label: "Sobota" },
  { key: "ned", label: "Nedelja" },
];
// JS Date.getDay(): 0=nedelja,1=pon,...6=sobota -> preslikava na WEEK_DAYS indeks
const JS_DAY_TO_INDEX = [6, 0, 1, 2, 3, 4, 5];

/** Za dani dan v tednu (npr. "sre") vrne pravi koledarski datum (YYYY-MM-DD) v TRENUTNEM tednu (ponedeljek-nedelja). */
function dateForWeekday(weekdayKey) {
  const idx = WEEK_DAYS.findIndex((d) => d.key === weekdayKey);
  if (idx === -1) return todayStr();
  const now = new Date();
  const todayIdx = JS_DAY_TO_INDEX[now.getDay()]; // 0=pon...6=ned
  const monday = new Date(now);
  monday.setDate(now.getDate() - todayIdx);
  const target = new Date(monday);
  target.setDate(monday.getDate() + idx);
  return target.toISOString().slice(0, 10);
}

/** Hitre ocene za "poseben dan" zunaj doma — skupaj za CEL DAN (ne samo obrok). */
const EATING_OUT_PRESETS = [
  { label: "Pica (restavracija)", kcal: 2500 },
  { label: "Burger meni", kcal: 2400 },
  { label: "McDonald's / hitra hrana", kcal: 2600 },
  { label: "Sushi", kcal: 2200 },
  { label: "Zajtrk/brunch zunaj", kcal: 2000 },
  { label: "Večerja + alkohol", kcal: 2800 },
];

/** Okvirne dnevne referenčne vrednosti mikrohranil (odrasla oseba, EU RDA-približki) */
const MICRO_RDA = {
  vitC: { label: "Vitamin C", unit: "mg", value: 90 },
  iron: { label: "Železo", unit: "mg", value: 14 },
  calcium: { label: "Kalcij", unit: "mg", value: 800 },
  vitD: { label: "Vitamin D", unit: "µg", value: 15 },
  potassium: { label: "Kalij", unit: "mg", value: 3500 },
  folate: { label: "Folna kislina (B9)", unit: "µg", value: 200 },
};

/* ---------------------------------------------------------------------------
   4) ČISTE FUNKCIJE — brez odvisnosti od React, lahko jih uporabiš/testiraš
      kjerkoli (tudi na strežniku, v React Native ...).
   ------------------------------------------------------------------------- */
function round1(x) {
  return Math.round(x * 10) / 10;
}

function contribution(ing) {
  if (ing.unit === "note") return { kcal: 0, p: 0, f: 0, c: 0 };
  const factor = ing.unit === "kos" ? ing.qty : ing.qty / 100;
  return {
    kcal: ing.rate.kcal * factor,
    p: ing.rate.p * factor,
    f: ing.rate.f * factor,
    c: ing.rate.c * factor,
  };
}

function sumContributions(list) {
  return list.reduce(
    (a, i) => {
      const c = contribution(i);
      return { kcal: a.kcal + c.kcal, p: a.p + c.p, f: a.f + c.f, c: a.c + c.c };
    },
    { kcal: 0, p: 0, f: 0, c: 0 }
  );
}

function nominalTotals(recipe) {
  const raw = sumContributions(recipe.ing);
  const batch = recipe.batch || 1;
  return { kcal: raw.kcal / batch, p: raw.p / batch, f: raw.f / batch, c: raw.c / batch };
}

function perServingIngredients(recipe) {
  const batch = recipe.batch || 1;
  if (batch === 1) return recipe.ing;
  return recipe.ing.map((i) => (i.unit === "note" ? i : { ...i, qty: round1(i.qty / batch) }));
}

/**
 * Prilagodi recept na ciljno število kalorij po kuharski logiki:
 * 1) core sestavine (meso, jajca, tuna, kruh, tortilja) se NIKOLI ne spreminjajo
 * 2) najprej se prilagodi "priloga" (riž, krompir, testenine, zelenjava ...)
 * 3) šele če to ne zadošča, se dotakne tudi omak/namazov/preostanka
 */
function scaleRecipeToTarget(recipe, targetKcal) {
  const baseIng = perServingIngredients(recipe);
  const core = baseIng.filter((i) => i.core && i.unit !== "note");
  const priloga = baseIng.filter((i) => i.priloga && !i.core && i.unit !== "note");
  const other = baseIng.filter((i) => !i.core && !i.priloga && i.unit !== "note");
  const coreC = sumContributions(core);
  const prilogaNom = sumContributions(priloga);
  const otherNom = sumContributions(other);

  let prilogaScale = 1;
  let otherScale = 1;
  if (priloga.length > 0 && prilogaNom.kcal > 0) {
    const idealPrilogaScale = (targetKcal - coreC.kcal - otherNom.kcal) / prilogaNom.kcal;
    prilogaScale = Math.min(3, Math.max(0.15, idealPrilogaScale));
    if (idealPrilogaScale < 0.15 || idealPrilogaScale > 3) {
      const otherTargetKcal = targetKcal - coreC.kcal - prilogaNom.kcal * prilogaScale;
      otherScale = otherNom.kcal > 0 ? Math.max(0, otherTargetKcal / otherNom.kcal) : 1;
    }
  } else if (other.length > 0 && otherNom.kcal > 0) {
    otherScale = Math.max(0, (targetKcal - coreC.kcal) / otherNom.kcal);
  }

  const newIng = baseIng.map((i) => {
    if (i.unit === "note" || i.core) return i;
    const scale = i.priloga ? prilogaScale : otherScale;
    return { ...i, qty: Math.max(0, round1(i.qty * scale)) };
  });
  const macros = sumContributions(newIng.filter((i) => i.unit !== "note"));
  const coreOnlyLimited = prilogaNom.kcal === 0 && otherNom.kcal === 0 && core.length > 0;
  return { ing: newIng, macros, coreOnlyLimited };
}

function sumMicro(recipes) {
  const total = { vitC: 0, iron: 0, calcium: 0, vitD: 0, potassium: 0, folate: 0 };
  recipes.forEach((r) => {
    if (!r || !r.micro) return;
    Object.keys(total).forEach((k) => (total[k] += r.micro[k] || 0));
  });
  return total;
}

function bestSourceFor(nutrientKey, excludeCodes, recipes) {
  const candidates = recipes.filter((recipe) => recipe.micro && !excludeCodes.includes(recipe.code));
  if (candidates.length === 0) return null;
  return candidates.reduce((best, r) => (r.micro[nutrientKey] > (best ? best.micro[nutrientKey] : -1) ? r : best), null);
}

/* ---------------------------------------------------------------------------
   5) TRAJNO SHRANJEVANJE — priljubljeni recepti in izbrani dnevni jedilnik
      preživijo osvežitev strani (uporabi vgrajeni window.storage vmesnik).
   ------------------------------------------------------------------------- */
function usePersistentState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const update = useCallback(
    (updater) => {
      setValue((prev) => {
        const resolved = typeof updater === "function" ? updater(prev) : updater;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // localStorage ni na voljo — ostane samo v seji
        }
        return resolved;
      });
    },
    [key]
  );

  return [value, update, true];
}

/* ---------------------------------------------------------------------------
   6) UI GRADNIKI (atomi) — majhne, ponovno uporabne komponente
   ------------------------------------------------------------------------- */
function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="text-[12px] px-3 py-1.5 rounded-full whitespace-nowrap transition-colors"
      style={{
        background: active ? COLOR.forest : COLOR.card,
        color: active ? "#FFFFFF" : COLOR.sage,
        border: `1px solid ${active ? COLOR.forest : COLOR.line}`,
        fontFamily: "Georgia, serif",
      }}
    >
      {children}
    </button>
  );
}

function StatPill({ label, value, unit, tone }) {
  return (
    <div className="text-center">
      <div className="text-[9px] uppercase tracking-wide" style={{ color: COLOR.sage }}>
        {label}
      </div>
      <div className="text-[14px]" style={{ fontFamily: "'Courier New', monospace", color: tone || COLOR.forest }}>
        {value}
        <span className="text-[10px] ml-0.5">{unit}</span>
      </div>
    </div>
  );
}

function ProgressBar({ pct, color }) {
  return (
    <div className="h-1.5 rounded-full w-full" style={{ background: COLOR.line }}>
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

function IconHeart({ active, onClick }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label="Priljubljeni"
      className="shrink-0"
    >
      <Heart size={18} fill={active ? COLOR.amber : "none"} color={active ? COLOR.amber : "#FFFFFF"} strokeWidth={1.75} />
    </button>
  );
}

/* ---------------------------------------------------------------------------
   7) RECEPTI — KOMPONENTE
   ------------------------------------------------------------------------- */
function RecipeDetail({ recipe }) {
  const [ing, setIng] = useState(recipe.ing.map((i) => ({ ...i })));

  const totals = useMemo(() => sumContributions(ing), [ing]);

  function updateQty(idx, value) {
    const v = value === "" ? "" : Math.max(0, Number(value));
    setIng((prev) => prev.map((item, i) => (i === idx ? { ...item, qty: v } : item)));
  }
  function reset() {
    setIng(recipe.ing.map((i) => ({ ...i })));
  }
  const changed = ing.some((i, idx) => i.qty !== recipe.ing[idx].qty);

  return (
    <div className="px-4 pb-4 pt-1" style={{ background: COLOR.card }}>
      {changed && (
        <div className="flex justify-end mb-2">
          <button
            onClick={reset}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-sm"
            style={{ background: COLOR.sageSoft, color: COLOR.sage }}
          >
            <RotateCcw size={12} /> Ponastavi
          </button>
        </div>
      )}
      <table className="w-full text-[13px]" style={{ fontFamily: "Georgia, serif" }}>
        <thead>
          <tr style={{ color: COLOR.sage }} className="text-[11px] uppercase tracking-wide">
            <th className="text-left font-normal pb-2">Sestavina</th>
            <th className="text-right font-normal pb-2 w-24">Količina</th>
            <th className="text-right font-normal pb-2 w-16">Kcal</th>
          </tr>
        </thead>
        <tbody>
          {ing.map((item, idx) => {
            const c = contribution(item);
            return (
              <tr key={item.name} style={{ borderTop: `1px dashed ${COLOR.line}` }}>
                <td className="py-2 pr-2">
                  <span>{item.name}</span>
                  {item.brand && (
                    <span className="block text-[10px]" style={{ color: COLOR.sage }}>
                      {item.brand}
                    </span>
                  )}
                </td>
                <td className="py-2 text-right">
                  {item.unit === "note" ? (
                    <span className="text-[12px]" style={{ color: COLOR.sage }}>
                      po želji
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 justify-end">
                      <input
                        type="number"
                        min="0"
                        value={item.qty}
                        onChange={(e) => updateQty(idx, e.target.value)}
                        className="w-14 text-right px-1.5 py-1 rounded-sm outline-none"
                        style={{ border: `1px solid ${COLOR.line}`, background: COLOR.paper, fontFamily: "'Courier New', monospace" }}
                      />
                      <span className="text-[11px]" style={{ color: COLOR.sage }}>
                        {item.unit === "kos" ? "kos" : item.unit}
                      </span>
                    </span>
                  )}
                </td>
                <td className="py-2 text-right" style={{ fontFamily: "'Courier New', monospace" }}>
                  {round1(c.kcal)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="text-[13px] mt-4 mb-3 leading-relaxed" style={{ color: COLOR.ink }}>
        <span className="font-bold">Priprava: </span>
        {recipe.steps}
      </p>
      {recipe.note && (
        <p className="text-[12px] mb-3 flex items-start gap-1.5" style={{ color: COLOR.sage }}>
          <Info size={13} className="shrink-0 mt-0.5" />
          {recipe.note}
        </p>
      )}

      <div className="grid grid-cols-5 gap-2 pt-3" style={{ borderTop: `1px solid ${COLOR.line}` }}>
        <StatPill label="Kalorije" value={round1(totals.kcal)} unit="kcal" />
        <StatPill label="Beljakovine" value={round1(totals.p)} unit="g" />
        <StatPill label="Maščobe" value={round1(totals.f)} unit="g" />
        <StatPill label="OH" value={round1(totals.c)} unit="g" />
        <StatPill label="Vlaknine*" value={recipe.fiber} unit="g" />
      </div>
    </div>
  );
}

function RecipeListCard({ recipe, isFavorite, onToggleFavorite, isOpen, onToggle }) {
  const nom = useMemo(() => nominalTotals(recipe), [recipe]);
  const typeLabel = recipe.type === "kosilo" ? "Kosilo" : "Zajtrk / Večerja";
  const typeColor = recipe.type === "kosilo" ? COLOR.amber : COLOR.sage;

  return (
    <div className="rounded-md overflow-hidden mb-3" style={{ background: COLOR.card, border: `1px solid ${COLOR.line}`, boxShadow: "0 1px 2px rgba(32,36,29,0.04)" }}>
      <button onClick={onToggle} className="w-full text-left px-4 py-3.5 flex items-start gap-3" style={{ background: COLOR.forest }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] uppercase tracking-widest" style={{ color: COLOR.amber }}>
              {recipe.code}
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.12)", color: "#CFE0D2" }}>
              {typeLabel}
            </span>
          </div>
          <h3 className="text-[16px] text-white leading-snug truncate" style={{ fontFamily: "Georgia, serif" }}>
            {recipe.title}
          </h3>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="flex items-center gap-1 text-[11px]" style={{ color: "#CFE0D2" }}>
              <Flame size={12} /> {round1(nom.kcal)} kcal
            </span>
            <span className="text-[11px]" style={{ color: "#CFE0D2" }}>
              B {round1(nom.p)} g
            </span>
            {recipe.prepMinutes && (
              <span className="flex items-center gap-1 text-[11px]" style={{ color: "#CFE0D2" }}>
                <Clock size={12} /> {recipe.prepMinutes} min
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 shrink-0">
          <IconHeart active={isFavorite} onClick={onToggleFavorite} />
          {isOpen ? <ChevronUp size={16} color="#CFE0D2" /> : <ChevronDown size={16} color="#CFE0D2" />}
        </div>
      </button>
      {isOpen && <RecipeDetail recipe={recipe} />}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   8) ZASLON: RECEPTI — iskanje, filtri po tipu, priljubljeni
   ------------------------------------------------------------------------- */
function RecipesScreen({ favorites, onToggleFavorite, onlyFavorites, recipes }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("vsi"); // vsi | zajtrk-vecerja | kosilo
  const [openCode, setOpenCode] = useState(null);

  const filtered = useMemo(() => {
    return recipes.filter((r) => {
      if (onlyFavorites && !favorites.includes(r.code)) return false;
      if (typeFilter !== "vsi" && r.type !== typeFilter) return false;
      if (query.trim()) {
        const q = normalizeSl(query.trim());
        if (!normalizeSl(r.title).includes(q) && !normalizeSl(r.code).includes(q)) return false;
      }
      return true;
    });
  }, [query, typeFilter, favorites, onlyFavorites, recipes]);

  return (
    <div>
      {!onlyFavorites && (
        <>
          <div className="relative mb-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" color={COLOR.sage} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Išči recept po imenu ali kodi ..."
              className="w-full pl-9 pr-3 py-2.5 text-[14px] rounded-full outline-none"
              style={{ border: `1px solid ${COLOR.line}`, background: COLOR.card, fontFamily: "Georgia, serif" }}
            />
          </div>
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            <Chip active={typeFilter === "vsi"} onClick={() => setTypeFilter("vsi")}>
              Vsi ({recipes.length})
            </Chip>
            <Chip active={typeFilter === "zajtrk-vecerja"} onClick={() => setTypeFilter("zajtrk-vecerja")}>
              Zajtrk / Večerja
            </Chip>
            <Chip active={typeFilter === "kosilo"} onClick={() => setTypeFilter("kosilo")}>
              Kosilo
            </Chip>
          </div>
        </>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen size={28} color={COLOR.line} className="mx-auto mb-3" />
          <p className="text-[13px]" style={{ color: COLOR.sage }}>
            {onlyFavorites ? "Še nimaš priljubljenih receptov — dotakni se srčka na receptu." : "Ni receptov, ki bi ustrezali iskanju."}
          </p>
        </div>
      ) : (
        filtered.map((r) => (
          <RecipeListCard
            key={r.code}
            recipe={r}
            isFavorite={favorites.includes(r.code)}
            onToggleFavorite={() => onToggleFavorite(r.code)}
            isOpen={openCode === r.code}
            onToggle={() => setOpenCode((prev) => (prev === r.code ? null : r.code))}
          />
        ))
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   9) ZASLON: DNEVNI JEDILNIK
   ------------------------------------------------------------------------- */
function MiniRecipeBlock({ title, badge, ing, steps, macros }) {
  return (
    <div className="rounded-sm overflow-hidden mb-4" style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}>
      <div className="px-4 py-3" style={{ background: COLOR.forest }}>
        <div className="text-[10px] uppercase tracking-widest" style={{ color: COLOR.amber }}>
          {badge}
        </div>
        <h4 className="text-[15px] text-white" style={{ fontFamily: "Georgia, serif" }}>
          {title}
        </h4>
      </div>
      <div className="px-4 py-3">
        <table className="w-full text-[12px]" style={{ fontFamily: "Georgia, serif" }}>
          <tbody>
            {ing.map((item) => (
              <tr key={item.name} style={{ borderTop: `1px dashed ${COLOR.line}` }}>
                <td className="py-1.5 pr-2">
                  {item.name}
                  {item.brand && <span style={{ color: COLOR.sage }}> · {item.brand}</span>}
                </td>
                <td className="py-1.5 text-right" style={{ fontFamily: "'Courier New', monospace", color: COLOR.sage, width: 90 }}>
                  {item.unit === "note" ? "po želji" : `${item.qty} ${item.unit === "kos" ? "kos" : item.unit}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {steps && (
          <p className="text-[12px] mt-3 leading-relaxed" style={{ color: COLOR.ink }}>
            <span className="font-bold">Priprava: </span>
            {steps}
          </p>
        )}
      </div>
      <div className="px-4 py-2 grid grid-cols-4 gap-2" style={{ background: COLOR.paper, borderTop: `1px solid ${COLOR.line}` }}>
        <StatPill label="Kcal" value={round1(macros.kcal)} unit="" />
        <StatPill label="B" value={round1(macros.p)} unit="g" />
        <StatPill label="M" value={round1(macros.f)} unit="g" />
        <StatPill label="OH" value={round1(macros.c)} unit="g" />
      </div>
    </div>
  );
}

/**
 * "Kalorijsko bančništvo" — če stranka ta teden načrtuje poseben dan
 * (restavracija, pica, burger ...), izračuna, kako razporediti kalorije čez
 * preostale dni tedna, da tedensko povprečje ostane blizu cilja.
 */
function useWeeklyBudget() {
  const [specialDay, setSpecialDay] = useState(""); // "" ali eden od WEEK_DAYS.key
  const [specialKcal, setSpecialKcal] = useState(2600);
  const [strategy, setStrategy] = useState("even"); // "even" | "concentrated"
  const [lightDays, setLightDays] = useState([]); // izbrani "lažji" dnevi za concentrated
  const [lightKcal, setLightKcal] = useState(1200);

  function toggleLightDay(dayKey) {
    setLightDays((prev) => (prev.includes(dayKey) ? prev.filter((d) => d !== dayKey) : [...prev, dayKey]));
  }

  const otherDays = WEEK_DAYS.map((d) => d.key).filter((k) => k !== specialDay);

  // predlagana vrednost za "lightKcal", da teden natancno izide na povprecje DAY_TARGET_KCAL
  const suggestedLightKcal =
    specialDay && lightDays.length > 0
      ? Math.round((DAY_TARGET_KCAL * 7 - specialKcal - (otherDays.length - lightDays.length) * DAY_TARGET_KCAL) / lightDays.length)
      : DAY_TARGET_KCAL;

  const weeklyTargets = useMemo(() => {
    if (!specialDay) {
      return Object.fromEntries(WEEK_DAYS.map((d) => [d.key, DAY_TARGET_KCAL]));
    }
    if (strategy === "even") {
      const remaining = DAY_TARGET_KCAL * 7 - specialKcal;
      const perDay = Math.round(remaining / otherDays.length);
      return Object.fromEntries(WEEK_DAYS.map((d) => [d.key, d.key === specialDay ? specialKcal : perDay]));
    }
    return Object.fromEntries(
      WEEK_DAYS.map((d) => {
        if (d.key === specialDay) return [d.key, specialKcal];
        if (lightDays.includes(d.key)) return [d.key, lightKcal];
        return [d.key, DAY_TARGET_KCAL];
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialDay, specialKcal, strategy, lightDays, lightKcal]);

  const weeklyTotal = Object.values(weeklyTargets).reduce((a, b) => a + b, 0);
  const weeklyAvg = weeklyTotal / 7;

  return {
    specialDay, setSpecialDay, specialKcal, setSpecialKcal,
    strategy, setStrategy, lightDays, toggleLightDay, lightKcal, setLightKcal,
    suggestedLightKcal, otherDays, weeklyTargets, weeklyTotal, weeklyAvg,
  };
}

function useDayPlan(targetKcal, selectedDay, recipes, snackCatalog) {
  const dayTarget = targetKcal || DAY_TARGET_KCAL;
  const breakfastRecipes = useMemo(() => recipes.filter((recipe) => recipe.type === "zajtrk-vecerja"), [recipes]);
  const lunchRecipes = useMemo(() => recipes.filter((recipe) => recipe.type === "kosilo"), [recipes]);
  const [zajtrkCode, setZajtrkCode] = useState("");
  const [kosiloCode, setKosiloCode] = useState("");
  const [vecerjaCode, setVecerjaCode] = useState("");
  const [snacks, setSnacks] = useState([]); // [{ snackIdx, qty }]
  const [mealExtras, setMealExtras] = useState({ zajtrk: [], kosilo: [], vecerja: [] });
  const [adjustSlot, setAdjustSlot] = useState("vecerja"); // "zajtrk" | "kosilo" | "vecerja"
  const loadedDayRef = useRef(null);
  const skipNextSave = useRef(false);

  // Ob prvem nalaganju in ob vsaki zamenjavi dneva v tednu naloži shranjen
  // jedilnik za TA dan (vsak dan v tednu ima svoj shranjen jedilnik).
  useEffect(() => {
    if (!selectedDay) return;
    skipNextSave.current = true;
    try {
      const raw = window.localStorage.getItem(`makrokuharica_dayplan_${selectedDay}`);
      const saved = raw ? JSON.parse(raw) : null;
      setZajtrkCode(saved?.zajtrkCode || "");
      setKosiloCode(saved?.kosiloCode || "");
      setVecerjaCode(saved?.vecerjaCode || "");
      setSnacks(saved?.snacks || []);
      setMealExtras(saved?.mealExtras || { zajtrk: [], kosilo: [], vecerja: [] });
      setAdjustSlot(saved?.adjustSlot || "vecerja");
    } catch {
      setZajtrkCode("");
      setKosiloCode("");
      setVecerjaCode("");
      setSnacks([]);
      setMealExtras({ zajtrk: [], kosilo: [], vecerja: [] });
      setAdjustSlot("vecerja");
    }
    loadedDayRef.current = selectedDay;
  }, [selectedDay]);

  // Ob vsaki spremembi izbire shrani jedilnik za trenutno izbrani dan.
  useEffect(() => {
    if (!selectedDay || loadedDayRef.current !== selectedDay) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const payload = JSON.stringify({ zajtrkCode, kosiloCode, vecerjaCode, snacks, mealExtras, adjustSlot });
    try {
      window.localStorage.setItem(`makrokuharica_dayplan_${selectedDay}`, payload);
    } catch {
      // localStorage ni na voljo — jedilnik ostane samo v seji
    }
  }, [zajtrkCode, kosiloCode, vecerjaCode, snacks, mealExtras, adjustSlot, selectedDay]);

  const zajtrk = breakfastRecipes.find((recipe) => recipe.code === zajtrkCode);
  const kosilo = lunchRecipes.find((recipe) => recipe.code === kosiloCode);
  const vecerja = breakfastRecipes.find((recipe) => recipe.code === vecerjaCode);

  function addSnack() {
    setSnacks((prev) => [...prev, { snackIdx: "", qty: "", query: "", customName: "", customKcal: "", customP: "", customF: "", customC: "" }]);
  }
  function updateSnack(idx, field, value) {
    setSnacks((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        if (field === "snackIdx") return { ...s, snackIdx: value, qty: "", query: "" };
        if (field === "query") return { ...s, snackIdx: "", query: value };
        return { ...s, [field]: value };
      })
    );
  }
  function removeSnack(idx) {
    setSnacks((prev) => prev.filter((_, i) => i !== idx));
  }

  const snackEntries = snacks
    .filter((s) => s.snackIdx !== "")
    .map((s) => {
      if (s.snackIdx === "custom") {
        const name = s.customName.trim() || "Lastno živilo";
        const rate = { kcal: Number(s.customKcal) || 0, p: Number(s.customP) || 0, f: Number(s.customF) || 0, c: Number(s.customC) || 0 };
        const qty = s.qty === "" ? 100 : Number(s.qty);
        return { item: { name, defaultQty: 100, rate }, qty, macros: contribution({ unit: "g", qty, rate }), isCustom: true };
      }
      const item = findSnack(snackCatalog, s.snackIdx);
      if (!item) return null;
      const qty = s.qty === "" ? item.defaultQty : Number(s.qty);
      return { item, qty, macros: contribution({ unit: "g", qty, rate: item.rate }), isCustom: false };
    })
    .filter(Boolean);
  const snackM = snackEntries.reduce(
    (a, e) => ({ kcal: a.kcal + e.macros.kcal, p: a.p + e.macros.p, f: a.f + e.macros.f, c: a.c + e.macros.c }),
    { kcal: 0, p: 0, f: 0, c: 0 }
  );

  const zajtrkNom = zajtrk ? nominalTotals(zajtrk) : { kcal: 0, p: 0, f: 0, c: 0 };
  const kosiloNom = kosilo ? nominalTotals(kosilo) : { kcal: 0, p: 0, f: 0, c: 0 };
  const vecerjaNom = vecerja ? nominalTotals(vecerja) : { kcal: 0, p: 0, f: 0, c: 0 };

  const slots = { zajtrk: { recipe: zajtrk, nom: zajtrkNom }, kosilo: { recipe: kosilo, nom: kosiloNom }, vecerja: { recipe: vecerja, nom: vecerjaNom } };
  const fixedKcal =
    snackM.kcal +
    Object.entries(slots)
      .filter(([key]) => key !== adjustSlot)
      .reduce((sum, [, s]) => sum + s.nom.kcal, 0);

  const adjustTarget = slots[adjustSlot];
  const remainingKcal = dayTarget - fixedKcal;
  const scaled = adjustTarget.recipe ? scaleRecipeToTarget(adjustTarget.recipe, remainingKcal) : null;

  function macrosFor(slotKey) {
    if (slotKey === adjustSlot) return scaled ? scaled.macros : { kcal: 0, p: 0, f: 0, c: 0 };
    return slots[slotKey].nom;
  }
  function ingFor(slotKey) {
    const recipe = slots[slotKey].recipe;
    if (!recipe) return [];
    return slotKey === adjustSlot ? scaled.ing : perServingIngredients(recipe);
  }

  const zajtrkM = macrosFor("zajtrk");
  const kosiloM = macrosFor("kosilo");
  const vecerjaM = macrosFor("vecerja");

  const dayTotal = {
    kcal: zajtrkM.kcal + kosiloM.kcal + vecerjaM.kcal + snackM.kcal,
    p: zajtrkM.p + kosiloM.p + vecerjaM.p + snackM.p,
    f: zajtrkM.f + kosiloM.f + vecerjaM.f + snackM.f,
    c: zajtrkM.c + kosiloM.c + vecerjaM.c + snackM.c,
  };

  const usedCodes = [zajtrk, kosilo, vecerja].filter(Boolean).map((r) => r.code);
  const microTotals = sumMicro([zajtrk, kosilo, vecerja]);
  const microRows = Object.keys(MICRO_RDA).map((key) => {
    const ref = MICRO_RDA[key];
    const value = microTotals[key];
    const pct = ref.value > 0 ? (value / ref.value) * 100 : 0;
    const low = pct < 70;
    const suggestion = low ? bestSourceFor(key, usedCodes, recipes) : null;
    return { key, ref, value, pct, low, suggestion };
  });
  const showMicro = zajtrk || kosilo || vecerja;

  const overBudget = adjustTarget.recipe && (remainingKcal < adjustTarget.nom.kcal * 0.35 || (scaled && scaled.coreOnlyLimited));
  const slotLabels = { zajtrk: "Zajtrk", kosilo: "Kosilo", vecerja: "Večerja" };

  return {
    dayTarget,
    zajtrkCode, setZajtrkCode, kosiloCode, setKosiloCode, vecerjaCode, setVecerjaCode,
    snacks, addSnack, updateSnack, removeSnack, snackEntries, snackM, mealExtras, setMealExtras,
    zajtrk, kosilo, vecerja, ingFor, zajtrkM, kosiloM, vecerjaM, dayTotal,
    microRows, showMicro, overBudget, adjustSlot, setAdjustSlot, slotLabels,
    snackCatalog,
    recipeOptions: { breakfast: breakfastRecipes, lunch: lunchRecipes },
  };
}

function WeeklyBudgetPanel({ wb, selectedDay, setSelectedDay }) {
  const [open, setOpen] = useState(Boolean(wb.specialDay));

  return (
    <div className="rounded-md overflow-hidden mb-5" style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-3" style={{ background: COLOR.forest }}>
        <span className="text-[13px] text-white" style={{ fontFamily: "Georgia, serif" }}>
          📅 Načrtovanje tedna {wb.specialDay ? "· poseben dan nastavljen" : ""}
        </span>
        {open ? <ChevronUp size={16} color="#CFE0D2" /> : <ChevronDown size={16} color="#CFE0D2" />}
      </button>
      {open && (
        <div className="px-4 py-4">
          <p className="text-[12px] mb-3" style={{ color: COLOR.sage }}>
            Ali ta teden načrtuješ kakšno posebno večerjo ali obrok zunaj doma (restavracija, pica, burger,
            McDonald's ...)? Če veš približno, koliko boš pojedel/-a tisti dan, ti aplikacija razporedi kalorije čez
            preostale dni tedna.
          </p>

          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: COLOR.sage }}>
            Kateri dan?
          </label>
          <div className="flex gap-1.5 flex-wrap mb-3">
            <button
              onClick={() => wb.setSpecialDay("")}
              className="text-[11px] px-2.5 py-1 rounded-full"
              style={{ background: wb.specialDay === "" ? COLOR.forest : COLOR.paper, color: wb.specialDay === "" ? "#FFFFFF" : COLOR.sage, border: `1px solid ${COLOR.line}` }}
            >
              Brez posebnega dne
            </button>
            {WEEK_DAYS.map((d) => (
              <button
                key={d.key}
                onClick={() => wb.setSpecialDay(d.key)}
                className="text-[11px] px-2.5 py-1 rounded-full"
                style={{ background: wb.specialDay === d.key ? COLOR.amber : COLOR.paper, color: wb.specialDay === d.key ? "#FFFFFF" : COLOR.sage, border: `1px solid ${COLOR.line}` }}
              >
                {d.label}
              </button>
            ))}
          </div>

          {wb.specialDay && (
            <>
              <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: COLOR.sage }}>
                Približno koliko kcal boš pojedel/-a TISTI DAN skupaj?
              </label>
              <div className="flex gap-1.5 flex-wrap mb-2">
                {EATING_OUT_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => wb.setSpecialKcal(p.kcal)}
                    className="text-[11px] px-2.5 py-1 rounded-full"
                    style={{ background: wb.specialKcal === p.kcal ? COLOR.forest : COLOR.paper, color: wb.specialKcal === p.kcal ? "#FFFFFF" : COLOR.sage, border: `1px solid ${COLOR.line}` }}
                  >
                    {p.label} (~{p.kcal})
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mb-4">
                <input
                  type="number"
                  value={wb.specialKcal}
                  onChange={(e) => wb.setSpecialKcal(Number(e.target.value) || 0)}
                  className="w-24 text-right text-[13px] px-2 py-1.5 rounded-sm outline-none"
                  style={{ border: `1px solid ${COLOR.line}`, background: COLOR.paper, fontFamily: "'Courier New', monospace" }}
                />
                <span className="text-[11px]" style={{ color: COLOR.sage }}>
                  kcal (ali vpiši svojo oceno)
                </span>
              </div>

              <label className="text-[10px] uppercase tracking-wide block mb-2" style={{ color: COLOR.sage }}>
                Strategija za preostale dni
              </label>
              <div className="space-y-2 mb-3">
                <button
                  onClick={() => wb.setStrategy("even")}
                  className="w-full text-left px-3 py-2.5 rounded-sm"
                  style={{ border: `1px solid ${wb.strategy === "even" ? COLOR.forest : COLOR.line}`, background: wb.strategy === "even" ? COLOR.sageSoft : COLOR.paper }}
                >
                  <div className="text-[13px]" style={{ fontFamily: "Georgia, serif", color: COLOR.ink }}>
                    Možnost 1 — Enakomerno
                  </div>
                  <div className="text-[11px]" style={{ color: COLOR.sage }}>
                    Vseh ostalih 6 dni malo manj (~{Math.round((DAY_TARGET_KCAL * 7 - wb.specialKcal) / 6)} kcal/dan namesto {DAY_TARGET_KCAL})
                  </div>
                </button>
                <button
                  onClick={() => wb.setStrategy("concentrated")}
                  className="w-full text-left px-3 py-2.5 rounded-sm"
                  style={{ border: `1px solid ${wb.strategy === "concentrated" ? COLOR.forest : COLOR.line}`, background: wb.strategy === "concentrated" ? COLOR.sageSoft : COLOR.paper }}
                >
                  <div className="text-[13px]" style={{ fontFamily: "Georgia, serif", color: COLOR.ink }}>
                    Možnost 2 — Nekaj dni bistveno manj
                  </div>
                  <div className="text-[11px]" style={{ color: COLOR.sage }}>
                    Izbrani dnevi imajo nižji cilj, ostali ostanejo pri {DAY_TARGET_KCAL} kcal (kot v tvojem primeru: 4
                    dni normalno, 2 dni manj, 1 poseben dan).
                  </div>
                </button>
              </div>

              {wb.strategy === "concentrated" && (
                <div className="mb-2">
                  <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: COLOR.sage }}>
                    Kateri dnevi naj bodo "lažji"?
                  </label>
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {WEEK_DAYS.filter((d) => d.key !== wb.specialDay).map((d) => (
                      <button
                        key={d.key}
                        onClick={() => wb.toggleLightDay(d.key)}
                        className="text-[11px] px-2.5 py-1 rounded-full"
                        style={{ background: wb.lightDays.includes(d.key) ? COLOR.sage : COLOR.paper, color: wb.lightDays.includes(d.key) ? "#FFFFFF" : COLOR.sage, border: `1px solid ${COLOR.line}` }}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px]" style={{ color: COLOR.sage }}>
                      Cilj za te dni:
                    </label>
                    <input
                      type="number"
                      value={wb.lightKcal}
                      onChange={(e) => wb.setLightKcal(Number(e.target.value) || 0)}
                      className="w-20 text-right text-[13px] px-2 py-1.5 rounded-sm outline-none"
                      style={{ border: `1px solid ${COLOR.line}`, background: COLOR.paper, fontFamily: "'Courier New', monospace" }}
                    />
                    <span className="text-[11px]" style={{ color: COLOR.sage }}>kcal</span>
                    {wb.lightDays.length > 0 && (
                      <button
                        onClick={() => wb.setLightKcal(wb.suggestedLightKcal)}
                        className="text-[10px] px-2 py-1 rounded-sm"
                        style={{ background: COLOR.amberSoft, color: "#8A4B23" }}
                      >
                        predlagano: {wb.suggestedLightKcal}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-4 rounded-sm overflow-hidden" style={{ border: `1px solid ${COLOR.line}` }}>
                <div className="grid grid-cols-7" style={{ background: COLOR.paper }}>
                  {WEEK_DAYS.map((d) => (
                    <button
                      key={d.key}
                      onClick={() => setSelectedDay(d.key)}
                      className="text-center py-2 px-1"
                      style={{ borderRight: `1px solid ${COLOR.line}`, background: selectedDay === d.key ? COLOR.sageSoft : "transparent" }}
                    >
                      <div className="text-[9px]" style={{ color: COLOR.sage }}>
                        {d.label.slice(0, 3)}
                      </div>
                      <div className="text-[12px]" style={{ fontFamily: "'Courier New', monospace", color: d.key === wb.specialDay ? COLOR.amber : COLOR.forest, fontWeight: d.key === wb.specialDay ? 700 : 400 }}>
                        {wb.weeklyTargets[d.key]}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] mt-2" style={{ color: COLOR.sage }}>
                Tedensko povprečje: <b style={{ color: COLOR.forest }}>{round1(wb.weeklyAvg)} kcal/dan</b> (cilj:{" "}
                {DAY_TARGET_KCAL}). Klikni na dan zgoraj, da zanj urediš spodnji jedilnik.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Iskalnik z živimi predlogi za izbiro živila pri malici — namesto brskanja
 * po dolgem seznamu živil uporabnik samo tipka (npr. "jog") in
 * dobi ujemajoče se predloge, na katere klikne.
 */
/** Odstrani šumnike, da iskanje najde zadetke tudi, če oseba natipka navadne črke (npr. "c" namesto "č"). */
function normalizeSl(str) {
  return str
    .toLowerCase()
    .replace(/[čć]/g, "c")
    .replace(/[š]/g, "s")
    .replace(/[žź]/g, "z")
    .replace(/[đ]/g, "d");
}

function findSnack(snackCatalog, value) {
  if (!value || value === "custom") return null;
  return snackCatalog.find((snack) => snack.key === value) || snackCatalog[Number(value)] || null;
}

function MobileMealCard({ slot, label, Icon, open, onToggle, code, setCode, options, mealExtras, setMealExtras, snackCatalog }) {
  const rows = mealExtras[slot] || [];
  const add = () => setMealExtras((prev) => ({ ...prev, [slot]: [...(prev[slot] || []), { snackIdx: "", qty: "" }] }));
  const update = (idx, field, value) => setMealExtras((prev) => ({ ...prev, [slot]: prev[slot].map((row, i) => i === idx ? { ...row, [field]: value } : row) }));
  const remove = (idx) => {
    setMealExtras((prev) => ({ ...prev, [slot]: prev[slot].filter((_, i) => i !== idx) }));
  };

  return (
    <section
      className="overflow-hidden rounded-md"
      style={{ background: COLOR.card, border: `1px solid ${open ? COLOR.forest : COLOR.line}` }}
    >
      <button className="flex w-full items-center gap-3 px-4 py-4 text-left" onClick={onToggle} type="button">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: open ? COLOR.sageSoft : COLOR.amberSoft, color: COLOR.amber }}
        >
          <Icon size={22} strokeWidth={1.8} />
        </span>
        <span
          className="flex-1 text-[18px] uppercase"
          style={{ color: COLOR.forest, fontFamily: "Georgia, serif" }}
        >
          {label}
        </span>
        {open ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
      </button>

      {open ? (
        <div className="px-4 pb-4">
          <label className="mb-1 block text-[11px]" style={{ color: COLOR.sage }}>
            Izberi recept
          </label>
          <select
            className="w-full rounded-md px-3 py-2 text-[16px] outline-none"
            onChange={(event) => setCode(event.target.value)}
            style={{ background: COLOR.paper, border: `1px solid ${COLOR.line}`, fontFamily: "Georgia, serif" }}
            value={code}
          >
            <option value="">—</option>
            {options.map((recipe) => (
              <option key={recipe.code} value={recipe.code}>
                {recipe.code} · {recipe.title}
              </option>
            ))}
          </select>

          <div className="mt-4">
            <label className="text-[11px] uppercase tracking-wide" style={{ color: COLOR.sage }}>
              Dodana živila
            </label>
            {rows.map((row, idx) => (
              <div className="mt-2 flex items-center gap-2" key={idx}>
                <SnackPickerField
                  onSelect={(value) => update(idx, "snackIdx", value)}
                  snackCatalog={snackCatalog}
                  value={findSnack(snackCatalog, row.snackIdx)?.key || row.snackIdx}
                />
                <input
                  className="w-20 rounded-md px-2 py-2 text-[15px]"
                  min="0"
                  onChange={(event) => update(idx, "qty", event.target.value)}
                  placeholder="150"
                  style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}
                  type="number"
                  value={row.qty}
                />
                <span style={{ color: COLOR.sage }}>g</span>
                <button
                  aria-label={`Odstrani živilo iz obroka ${label.toLowerCase()}`}
                  onClick={() => remove(idx)}
                  style={{ color: COLOR.danger }}
                  type="button"
                >
                  <X size={20} />
                </button>
              </div>
            ))}
            <button
              className="mt-3 w-full rounded-md py-3 text-[16px]"
              onClick={add}
              style={{ background: COLOR.paper, border: `1px solid ${COLOR.line}`, color: COLOR.ink }}
              type="button"
            >
              <Plus className="mr-2 inline" size={16} />
              Dodaj še živilo
            </button>
          </div>
        </div>
      ) : (
        <button
          className="mx-4 mb-4 w-[calc(100%-2rem)] rounded-md py-3 text-[16px]"
          onClick={onToggle}
          style={{ background: COLOR.paper, border: `1px solid ${COLOR.line}` }}
          type="button"
        >
          <Plus className="mr-2 inline" size={16} />
          Dodaj še živilo
        </button>
      )}
    </section>
  );
}

function DayPlannerScreen({ plan, wb, selectedDay, setSelectedDay }) {
  const {
    dayTarget,
    zajtrkCode, setZajtrkCode, kosiloCode, setKosiloCode, vecerjaCode, setVecerjaCode,
    snacks, addSnack, updateSnack, removeSnack, snackEntries, snackM, mealExtras, setMealExtras,
    zajtrk, kosilo, vecerja, ingFor, zajtrkM, kosiloM, vecerjaM, dayTotal,
    microRows, showMicro, overBudget, adjustSlot, setAdjustSlot, slotLabels,
    recipeOptions, snackCatalog,
  } = plan;
  const [openMeal, setOpenMeal] = useState("vecerja");

  return (
    <div>
      <WeeklyBudgetPanel wb={wb} selectedDay={selectedDay} setSelectedDay={setSelectedDay} />
      <p className="text-[11px] mb-3" style={{ color: COLOR.sage }}>
        Trenutno urejaš jedilnik za: <b style={{ color: COLOR.forest }}>{WEEK_DAYS.find((d) => d.key === selectedDay)?.label}</b>
      </p>
      <p className="text-[12px] mb-4" style={{ color: COLOR.sage }}>
        Izberi zajtrk, kosilo, večerjo in po želji malico/sladico. Določiš, kateri od treh obrokov naj se samodejno
        prilagodi, da dan skupaj znaša natanko {dayTarget} kcal. Glavne sestavine (meso, jajca, tuna, kruh,
        tortilja) pri prilagajanju ostanejo nespremenjene — spreminjajo se le priloge in ostale sestavine.
      </p>

      <div className="mb-3 space-y-3">
        <MobileMealCard slot="zajtrk" label="Zajtrk" Icon={Coffee} open={openMeal === "zajtrk"} onToggle={() => setOpenMeal(openMeal === "zajtrk" ? "" : "zajtrk")} code={zajtrkCode} setCode={setZajtrkCode} options={recipeOptions.breakfast} mealExtras={mealExtras} setMealExtras={setMealExtras} snackCatalog={snackCatalog} />
        <MobileMealCard slot="kosilo" label="Kosilo" Icon={Sun} open={openMeal === "kosilo"} onToggle={() => setOpenMeal(openMeal === "kosilo" ? "" : "kosilo")} code={kosiloCode} setCode={setKosiloCode} options={recipeOptions.lunch} mealExtras={mealExtras} setMealExtras={setMealExtras} snackCatalog={snackCatalog} />
        <MobileMealCard slot="vecerja" label="Večerja" Icon={Moon} open={openMeal === "vecerja"} onToggle={() => setOpenMeal(openMeal === "vecerja" ? "" : "vecerja")} code={vecerjaCode} setCode={setVecerjaCode} options={recipeOptions.breakfast} mealExtras={mealExtras} setMealExtras={setMealExtras} snackCatalog={snackCatalog} />
      </div>

      <MealAdjustmentControl dayTarget={dayTarget} onChange={setAdjustSlot} value={adjustSlot} />

      <SnackSection
        onAdd={addSnack}
        onRemove={removeSnack}
        onUpdate={updateSnack}
        snackCatalog={snackCatalog}
        snacks={snacks}
      />
      <DayMacroSummary
        adjustSlot={adjustSlot}
        dayTotal={dayTotal}
        overBudget={overBudget}
        slotLabels={slotLabels}
      />

      {(zajtrk || kosilo || snackEntries.length > 0 || vecerja) && (
        <div className="mt-5">
          {zajtrk && (
            <MiniRecipeBlock
              title={zajtrk.title + (adjustSlot === "zajtrk" ? " (prilagojene priloge)" : "")}
              badge={`Zajtrk · ${zajtrk.code}${adjustSlot === "zajtrk" ? " · prilagojeno" : ""}`}
              ing={ingFor("zajtrk")}
              steps={zajtrk.steps}
              macros={zajtrkM}
            />
          )}
          {kosilo && (
            <MiniRecipeBlock
              title={kosilo.title + (adjustSlot === "kosilo" ? " (prilagojene priloge)" : "")}
              badge={`Kosilo · ${kosilo.code}${adjustSlot === "kosilo" ? " · prilagojeno" : ""}`}
              ing={ingFor("kosilo")}
              steps={kosilo.steps}
              macros={kosiloM}
            />
          )}
          {snackEntries.length > 0 && (
            <MiniRecipeBlock
              title={snackEntries.map((e) => e.item.name).join(" + ")}
              badge="Malica / sladica"
              ing={snackEntries.map((e) => ({ name: e.item.name, unit: "g", qty: e.qty }))}
              steps={null}
              macros={snackM}
            />
          )}
          {vecerja && (
            <MiniRecipeBlock
              title={vecerja.title + (adjustSlot === "vecerja" ? " (prilagojene priloge)" : "")}
              badge={`Večerja · ${vecerja.code}${adjustSlot === "vecerja" ? " · prilagojeno" : ""}`}
              ing={ingFor("vecerja")}
              steps={vecerja.steps}
              macros={vecerjaM}
            />
          )}
        </div>
      )}

      {showMicro && (
        <div className="mt-5 rounded-sm overflow-hidden" style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}>
          <div className="px-4 py-3" style={{ background: COLOR.forest }}>
            <h4 className="text-[13px] text-white" style={{ fontFamily: "Georgia, serif" }}>
              Mikrohranila (ocena, iz zajtrka, kosila in večerje)
            </h4>
          </div>
          <div className="px-4 py-3 space-y-3">
            {microRows.map((row) => (
              <div key={row.key}>
                <div className="flex justify-between text-[12px] mb-1">
                  <span style={{ color: COLOR.ink }}>{row.ref.label}</span>
                  <span style={{ fontFamily: "'Courier New', monospace", color: row.low ? COLOR.danger : COLOR.sage }}>
                    {round1(row.value)} / {row.ref.value} {row.ref.unit} ({round1(row.pct)} %)
                  </span>
                </div>
                <ProgressBar pct={row.pct} color={row.low ? COLOR.danger : COLOR.sage} />
                {row.low && row.suggestion && (
                  <p className="text-[11px] mt-1" style={{ color: "#8A4B23" }}>
                    Primanjkuje {row.ref.label.toLowerCase()} — jutri poskusi{" "}
                    <b>
                      {row.suggestion.code} · {row.suggestion.title}
                    </b>{" "}
                    (dober vir tega hranila).
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] px-4 pb-3" style={{ color: COLOR.sage }}>
            Vrednosti so ocene na nivoju recepta (ne iz uradne baze mikrohranil) in ne upoštevajo morebitnih
            prehranskih dopolnil. Jemlji jih kot smerno priporočilo, ne kot natančno diagnostiko.
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   10) NAVIGACIJA + KORENSKA KOMPONENTA
   ------------------------------------------------------------------------- */
// ---------------------------------------------------------------------------
// PAKIRANJA — velikost običajnega pakiranja v trgovini + znamka + trgovina,
// za izdelke, ki se NE kupujejo na težo (mlečni izdelki, konzerve, omake,
// prigrizki ...). Sadje, riž, meso in sveža zelenjava ostanejo prikazani v
// gramih, ker se dejansko kupujejo na težo/kos po potrebi.
// ---------------------------------------------------------------------------
const PACKAGE_SIZES = {
  "Grški jogurt 2 %": { size: 150, unit: "g", label: "lonček (150 g)", brand: "Pilos (Lidl)", store: "Spar / Mercator" },
  "Grški jogurt 2 % m.m.": { size: 150, unit: "g", label: "lonček (150 g)", brand: "Pilos (Lidl)", store: "Spar / Mercator" },
  "Grški jogurt (za bešamel)": { size: 150, unit: "g", label: "lonček (150 g)", brand: "Pilos (Lidl)", store: "Spar / Mercator" },
  "Grški jogurt (za piščanca in omako)": { size: 150, unit: "g", label: "lonček (150 g)", brand: "Pilos (Lidl)", store: "Spar / Mercator" },
  "Grški jogurt z medom": { size: 150, unit: "g", label: "lonček (150 g)", brand: "Pilos (Lidl)", store: "Spar" },
  "Navadni jogurt (3,5 %)": { size: 180, unit: "g", label: "lonček (180 g)", brand: "Milbona (Lidl)", store: "Mercator / Spar" },
  "Skyr": { size: 300, unit: "g", label: "lonček (300 g)", brand: "Milbona", store: "Lidl" },
  "Skyr naraven": { size: 300, unit: "g", label: "lonček (300 g)", brand: "Milbona", store: "Lidl" },
  "Skyr sadni": { size: 150, unit: "g", label: "lonček (150 g)", brand: "Milbona", store: "Lidl" },
  "Visokobeljakovinski (High Protein) jogurt": { size: 250, unit: "g", label: "lonček (250 g)", brand: "Zott High Protein", store: "Spar / Tuš" },
  "Lahka skuta": { size: 250, unit: "g", label: "lonček (250 g)", brand: "Milbona (Lidl)", store: "Mercator" },
  "Skutni namaz (svež sir za mazanje)": { size: 150, unit: "g", label: "lonček (150 g)", brand: "Philadelphia", store: "Spar / Mercator" },
  "Skuta s sadjem": { size: 150, unit: "g", label: "lonček (150 g)", brand: "Milbona (Lidl)", store: "Mercator" },
  "Kefir": { size: 500, unit: "ml", label: "steklenica (500 ml)", brand: "Milbona (Lidl)", store: "Mercator / Spar" },
  "Mleko 1,5 %": { size: 1000, unit: "ml", label: "tetrapak (1 L)", brand: "Milbona (Lidl)", store: "Mercator / Spar" },
  "Kisla smetana 10 %": { size: 200, unit: "g", label: "lonček (200 g)", brand: "Milbona (Lidl)", store: "Mercator" },
  "Smetana za kuhanje 10 %": { size: 200, unit: "ml", label: "tetrapak (200 ml)", brand: "Milbona (Lidl)", store: "Spar / Mercator" },
  "Light mozzarella": { size: 125, unit: "g", label: "kroglica (125 g)", brand: "Milbona (Lidl)", store: "Spar" },
  "Sveža mocarela (kroglice)": { size: 150, unit: "g", label: "pakiranje (150 g)", brand: "Galbani", store: "Spar / Mercator" },
  "Parmezan": { size: 100, unit: "g", label: "vrečka naribanega (100 g)", brand: "Grand Padano (Lidl)", store: "Mercator / Spar" },
  "Sirni narezek (Gouda/Edamec)": { size: 150, unit: "g", label: "pakiranje (150 g)", brand: "Mlekarna Celeia", store: "Mercator" },
  "Proteinski puding (čokolada/vanilija)": { size: 200, unit: "g", label: "lonček (200 g)", brand: "Zott Monte Protein", store: "Spar" },
  "Proteinski puding (karamel)": { size: 200, unit: "g", label: "lonček (200 g)", brand: "Zott Monte Protein", store: "Spar" },
  "Vanilijev puding": { size: 200, unit: "g", label: "lonček (200 g)", brand: "Milbona (Lidl)", store: "Mercator" },
  "Čokoladna pena/mousse (proteinska)": { size: 150, unit: "g", label: "lonček (150 g)", brand: "Zott Monte Protein", store: "Spar" },
  "Čokoladna pena/mousse (navadna)": { size: 150, unit: "g", label: "lonček (150 g)", brand: "Milbona (Lidl)", store: "Mercator" },
  "Rdeči fižol (konzerva)": { size: 400, unit: "g", label: "konzerva (400 g)", brand: "Vemondo (Lidl)", store: "Spar / Mercator" },
  "Sušeni paradižniki": { size: 80, unit: "g", label: "kozarec (80 g)", brand: "Casa Morando (Lidl)", store: "Spar" },
  "Črne oljke": { size: 200, unit: "g", label: "kozarec (200 g)", brand: "Casa Morando (Lidl)", store: "Spar / Mercator" },
  "Paradižnikova mezga": { size: 500, unit: "g", label: "steklenica passate (500 g)", brand: "Casa Morando (Lidl)", store: "Spar / Mercator" },
  "Paradižnikova omaka/mezga": { size: 500, unit: "g", label: "steklenica passate (500 g)", brand: "Casa Morando (Lidl)", store: "Spar / Mercator" },
  "Sojina omaka": { size: 150, unit: "ml", label: "stekleničica (150 ml)", brand: "Vitasia (Lidl)", store: "Spar / Mercator" },
  "Kečap brez sladkorja": { size: 500, unit: "g", label: "steklenica (500 g)", brand: "Kania (Lidl)", store: "Spar / Mercator" },
  "Majoneza light/delight": { size: 400, unit: "g", label: "kozarec (400 g)", brand: "Kania (Lidl)", store: "Spar / Mercator" },
  "Gorčica": { size: 250, unit: "g", label: "tuba (250 g)", brand: "Kania (Lidl)", store: "Mercator / Spar" },
  "Arašidovo maslo": { size: 350, unit: "g", label: "kozarec (350 g)", brand: "Grand'Italia", store: "Spar" },
  "Lešnikov namaz (Nutella tip)": { size: 350, unit: "g", label: "kozarec (350 g)", brand: "Nutella", store: "Mercator / Spar" },
  "Marmelada/džem": { size: 350, unit: "g", label: "kozarec (350 g)", brand: "Fructal", store: "Mercator / Spar" },
  "Hummus": { size: 200, unit: "g", label: "lonček (200 g)", brand: "Kult Foods", store: "Spar" },
  "Guacamole": { size: 150, unit: "g", label: "lonček (150 g)", brand: "Casa Fiesta", store: "Spar" },
  "Med": { size: 250, unit: "g", label: "kozarec (250 g)", brand: "Medex", store: "Mercator / Spar" },
  "Milka mlečna čokolada": { size: 100, unit: "g", label: "tablica (100 g)", brand: "Milka", store: "Mercator / Spar / Lidl" },
  "Milka piškoti (Choco Biscuits)": { size: 150, unit: "g", label: "vrečka (150 g)", brand: "Milka", store: "Mercator / Spar" },
  "Temna čokolada (70 %)": { size: 100, unit: "g", label: "tablica (100 g)", brand: "Gorenjka", store: "Mercator / Spar" },
  "Krekerji (slani)": { size: 100, unit: "g", label: "vrečka (100 g)", brand: "Kraš", store: "Mercator / Spar" },
  "Grisini": { size: 125, unit: "g", label: "vrečka (125 g)", brand: "Crownfield", store: "Lidl" },
  "Slane palčke": { size: 100, unit: "g", label: "vrečka (100 g)", brand: "Chio", store: "Spar / Mercator" },
  "Slani kokosovi flips/čips": { size: 100, unit: "g", label: "vrečka (100 g)", brand: "Chio", store: "Spar / Mercator" },
  "Tortilja čips": { size: 200, unit: "g", label: "vrečka (200 g)", brand: "Doritos", store: "Mercator / Spar" },
  "Mešani oreščki, nesoljeni": { size: 200, unit: "g", label: "vrečka (200 g)", brand: "Alesto", store: "Lidl" },
  "Mandlji": { size: 200, unit: "g", label: "vrečka (200 g)", brand: "Alesto", store: "Lidl" },
  "Orehi": { size: 150, unit: "g", label: "vrečka (150 g)", brand: "Alesto", store: "Lidl" },
  "Indijski oreščki": { size: 200, unit: "g", label: "vrečka (200 g)", brand: "Alesto", store: "Lidl" },
  "Rozine/mešano suho sadje": { size: 200, unit: "g", label: "vrečka (200 g)", brand: "Alesto", store: "Lidl" },
  "Datlji, suhi": { size: 200, unit: "g", label: "vrečka (200 g)", brand: "Alesto", store: "Lidl" },
  "Musli s čokolado": { size: 500, unit: "g", label: "vrečka (500 g)", brand: "Crownfield", store: "Lidl" },
  "Kosmiči (čokoladni)": { size: 375, unit: "g", label: "škatla (375 g)", brand: "Crownfield", store: "Lidl" },
  "Müsli ploščica": { size: 35, unit: "g", label: "1 ploščica (35 g)", brand: "Corny", store: "Mercator / Spar" },
  "Proteinska ploščica": { size: 50, unit: "g", label: "1 ploščica (50 g)", brand: "MyProtein", store: "Spar / spletna trgovina" },
  "Popkorn (naraven)": { size: 100, unit: "g", label: "vrečka (100 g)", brand: "Crownfield", store: "Lidl" },
  "Sadni sok (100 %)": { size: 1000, unit: "ml", label: "tetrapak (1 L)", brand: "Fructal", store: "Mercator / Spar" },
  "Rastlinski napitek (ovseni/mandljev)": { size: 1000, unit: "ml", label: "tetrapak (1 L)", brand: "Alpro", store: "Spar / Mercator" },
  "Ledeni čaj": { size: 1500, unit: "ml", label: "steklenica (1,5 L)", brand: "Nestea", store: "Mercator / Spar" },
  "Sladoled (vaniljev)": { size: 500, unit: "ml", label: "posoda (500 ml)", brand: "Milbona (Lidl)", store: "Mercator / Spar" },
  "Pršut/panceta narezek": { size: 80, unit: "g", label: "pakiranje (80 g)", brand: "Kraški vršič", store: "Mercator / Spar" },
  "Šunka (pusta, narezki)": { size: 100, unit: "g", label: "pakiranje (100 g)", brand: "Poli", store: "Mercator / Spar" },
  "Piščančja prsa, dimljena (narezek)": { size: 100, unit: "g", label: "pakiranje (100 g)", brand: "Poli", store: "Mercator / Spar" },
  "Piščančja salama (Slim&Fit)": { size: 100, unit: "g", label: "pakiranje (100 g)", brand: "Slim&Fit", store: "Mercator" },
  "Toast kruh": { size: 500, unit: "g", label: "vrečka (500 g)", brand: "Golden Toast (Lidl)", store: "Mercator / Spar" },
  "Kruh": { size: 500, unit: "g", label: "hlebec (~500 g)", store: "Mercator / Spar / Lidl" },
  "Žemlja/hlebček": { size: 60, unit: "g", label: "1 žemlja (60 g)", brand: "pekarna", store: "Mercator / Spar" },
  "Ovseni kosmiči": { size: 500, unit: "g", label: "vrečka (500 g)", brand: "Crownfield", store: "Lidl" },
  "Chia semena": { size: 200, unit: "g", label: "vrečka (200 g)", brand: "Alesto", store: "Lidl" },
  "Tortilja (Lidl, navadna/polnozrnata)": { size: 62 * 8, unit: "g", label: "pakiranje 8 kosov (496 g)", brand: "Golden Sun", store: "Lidl" },
};

function aggregateIngredients(plan) {
  const map = new Map(); // key: "ime|enota" -> { name, unit, qty }
  function add(list) {
    list.forEach((item) => {
      if (item.unit === "note") return;
      const key = `${item.name}|${item.unit}`;
      const existing = map.get(key);
      if (existing) existing.qty += item.qty;
      else map.set(key, { name: item.name, unit: item.unit, qty: item.qty });
    });
  }
  if (plan.zajtrk) add(plan.ingFor("zajtrk"));
  if (plan.kosilo) add(plan.ingFor("kosilo"));
  if (plan.vecerja) add(plan.ingFor("vecerja"));
  add(plan.snackEntries.map((e) => ({ name: e.item.name, unit: "g", qty: e.qty })));

  return Array.from(map.values())
    .map((it) => {
      const pkg = PACKAGE_SIZES[it.name];
      if (pkg && it.unit === pkg.unit) {
        const packagesNeeded = Math.max(1, Math.ceil(it.qty / pkg.size));
        return {
          ...it,
          displayQty: `${packagesNeeded} × ${pkg.label}`,
          brand: pkg.brand,
          store: pkg.store,
        };
      }
      return {
        ...it,
        displayQty: `${round1(it.qty)} ${it.unit === "kos" ? "kos" : it.unit}`,
        brand: null,
        store: null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "sl"));
}

function ShoppingListScreen({ plan }) {
  const [checked, setChecked] = useState({});
  const items = useMemo(() => aggregateIngredients(plan), [plan.zajtrk, plan.kosilo, plan.vecerja, plan.snackEntries, plan.ingFor]);

  function toggle(key) {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <ShoppingCart size={28} color={COLOR.line} className="mx-auto mb-3" />
        <p className="text-[13px]" style={{ color: COLOR.sage }}>
          Nakupovalni seznam se sestavi samodejno, ko na zavihku "Dnevni jedilnik" izbereš zajtrk, kosilo, večerjo ali malico.
        </p>
      </div>
    );
  }

  const checkedCount = items.filter((it) => checked[`${it.name}|${it.unit}`]).length;

  return (
    <div>
      <p className="text-[12px] mb-4" style={{ color: COLOR.sage }}>
        Sestavine iz tvojega izbranega dnevnega jedilnika, združene po imenu (enake sestavine iz več obrokov so
        seštete). Odkljukaj, ko kupiš.
      </p>
      <div className="rounded-md overflow-hidden mb-3" style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ background: COLOR.forest }}>
          <span className="text-[13px] text-white" style={{ fontFamily: "Georgia, serif" }}>
            Nakupovalni seznam
          </span>
          <span className="text-[11px]" style={{ color: "#CFE0D2" }}>
            {checkedCount} / {items.length} kupljeno
          </span>
        </div>
        {items.map((it) => {
          const key = `${it.name}|${it.unit}`;
          const isChecked = Boolean(checked[key]);
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
              style={{ borderTop: `1px solid ${COLOR.line}` }}
            >
              <div
                className="w-5 h-5 rounded shrink-0 flex items-center justify-center"
                style={{ background: isChecked ? COLOR.sage : COLOR.paper, border: `1px solid ${isChecked ? COLOR.sage : COLOR.line}` }}
              >
                {isChecked && <Check size={13} color="#FFFFFF" />}
              </div>
              <div className="flex-1 min-w-0">
                <span
                  className="block text-[14px]"
                  style={{ fontFamily: "Georgia, serif", color: isChecked ? COLOR.sage : COLOR.ink, textDecoration: isChecked ? "line-through" : "none" }}
                >
                  {it.name}
                </span>
                {it.brand && (
                  <span className="block text-[11px]" style={{ color: COLOR.sage }}>
                    {it.brand} · {it.store}
                  </span>
                )}
              </div>
              <span className="text-[12px] text-right shrink-0" style={{ fontFamily: "'Courier New', monospace", color: COLOR.sage }}>
                {it.displayQty}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const TABS_BASE = [
  { key: "recepti", label: "Recepti", icon: BookOpen },
  { key: "dan", label: "Dnevni jedilnik", icon: CalendarDays },
  { key: "dnevnik", label: "Dnevnik", icon: NotebookPen },
  { key: "nakup", label: "Nakup", icon: ShoppingCart },
  { key: "priljubljeni", label: "Priljubljeni", icon: Heart },
];

export default function MakroKuharica() {
  const [tab, setTab] = useState("recepti");
  const [favorites, setFavorites, favLoaded] = usePersistentState("makrokuharica_favorites", []);
  const [recipes, setRecipes] = useState([]);
  const [snackCatalog, setSnackCatalog] = useState([]);
  const wb = useWeeklyBudget();
  const [selectedDay, setSelectedDay] = useState(WEEK_DAYS[JS_DAY_TO_INDEX[new Date().getDay()]].key);
  const dayPlan = useDayPlan(wb.weeklyTargets[selectedDay], selectedDay, recipes, snackCatalog);

  const [userId, setUserId] = useState(null);
  const [cloudPlanKey, setCloudPlanKey] = useState("");
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUserId(data?.user?.id || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUserId(session?.user?.id || null));
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([fetchPublishedRecipes(), fetchCatalogSnacks()])
      .then(([loadedRecipes, loadedSnacks]) => {
        if (!cancelled) {
          setRecipes(loadedRecipes);
          setSnackCatalog(loadedSnacks);
        }
      })
      .catch((catalogError) => {
        console.error("Supabase kataloga ni bilo mogoče naložiti.", catalogError);
      });
    return () => { cancelled = true; };
  }, [userId]);

  const { profile, loading: profileLoading, saveProfile } = useProfile(userId);
  const { log: dailyLog, saveLog: saveDailyLog } = useDailyLog(userId);

  // Admin lahko stranki dodeli jedilnik. Ob menjavi dneva ima oblačni načrt
  // prednost pred lokalno shranjeno izbiro.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const planDate = dateForWeekday(selectedDay);
    const key = `${userId}:${planDate}`;
    setCloudPlanKey("");
    supabase
      .from("day_plans")
      .select("zajtrk_koda,kosilo_koda,vecerja_koda")
      .eq("user_id", userId)
      .eq("plan_date", planDate)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          dayPlan.setZajtrkCode(data.zajtrk_koda || "");
          dayPlan.setKosiloCode(data.kosilo_koda || "");
          dayPlan.setVecerjaCode(data.vecerja_koda || "");
        }
        setCloudPlanKey(key);
      });
    return () => { cancelled = true; };
    // Setterji so stabilni po namenu; ponovno nalagamo samo ob menjavi uporabnika ali dneva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedDay]);

  // Sinhroniziraj trenutni jedilnik v oblak (da ga admin vidi v nadzorni plošči)
  useEffect(() => {
    if (!userId) return;
    const planDate = dateForWeekday(selectedDay);
    if (cloudPlanKey !== `${userId}:${planDate}`) return;
    const malice = dayPlan.snackEntries?.map((e) => ({ name: e.item.name, qty: e.qty })) || [];
    const payload = {
      user_id: userId,
      plan_date: planDate,
      zajtrk_koda: dayPlan.zajtrkCode || null,
      kosilo_koda: dayPlan.kosiloCode || null,
      vecerja_koda: dayPlan.vecerjaCode || null,
      malice,
      updated_at: new Date().toISOString(),
    };
    if (!payload.zajtrk_koda && !payload.kosilo_koda && !payload.vecerja_koda && malice.length === 0) return;
    supabase.from("day_plans").upsert(payload, { onConflict: "user_id,plan_date" }).then(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedDay, cloudPlanKey, dayPlan.zajtrkCode, dayPlan.kosiloCode, dayPlan.vecerjaCode, dayPlan.snackEntries]);

  const TABS = profile?.is_admin ? [...TABS_BASE, { key: "admin", label: "Nadzorna plošča", icon: LayoutDashboard }] : TABS_BASE;

  function toggleFavorite(code) {
    setFavorites((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  if (userId && profileLoading) {
    return <div style={{ minHeight: "100vh", background: COLOR.paper }} />;
  }
  if (userId && !isProfileComplete(profile)) {
    return <ProfileOnboarding onSave={saveProfile} saving={profileLoading} />;
  }

  return (
    <div style={{ background: COLOR.paper, minHeight: "100%" }} className="w-full flex justify-center">
      <div className={`w-full pb-24 ${tab === "admin" ? "max-w-[1440px]" : "max-w-lg"}`}>
        <div className={`text-center px-4 pt-8 pb-6 ${tab === "admin" ? "hidden" : ""}`}>
          <div className="flex items-center justify-center gap-2 mb-2" style={{ color: COLOR.amber }}>
            <ChefHat size={22} strokeWidth={1.75} />
          </div>
          <h1 className="text-3xl" style={{ fontFamily: "Georgia, serif", color: COLOR.forest }}>
            Makro kuharica
          </h1>
          <p className="text-[13px] mt-2" style={{ color: COLOR.sage }}>
            {recipes.length} receptov · Zajtrk/Večerja ≈ 450–500 kcal, 30–35 g B · Kosilo ≈ 600–650 kcal, ≈ 40 g B
          </p>
        </div>

        <div className={tab === "admin" ? "px-3 py-4 md:px-6 md:py-6" : "px-4"}>
          {tab === "recepti" && <RecipesScreen favorites={favorites} onToggleFavorite={toggleFavorite} onlyFavorites={false} recipes={recipes} />}
          {tab === "dan" && <DayPlannerScreen plan={dayPlan} wb={wb} selectedDay={selectedDay} setSelectedDay={setSelectedDay} />}
          {tab === "dnevnik" && (
            <>
              <PushNotificationCard userId={userId} />
              <DailyCheckIn log={dailyLog} onSave={saveDailyLog} />
            </>
          )}
          {tab === "nakup" && <ShoppingListScreen plan={dayPlan} />}
          {tab === "priljubljeni" && (
            <RecipesScreen favorites={favorites} onToggleFavorite={toggleFavorite} onlyFavorites={true} recipes={recipes} />
          )}
          {tab === "admin" && profile?.is_admin && (
            <React.Suspense fallback={<div style={{ minHeight: 320 }} />}>
              <AdminDashboard />
            </React.Suspense>
          )}
        </div>
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 flex justify-center"
        style={{ borderTop: `1px solid ${COLOR.line}`, background: "rgba(246,242,233,0.96)", backdropFilter: "blur(6px)" }}
      >
        <div className="w-full max-w-lg grid" style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} className="flex flex-col items-center gap-1 py-2.5">
                <Icon size={20} color={active ? COLOR.forest : COLOR.sage} fill={t.key === "priljubljeni" && active ? COLOR.forest : "none"} strokeWidth={1.75} />
                <span className="text-[10px]" style={{ color: active ? COLOR.forest : COLOR.sage, fontFamily: "Georgia, serif" }}>
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
