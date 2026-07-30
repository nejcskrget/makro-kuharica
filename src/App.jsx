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
  BookOpen,
  ChevronDown,
  ChevronUp,
  Flame,
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
import { fetchPublishedRecipes } from "./customRecipes";
import { PushNotificationCard } from "./notifications/PushNotificationCard";

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
     3) PODATKI                    — recepti (ZV, K) in prigrizki (SNACKS)
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
const ZV = [
  {
    code: "Z/V1",
    type: "zajtrk-vecerja",
    prepMinutes: 5,
    title: "Overnight oats",
    original: "455 kcal / 35 g B / 13 g M / 55 g OH · vlaknine ≈10 g",
    fiber: 10,
    micro: { vitC: 29.8, iron: 3.3, calcium: 454.7, vitD: 0, potassium: 746.5, folate: 56.6 },
    steps: "Vse sestavine daš v lonček ter jih premešaš. Pustiš v hladilniku čez noč. Jagodičevje lahko dodaš zvečer ali zjutraj.",
    ing: [
      { name: "Ovseni kosmiči", unit: "g", qty: 35, rate: { kcal: 375, p: 13, f: 7, c: 66 } , priloga: true },
      { name: "Grški jogurt 2 % m.m.", unit: "g", qty: 300, rate: { kcal: 63, p: 9, f: 2, c: 3.6 }, core: true },
      { name: "Chia semena", unit: "g", qty: 15, rate: { kcal: 486, p: 17, f: 31, c: 42 } },
      { name: "Jagodičevje", unit: "g", qty: 70, rate: { kcal: 45, p: 0.7, f: 0.3, c: 10 } },
      { name: "Med", unit: "g", qty: 10, rate: { kcal: 304, p: 0.3, f: 0, c: 82 } , brand: "Medex" },
      { name: "Cimet / vanilijev ekstrakt", unit: "note" },
    ],
  },
  {
    code: "Z/V2",
    type: "zajtrk-vecerja",
    prepMinutes: 15,
    title: "Tortilja s piščancem",
    original: "467 kcal / 36 g B / 15 g M / 45 g OH · vlaknine ≈8 g",
    note: "Navadna/polnozrnata Lidl tortilja (1 kos ≈ 62 g) · piščanec 100 g/obrok, tako da 400 g pakiranje zadostuje za 4 obroke (500 g pakiranje za 5). Namesto piščanca lahko uporabiš 2 konzervi tune v lastnem soku (Nixe, 2 × 65 g).",
    fiber: 8,
    micro: { vitC: 79.4, iron: 3.9, calcium: 189.8, vitD: 0.1, potassium: 1064.9, folate: 131.6 },
    steps: "Meso spečeš na ponvi na nekaj pršilih olivnega olja. Zmešaš omako iz skyra in kečapa brez sladkorja, po želji začiniš s česnom v prahu in soljo. Na tortiljo namažeš omako, dodaš špinačo, meso, mozzarelo in rezine avokada, zaviješ in po želji na hitro zapečeš na ponvi. Zelenjavo postrežeš zraven.",
    ing: [
      { name: "Tortilja (Lidl, navadna/polnozrnata)", unit: "g", qty: 62, rate: { kcal: 310, p: 8, f: 7, c: 50 } , core: true , brand: "Golden Sun (Lidl)" },
      { name: "Piščančje/puranje prsi (surove)", unit: "g", qty: 100, rate: { kcal: 110, p: 23, f: 1.5, c: 0 } , core: true },
      { name: "Light mozzarella", unit: "g", qty: 10, rate: { kcal: 170, p: 22, f: 7, c: 1.5 } , brand: "Milbona (Lidl)" },
      { name: "Sveža špinača", unit: "g", qty: 20, rate: { kcal: 23, p: 2.9, f: 0.4, c: 3.6 } },
      { name: "Skyr", unit: "g", qty: 20, rate: { kcal: 63, p: 11, f: 0.2, c: 4 } , brand: "Milbona (Lidl)" },
      { name: "Kečap brez sladkorja", unit: "g", qty: 10, rate: { kcal: 35, p: 0.9, f: 0.2, c: 7 } , brand: "Kania (Lidl)" },
      { name: "Olivno olje (pršilo)", unit: "kos", qty: 3, rate: { kcal: 9, p: 0, f: 1, c: 0 } , brand: "Primadonna (Lidl)" },
      { name: "Zelenjava (kumara, paradižnik, paprika)", unit: "g", qty: 200, rate: { kcal: 22, p: 1, f: 0.2, c: 4 } , priloga: true },
      { name: "Avokado", unit: "g", qty: 35, rate: { kcal: 160, p: 2, f: 15, c: 9 } },
    ],
  },
  {
    code: "Z/V3",
    type: "zajtrk-vecerja",
    prepMinutes: 10,
    title: "Jajca s kruhom in avokadom",
    original: "487 kcal / 36 g B / 18 g M / 43 g OH · vlaknine ≈8 g",
    fiber: 8,
    micro: { vitC: 55.5, iron: 4.6, calcium: 400.1, vitD: 1.2, potassium: 789.1, folate: 114 },
    steps: "Jajce skuhaš (na trdo ali mehko, po želji) in postrežeš s kruhom, salamo, sirčki v trikotnikih, skuto, rezinami avokada in narezano zelenjavo.",
    ing: [
      { name: "Jajce", unit: "kos", qty: 1, rate: { kcal: 74, p: 6.3, f: 5, c: 0.6 } , core: true },
      { name: "Kruh", unit: "g", qty: 60, rate: { kcal: 255, p: 8.5, f: 3, c: 46 } , core: true },
      { name: "Piščančja salama (Slim&Fit)", unit: "g", qty: 50, rate: { kcal: 140, p: 19, f: 5, c: 2 } , core: true , brand: "Slim&Fit" },
      { name: "Lahki sirni namaz (2 trikotnika)", unit: "g", qty: 34, rate: { kcal: 170, p: 11, f: 11, c: 6 } , core: true , brand: "Milbona (Lidl)" },
      { name: "Lahka skuta", unit: "g", qty: 75, rate: { kcal: 68, p: 12.5, f: 0.3, c: 3.7 } , brand: "Milbona (Lidl)" },
      { name: "Zelenjava (kumara, paradižnik, paprika)", unit: "g", qty: 150, rate: { kcal: 22, p: 1, f: 0.2, c: 4 } , priloga: true },
      { name: "Avokado", unit: "g", qty: 30, rate: { kcal: 160, p: 2, f: 15, c: 9 } },
    ],
  },
  {
    code: "Z/V4",
    type: "zajtrk-vecerja",
    prepMinutes: 10,
    title: "Tunin sendvič",
    original: "488 kcal / 33 g B / 14 g M / 58 g OH · vlaknine ≈5 g",
    note: "1 konzerva tune (Nixe, 65 g) na obrok.",
    fiber: 5,
    micro: { vitC: 6.1, iron: 4, calcium: 271.8, vitD: 1.3, potassium: 615.9, folate: 82.4 },
    steps: "Narediš namaz iz skyra, majoneze in koruze ter začiniš po okusu. Namaz nanesi na toast/kruh in dodaj tuno, mozzarelo in rezine avokada. Sendvič po želji na hitro popečeš.",
    ing: [
      { name: "Toast kruh", unit: "g", qty: 95, rate: { kcal: 265, p: 8, f: 3.7, c: 49 } , core: true , brand: "Golden Toast (Lidl)" },
      { name: "Tuna v lastnem soku, odcejena (1 konzerva)", unit: "g", qty: 65, rate: { kcal: 100, p: 23, f: 0.7, c: 0 } , core: true , brand: "Nixe (Lidl)" },
      { name: "Light mozzarella", unit: "g", qty: 25, rate: { kcal: 170, p: 22, f: 7, c: 1.5 } , brand: "Milbona (Lidl)" },
      { name: "Koruza", unit: "g", qty: 30, rate: { kcal: 86, p: 3.3, f: 1.4, c: 19 } , priloga: true , brand: "Vemondo (Lidl)" },
      { name: "Majoneza light/delight", unit: "g", qty: 8, rate: { kcal: 250, p: 1, f: 25, c: 4 } , brand: "Kania (Lidl)" },
      { name: "Skyr", unit: "g", qty: 30, rate: { kcal: 63, p: 11, f: 0.2, c: 4 } , brand: "Milbona (Lidl)" },
      { name: "Avokado", unit: "g", qty: 40, rate: { kcal: 160, p: 2, f: 15, c: 9 } },
    ],
  },
  {
    code: "Z/V5",
    type: "zajtrk-vecerja",
    prepMinutes: 10,
    title: "Solata s tuno in jajcem",
    original: "469 kcal / 37 g B / 24 g M / 30 g OH · vlaknine ≈8 g",
    note: "1 konzerva tune (Nixe, 65 g) na obrok.",
    fiber: 8,
    micro: { vitC: 134.6, iron: 4.5, calcium: 187, vitD: 2.5, potassium: 1054.6, folate: 173 },
    steps: "Kuhano jajce pretlačiš z vilico in dodaš v posodo z ostalimi sestavinami (vključno z nasekljanimi orehi) ter dobro premešaš. Začiniš po okusu (sol, česen, poper, limona).",
    ing: [
      { name: "Jajce", unit: "kos", qty: 1, rate: { kcal: 74, p: 6.3, f: 5, c: 0.6 } , core: true },
      { name: "Tuna v lastnem soku, odcejena (1 konzerva)", unit: "g", qty: 65, rate: { kcal: 100, p: 23, f: 0.7, c: 0 } , core: true , brand: "Nixe (Lidl)" },
      { name: "Kumare", unit: "g", qty: 100, rate: { kcal: 15, p: 0.7, f: 0.1, c: 3.6 } },
      { name: "Paprika", unit: "g", qty: 100, rate: { kcal: 31, p: 1, f: 0.3, c: 6 } },
      { name: "Fižol", unit: "g", qty: 40, rate: { kcal: 110, p: 7, f: 0.5, c: 17 } , priloga: true , brand: "Vemondo (Lidl)" },
      { name: "Koruza", unit: "g", qty: 30, rate: { kcal: 86, p: 3.3, f: 1.4, c: 19 } , priloga: true , brand: "Vemondo (Lidl)" },
      { name: "Grški jogurt 2 %", unit: "g", qty: 80, rate: { kcal: 63, p: 9, f: 2, c: 3.6 } , brand: "Pilos (Lidl)" },
      { name: "Majoneza light/delight", unit: "g", qty: 10, rate: { kcal: 250, p: 1, f: 25, c: 4 } , brand: "Kania (Lidl)" },
      { name: "Gorčica", unit: "g", qty: 10, rate: { kcal: 80, p: 4, f: 4, c: 7 } , brand: "Kania (Lidl)" },
      { name: "Orehi", unit: "g", qty: 20, rate: { kcal: 654, p: 15, f: 65, c: 14 } },
    ],
  },
  {
    code: "Z/V6",
    type: "zajtrk-vecerja",
    prepMinutes: 10,
    title: "Tortilja s tuno in avokadom",
    original: "470 kcal / 41 g B / 15 g M / 44 g OH · vlaknine ≈12 g",
    note: "Navadna/polnozrnata Lidl tortilja (1 kos ≈ 62 g) · 2 konzervi tune (Nixe, 2 × 65 g) — brez peke, hitra različica za na pot.",
    fiber: 12,
    micro: { vitC: 61.5, iron: 4, calcium: 139.8, vitD: 2.6, potassium: 1178.5, folate: 125.6 },
    steps: "Tuno odcediš in zmešaš z limoninim sokom in začimbami. Tortiljo namažeš z drobtinami avokada, dodaš tuno, skyr in zelenjavo, zaviješ.",
    ing: [
      { name: "Tortilja (Lidl, navadna/polnozrnata)", unit: "g", qty: 62, rate: { kcal: 310, p: 8, f: 7, c: 50 } , core: true , brand: "Golden Sun (Lidl)" },
      { name: "Tuna v lastnem soku, odcejena (2 konzervi)", unit: "g", qty: 130, rate: { kcal: 100, p: 23, f: 0.7, c: 0 } , core: true , brand: "Nixe (Lidl)" },
      { name: "Avokado", unit: "g", qty: 60, rate: { kcal: 160, p: 2, f: 15, c: 9 } },
      { name: "Zelenjava (kumara, paradižnik, paprika)", unit: "g", qty: 150, rate: { kcal: 22, p: 1, f: 0.2, c: 4 } , priloga: true },
      { name: "Skyr", unit: "g", qty: 30, rate: { kcal: 63, p: 11, f: 0.2, c: 4 } , brand: "Milbona (Lidl)" },
    ],
  },
  {
    code: "Z/V7",
    type: "zajtrk-vecerja",
    title: "Ameriške palačinke z grškim jogurtom",
    original: "479 kcal / 32 g B / 14 g M / 59 g OH · vlaknine ≈4 g",
    prepMinutes: 15,
    fiber: 4,
    micro: { vitC: 29, iron: 1.9, calcium: 350, vitD: 1.1, potassium: 621, folate: 70 },
    note: "Testo pripraviš iz moke, jajca in mleka, spečeš več manjših debelejših palačink (ameriški slog), postrežeš z grškim jogurtom, medom in jagodičevjem namesto sirupa.",
    steps: "Moko, jajce in mleko zmešaš v gladko testo (po želji dodaš žličko pecilnega praška za bolj puhaste palačinke). Na ponvi na pršilu olja speceš 4-5 manjših debelejših palačink. Postrežeš z grškim jogurtom, medom in svežim jagodičevjem.",
    ing: [
      { name: "Pšenična moka", unit: "g", qty: 45, rate: { kcal: 364, p: 10, f: 1, c: 76 }, core: true },
      { name: "Jajce", unit: "kos", qty: 1, rate: { kcal: 74, p: 6.3, f: 5, c: 0.6 }, core: true },
      { name: "Mleko 1,5 %", unit: "ml", qty: 70, rate: { kcal: 46, p: 3.3, f: 1.5, c: 4.8 }, brand: "Milbona (Lidl)" },
      { name: "Grški jogurt 2 %", unit: "g", qty: 200, rate: { kcal: 63, p: 9, f: 2, c: 3.6 }, core: true, brand: "Pilos (Lidl)" },
      { name: "Med", unit: "g", qty: 8, rate: { kcal: 304, p: 0.3, f: 0, c: 82 }, brand: "Medex" },
      { name: "Jagodičevje (jagode, borovnice)", unit: "g", qty: 70, rate: { kcal: 45, p: 0.7, f: 0.3, c: 10 }, priloga: true },
      { name: "Olivno olje (pršilo)", unit: "kos", qty: 3, rate: { kcal: 9, p: 0, f: 1, c: 0 }, brand: "Primadonna (Lidl)" },
    ],
  },
  {
    code: "Z/V8",
    type: "zajtrk-vecerja",
    title: "Šmorn z grškim jogurtom",
    original: "473 kcal / 31 g B / 16 g M / 54 g OH · vlaknine ≈4 g",
    prepMinutes: 20,
    fiber: 4,
    micro: { vitC: 4.3, iron: 2.5, calcium: 294, vitD: 2.2, potassium: 623, folate: 71 },
    note: "Klasičen šmorn (razmetan cvrtnjak) — več jajc kot pri navadnih palačinkah, na ponvi speceš in strgaš na koščke, postrežeš z grškim jogurtom in jabolkom namesto sladkorja v prahu.",
    steps: "Moko, jajca in mleko zmešaš v testo, spečeš debelejšo palačinko na pršilu olja, med peko dodaš rozine. Ko je skoraj pečena, jo z dvema vilicama strgaš na koščke in na hitro popečeš, da porjavi. Med koncem prilijeva žličko medu za rahlo karamelizacijo. Postrežeš z grškim jogurtom in narezanim jabolkom.",
    ing: [
      { name: "Jajce", unit: "kos", qty: 2, rate: { kcal: 74, p: 6.3, f: 5, c: 0.6 }, core: true },
      { name: "Pšenična moka", unit: "g", qty: 25, rate: { kcal: 364, p: 10, f: 1, c: 76 }, core: true },
      { name: "Mleko 1,5 %", unit: "ml", qty: 40, rate: { kcal: 46, p: 3.3, f: 1.5, c: 4.8 }, brand: "Milbona (Lidl)" },
      { name: "Rozine", unit: "g", qty: 12, rate: { kcal: 299, p: 3.1, f: 0.5, c: 79 }, brand: "Alesto (Lidl)" },
      { name: "Med", unit: "g", qty: 8, rate: { kcal: 304, p: 0.3, f: 0, c: 82 }, brand: "Medex" },
      { name: "Olivno olje (pršilo)", unit: "kos", qty: 2, rate: { kcal: 9, p: 0, f: 1, c: 0 }, brand: "Primadonna (Lidl)" },
      { name: "Grški jogurt 2 %", unit: "g", qty: 160, rate: { kcal: 63, p: 9, f: 2, c: 3.6 }, core: true, brand: "Pilos (Lidl)" },
      { name: "Jabolko", unit: "g", qty: 70, rate: { kcal: 52, p: 0.3, f: 0.2, c: 14 }, priloga: true },
    ],
  },
  {
    code: "Z/V9",
    type: "zajtrk-vecerja",
    title: "Grški jogurt s sadjem",
    original: "448 kcal / 34 g B / 19 g M / 42 g OH · vlaknine ≈6 g",
    prepMinutes: 5,
    fiber: 6,
    micro: { vitC: 62, iron: 2.5, calcium: 490, vitD: 0, potassium: 829, folate: 71 },
    note: "Najhitrejši zajtrk v tej kuharici — brez kuhanja, samo sestaviš. Odlično za jutra v naglici.",
    steps: "Grški jogurt daš v skledo, po vrhu razporediš narezano sadje, chia semena in mandlje, prelij z medom.",
    ing: [
      { name: "Grški jogurt 2 %", unit: "g", qty: 300, rate: { kcal: 63, p: 9, f: 2, c: 3.6 }, core: true, brand: "Pilos (Lidl)" },
      { name: "Mešano sadje (banana, jagode, kivi)", unit: "g", qty: 150, rate: { kcal: 45, p: 0.7, f: 0.3, c: 10 }, priloga: true },
      { name: "Chia semena", unit: "g", qty: 15, rate: { kcal: 486, p: 17, f: 31, c: 42 }, brand: "Alesto (Lidl)" },
      { name: "Med", unit: "g", qty: 10, rate: { kcal: 304, p: 0.3, f: 0, c: 82 }, brand: "Medex" },
      { name: "Mandlji", unit: "g", qty: 15, rate: { kcal: 590, p: 21, f: 50, c: 9 }, brand: "Alesto (Lidl)" },
    ],
  },
  {
    code: "Z/V10",
    type: "zajtrk-vecerja",
    title: "Dimljen losos na kruhu",
    original: "494 kcal / 31 g B / 24 g M / 37 g OH · vlaknine ≈4 g",
    prepMinutes: 10,
    fiber: 4,
    micro: { vitC: 4, iron: 3.4, calcium: 145, vitD: 12.1, potassium: 700, folate: 65 },
    note: "Elegantna, hitra različica brez kuhanja — odlična tudi za goste ali brunch.",
    steps: "Kruh po želji na hitro popečeš. Namažeš z light kremnim sirnim namazom, dodaš rezine dimljenega lososa, kumare in tanke rezine avokada. Po vrhu poškropiš z limoninim sokom in sveže mletim poprom.",
    ing: [
      { name: "Rženi/polnozrnati kruh", unit: "g", qty: 70, rate: { kcal: 245, p: 8, f: 1.5, c: 45 }, core: true },
      { name: "Dimljen losos", unit: "g", qty: 110, rate: { kcal: 200, p: 20, f: 13, c: 0 }, core: true },
      { name: "Light kremni sirni namaz", unit: "g", qty: 30, rate: { kcal: 155, p: 8, f: 12, c: 4 }, priloga: true },
      { name: "Kumare", unit: "g", qty: 50, rate: { kcal: 15, p: 0.7, f: 0.1, c: 3.6 }, priloga: true },
      { name: "Avokado", unit: "g", qty: 30, rate: { kcal: 160, p: 2, f: 15, c: 9 } },
      { name: "Limona", unit: "note" },
    ],
  },
];

const K = [
  {
    code: "K1",
    type: "kosilo",
    prepMinutes: 45,
    title: "Bolognese",
    batch: 4,
    original: "614 kcal / 41 g B / 15 g M / 76 g OH · vlaknine ≈7 g",
    note: "Pusto mleto mešano meso pride v pakiranju 425 g — spodnje količine porabijo cel paket naenkrat za natanko 4 kosila.",
    fiber: 7,
    micro: { vitC: 67.8, iron: 5.2, calcium: 186.1, vitD: 0, potassium: 1166.6, folate: 71.9 },
    steps: "Meso popečeš na ponvi (olje ni potrebno), dodaš paradižnikovo mezgo in smetano za kuhanje ter na hitro podušiš. Medtem skuhaš testenine. Ko je omaka pripravljena, jo zmešaš s testeninami, na vrh dodaš mozzarelo, zelenjavo postrežeš zraven.",
    ing: [
      { name: "Testenine", unit: "g", qty: 340, rate: { kcal: 355, p: 12.5, f: 2, c: 71 } , priloga: true },
      { name: "Pusto mleto mešano meso (cel paket)", unit: "g", qty: 425, rate: { kcal: 135, p: 21, f: 5, c: 0 } , core: true },
      { name: "Paradižnikova mezga", unit: "g", qty: 400, rate: { kcal: 32, p: 1.5, f: 0.3, c: 6.5 } , brand: "Casa Morando (Lidl)" },
      { name: "Smetana za kuhanje 10 %", unit: "g", qty: 240, rate: { kcal: 130, p: 2.5, f: 10, c: 4 } , brand: "Milbona (Lidl)" },
      { name: "Light mozzarella", unit: "g", qty: 60, rate: { kcal: 170, p: 22, f: 7, c: 1.5 } , brand: "Milbona (Lidl)" },
      { name: "Zelenjava po želji", unit: "g", qty: 600, rate: { kcal: 22, p: 1, f: 0.2, c: 4 } , priloga: true },
    ],
  },
  {
    code: "K2",
    type: "kosilo",
    prepMinutes: 35,
    title: "Pečen piščanec s krompirjem in zelenjavo",
    batch: 4,
    original: "596 kcal / 39 g B / 13 g M / 82 g OH · vlaknine ≈9 g",
    note: "Piščančje prsi pridejo v pakiranju 500 g — spodnje količine porabijo cel paket naenkrat za natanko 4 kosila.",
    fiber: 9,
    micro: { vitC: 144.5, iron: 4.7, calcium: 83.2, vitD: 0.1, potassium: 2405.8, folate: 137.5 },
    steps: "Meso in na kocke narezan krompir na rahlo popršiš z olivnim oljem ter spečeš v pečici do zlato rjave barve. Zelenjavo lahko pripraviš na enak način v pečici ali postrežeš svežo ob strani. Za konec dodaš rezine avokada.",
    ing: [
      { name: "Piščančje/puranje prsi (cel paket)", unit: "g", qty: 500, rate: { kcal: 110, p: 23, f: 1.5, c: 0 } , core: true },
      { name: "Krompir", unit: "g", qty: 1400, rate: { kcal: 90, p: 2, f: 0.2, c: 20 } , priloga: true },
      { name: "Olivno olje (pršilo)", unit: "kos", qty: 12, rate: { kcal: 9, p: 0, f: 1, c: 0 } , brand: "Primadonna (Lidl)" },
      { name: "Zelenjava po želji", unit: "g", qty: 800, rate: { kcal: 22, p: 1, f: 0.2, c: 4 } , priloga: true },
      { name: "Avokado", unit: "g", qty: 180, rate: { kcal: 160, p: 2, f: 15, c: 9 } },
    ],
  },
  {
    code: "K3",
    type: "kosilo",
    prepMinutes: 25,
    title: "Krompirjeva solata z jajci",
    original: "634 kcal / 42 g B / 24 g M / 64 g OH · vlaknine ≈6 g",
    fiber: 6,
    micro: { vitC: 55.5, iron: 6.8, calcium: 321.8, vitD: 4.6, potassium: 1760.3, folate: 168.1 },
    steps: "Skuhaš krompir in jajca. Iz jogurta, mleka in gorčice narediš omako ter jo začiniš po želji. Krompir in jajca narežeš na tanke kolobarje ali stlačiš z vilico, na koncu vse skupaj dobro premešaš z omako in narezano kumaro.",
    ing: [
      { name: "Krompir", unit: "g", qty: 260, rate: { kcal: 90, p: 2, f: 0.2, c: 20 } , priloga: true },
      { name: "Jajca", unit: "kos", qty: 4, rate: { kcal: 74, p: 6.3, f: 5, c: 0.6 } , core: true },
      { name: "Kumare", unit: "g", qty: 100, rate: { kcal: 15, p: 0.7, f: 0.1, c: 3.6 } },
      { name: "Grški jogurt 2 %", unit: "g", qty: 100, rate: { kcal: 63, p: 9, f: 2, c: 3.6 } , brand: "Pilos (Lidl)" },
      { name: "Gorčica", unit: "g", qty: 10, rate: { kcal: 80, p: 4, f: 4, c: 7 } , brand: "Kania (Lidl)" },
      { name: "Mleko 1,5 %", unit: "ml", qty: 40, rate: { kcal: 46, p: 3.3, f: 1.5, c: 4.8 } , brand: "Milbona (Lidl)" },
    ],
  },
  {
    code: "K4",
    type: "kosilo",
    prepMinutes: 25,
    title: "Puranji trakovi z rižem in zelenjavo",
    original: "618 kcal / 41 g B / 10 g M / 89 g OH · vlaknine ≈6 g",
    note: "Nova opcija za več pestrosti med kosili.",
    fiber: 6,
    micro: { vitC: 73, iron: 3.9, calcium: 71.2, vitD: 0.1, potassium: 974.5, folate: 80.5 },
    steps: "Puranje prsi nareži na trakove in popeci na ponvi na nekaj pršilih olivnega olja. Riž skuhaj po navodilih. Zelenjavo pripravi na pari ali podušeno. Vse združi v skledi, dodaj rezine avokada.",
    ing: [
      { name: "Puranje prsi", unit: "g", qty: 130, rate: { kcal: 104, p: 24, f: 1, c: 0 } , core: true },
      { name: "Riž, kuhan", unit: "g", qty: 280, rate: { kcal: 130, p: 2.7, f: 0.3, c: 28 } , priloga: true },
      { name: "Zelenjava (brokoli, korenje, paprika)", unit: "g", qty: 200, rate: { kcal: 22, p: 1, f: 0.2, c: 4 } , priloga: true },
      { name: "Olivno olje (pršilo)", unit: "kos", qty: 3, rate: { kcal: 9, p: 0, f: 1, c: 0 } , brand: "Primadonna (Lidl)" },
      { name: "Avokado", unit: "g", qty: 30, rate: { kcal: 160, p: 2, f: 15, c: 9 } },
    ],
  },
  {
    code: "K5",
    type: "kosilo",
    prepMinutes: 15,
    title: "Tuna mehiška solata",
    original: "603 kcal / 48 g B / 19 g M / 66 g OH · vlaknine ≈15 g",
    note: "2 konzervi tune (Nixe, 2 × 65 g = 130 g) na porcijo. Pripravi celo posodo naenkrat (2× količina) — v hladilniku zdrži 2–3 dni.",
    fiber: 15,
    micro: { vitC: 104.6, iron: 7.6, calcium: 109.4, vitD: 2.6, potassium: 2065.6, folate: 362.4 },
    steps: "Korenje in papriko nareži na koščke in popeci na žlici olja, da se zmehčata. Proti koncu dodaj paradižnikovo mezgo. V posodi zmešaj popečeno zelenjavo, koruzo, fižol, tuno in preostanek olja. Po okusu dodaj kis ali limono, sol in poper.",
    ing: [
      { name: "Tuna v lastnem soku, odcejena (2 konzervi)", unit: "g", qty: 130, rate: { kcal: 100, p: 23, f: 0.7, c: 0 } , core: true , brand: "Nixe (Lidl)" },
      { name: "Korenje", unit: "g", qty: 60, rate: { kcal: 41, p: 0.9, f: 0.2, c: 10 } },
      { name: "Rdeča paprika", unit: "g", qty: 60, rate: { kcal: 31, p: 1, f: 0.3, c: 6 } },
      { name: "Koruza", unit: "g", qty: 100, rate: { kcal: 86, p: 3.3, f: 1.4, c: 19 } , priloga: true , brand: "Vemondo (Lidl)" },
      { name: "Rdeči fižol (konzerva)", unit: "g", qty: 160, rate: { kcal: 110, p: 7, f: 0.5, c: 17 } , priloga: true , brand: "Vemondo (Lidl)" },
      { name: "Paradižnikova mezga", unit: "g", qty: 40, rate: { kcal: 32, p: 1.5, f: 0.3, c: 6.5 } , brand: "Casa Morando (Lidl)" },
      { name: "Olivno olje (pršilo)", unit: "kos", qty: 3, rate: { kcal: 9, p: 0, f: 1, c: 0 } , brand: "Primadonna (Lidl)" },
      { name: "Avokado", unit: "g", qty: 80, rate: { kcal: 160, p: 2, f: 15, c: 9 } },
    ],
  },
  {
    code: "K6",
    type: "kosilo",
    prepMinutes: 25,
    title: "Azijski piščanec z rižem in indijskimi oreščki",
    batch: 4,
    original: "614 kcal / 42 g B / 16 g M / 78 g OH · vlaknine ≈4 g",
    note: "Piščančje prsi pridejo v pakiranju 500 g — spodnje količine porabijo cel paket naenkrat za natanko 4 kosila. Riž in omako pripravi v večji količini, jed zdrži v hladilniku 3 dni.",
    fiber: 4,
    micro: { vitC: 21.2, iron: 3.9, calcium: 48.4, vitD: 0.1, potassium: 783.6, folate: 33.1 },
    steps: "Riž skuhaj in pusti, da se ohladi. Piščanca nareži na kocke, premešaj s sojino omako, in popeci na ponvi do zlato rjave barve. Na isti ponvi popraži zelenjavo, dodaj kuhan riž, preostanek sojine omake in med. Na koncu dodaj piščanca in potresi z oreščki.",
    ing: [
      { name: "Piščančje prsi (cel paket)", unit: "g", qty: 500, rate: { kcal: 105, p: 23, f: 1.5, c: 0 } , core: true },
      { name: "Riž (suh)", unit: "g", qty: 320, rate: { kcal: 350, p: 7, f: 1, c: 77 } , priloga: true },
      { name: "Sojina omaka", unit: "g", qty: 60, rate: { kcal: 53, p: 8, f: 0.1, c: 5 } , brand: "Vitasia (Lidl)" },
      { name: "Zelenjava (paprika, por)", unit: "g", qty: 240, rate: { kcal: 22, p: 1, f: 0.2, c: 4 } },
      { name: "Indijski oreščki", unit: "g", qty: 120, rate: { kcal: 553, p: 18, f: 44, c: 30 } , brand: "Alesto (Lidl)" },
      { name: "Med", unit: "g", qty: 20, rate: { kcal: 304, p: 0.3, f: 0, c: 82 } , brand: "Medex" },
    ],
  },
  {
    code: "K7",
    type: "kosilo",
    prepMinutes: 25,
    title: "Piščanec s čičerikinimi testeninami v kremni omaki",
    batch: 4,
    original: "618 kcal / 44 g B / 27 g M / 48 g OH · vlaknine ≈8 g",
    note: "Piščančje prsi pridejo v pakiranju 400 g — spodnje količine porabijo cel paket naenkrat za natanko 4 kosila. Testenine skuhaj sproti za vsak obrok, omako in piščanca shrani v hladilniku do 3 dni.",
    fiber: 8,
    micro: { vitC: 13.2, iron: 4, calcium: 293.6, vitD: 0.1, potassium: 1583.5, folate: 154.3 },
    steps: "Piščanca začini in popeci na olju, umakni iz ponve. Na istem olju kratko podušite sušene paradižnike, dodaj smetano in pusti, da se rahlo zgosti, na koncu vmešaj parmezan. Skuhaj čičerikine testenine, zmešaj z omako in piščancem.",
    ing: [
      { name: "Piščančje prsi (cel paket)", unit: "g", qty: 400, rate: { kcal: 105, p: 23, f: 1.5, c: 0 } , core: true },
      { name: "Čičerikine testenine", unit: "g", qty: 232, rate: { kcal: 350, p: 20, f: 6, c: 50 } , priloga: true , brand: "Vemondo (Lidl)" },
      { name: "Smetana za kuhanje 10 %", unit: "g", qty: 320, rate: { kcal: 130, p: 2.5, f: 10, c: 4 } , brand: "Milbona (Lidl)" },
      { name: "Parmezan", unit: "g", qty: 48, rate: { kcal: 392, p: 35, f: 26, c: 4 } , brand: "Grand Padano (Lidl)" },
      { name: "Sušeni paradižniki", unit: "g", qty: 80, rate: { kcal: 258, p: 9, f: 3, c: 56 } , brand: "Casa Morando (Lidl)" },
      { name: "Olivno olje (pršilo)", unit: "kos", qty: 12, rate: { kcal: 9, p: 0, f: 1, c: 0 } , brand: "Primadonna (Lidl)" },
      { name: "Avokado", unit: "g", qty: 200, rate: { kcal: 160, p: 2, f: 15, c: 9 } },
    ],
  },
  {
    code: "K8",
    type: "kosilo",
    prepMinutes: 50,
    title: "Bolonjez z bešamelom iz grškega jogurta",
    batch: 4,
    original: "614 kcal / 48 g B / 25 g M / 48 g OH · vlaknine ≈8 g",
    note: "Pusto mleto goveje meso pride v pakiranju 425 g — spodnje količine porabijo cel paket naenkrat za natanko 4 kosila. Omaka zdrži v hladilniku 3 dni, testenine skuhaj sproti.",
    fiber: 8,
    micro: { vitC: 26.3, iron: 6.4, calcium: 364.3, vitD: 0, potassium: 1419.2, folate: 159.2 },
    steps: "Korenje in zeleno na drobno nareži in prepraži na olju, dodaj meso in začimbe, praži do porjavitve. Dodaj paradižnikovo mezgo, pokrij in kuhaj 30-40 min. Skuhaj čičerikine testenine. Za bešamel zmešaj grški jogurt s parmezanom in kislo smetano ter po želji malo vroče vode. Na koncu vse združi.",
    ing: [
      { name: "Pusto mleto goveje meso (cel paket)", unit: "g", qty: 425, rate: { kcal: 137, p: 21, f: 5, c: 0 } , core: true },
      { name: "Korenje", unit: "g", qty: 160, rate: { kcal: 41, p: 0.9, f: 0.2, c: 10 } },
      { name: "Zelena", unit: "g", qty: 120, rate: { kcal: 16, p: 0.7, f: 0.2, c: 3 } },
      { name: "Paradižnikova omaka/mezga", unit: "g", qty: 600, rate: { kcal: 32, p: 1.5, f: 0.3, c: 6.5 } , brand: "Casa Morando (Lidl)" },
      { name: "Čičerikine testenine", unit: "g", qty: 240, rate: { kcal: 350, p: 20, f: 6, c: 50 } , priloga: true , brand: "Vemondo (Lidl)" },
      { name: "Parmezan", unit: "g", qty: 60, rate: { kcal: 392, p: 35, f: 26, c: 4 } , brand: "Grand Padano (Lidl)" },
      { name: "Grški jogurt (za bešamel)", unit: "g", qty: 200, rate: { kcal: 63, p: 9, f: 2, c: 3.6 } , brand: "Pilos (Lidl)" },
      { name: "Olivno olje (pršilo)", unit: "kos", qty: 12, rate: { kcal: 9, p: 0, f: 1, c: 0 } , brand: "Primadonna (Lidl)" },
      { name: "Kisla smetana 10 %", unit: "g", qty: 160, rate: { kcal: 180, p: 2.8, f: 18, c: 3.5 } , brand: "Milbona (Lidl)" },
    ],
  },
  {
    code: "K9",
    type: "kosilo",
    prepMinutes: 35,
    title: "BBQ piščanec s sladkim krompirjem",
    batch: 4,
    original: "615 kcal / 43 g B / 16 g M / 75 g OH · vlaknine ≈9 g",
    note: "Piščančje prsi pridejo v pakiranju 500 g — spodnje količine porabijo cel paket naenkrat za natanko 4 kosila.",
    fiber: 9,
    micro: { vitC: 105.5, iron: 4.1, calcium: 262.1, vitD: 0.1, potassium: 2214.6, folate: 56.1 },
    steps: "Sladki krompir začini s papriko, česnom, timijanom in soljo, spec v pečici/airfryerju na 200 °C ~25 min. Piščanca premešaj z jogurtom, BBQ omako in začimbami, popeci do zlato zapečenega. Za omako zmešaj preostanek jogurta z BBQ omako, limoninim sokom in začimbami. Postrezi s prepraženimi mandlji in svežo solato/kumaro.",
    ing: [
      { name: "Piščančje prsi (cel paket)", unit: "g", qty: 500, rate: { kcal: 105, p: 23, f: 1.5, c: 0 } , core: true },
      { name: "Sladki krompir", unit: "g", qty: 1400, rate: { kcal: 86, p: 1.6, f: 0.1, c: 20 } , priloga: true },
      { name: "Grški jogurt (za piščanca in omako)", unit: "g", qty: 200, rate: { kcal: 63, p: 9, f: 2, c: 3.6 } , brand: "Pilos (Lidl)" },
      { name: "BBQ omaka brez sladkorja", unit: "g", qty: 40, rate: { kcal: 60, p: 1, f: 0.3, c: 13 } , brand: "Kania (Lidl)" },
      { name: "Olivno olje (pršilo)", unit: "kos", qty: 12, rate: { kcal: 9, p: 0, f: 1, c: 0 } , brand: "Primadonna (Lidl)" },
      { name: "Mandlji", unit: "g", qty: 80, rate: { kcal: 590, p: 21, f: 50, c: 9 } },
    ],
  },
  {
    code: "K10",
    type: "kosilo",
    prepMinutes: 30,
    title: "Riba na žaru s krompirjem in blitvo",
    original: "602 kcal / 46 g B / 16 g M / 71 g OH · vlaknine ≈7 g",
    note: "Cela riba (brancin ali orada, cca 350 g bruto na osebo) da približno 150 g očiščenega mesa. Pri nakupu prosi ribarnico, da ribo očisti in odstrani luske — doma jo samo napolniš z začimbami in spečeš.",
    fiber: 7,
    micro: { vitC: 124, iron: 6.9, calcium: 156.5, vitD: 12, potassium: 2688, folate: 94.2 },
    steps: "Ribo od znotraj in zunaj nasoli, popopraj in napolni z rezinami limone, česnom in vejico rožmarina ali timijana. Namažeš z zmesjo olivnega olja in strtega česna ter spečeš na žaru ali v pečici (200 °C, ~20-25 min, odvisno od velikosti). Krompir skuhaj ali speci v pečici. Blitvo/špinačo na hitro podušiš na pršilu olja s strokom česna, na koncu solita in popopraj.",
    ing: [
      { name: "Cela riba (brancin/orada), očiščeno meso", unit: "g", qty: 150, rate: { kcal: 125, p: 24, f: 3, c: 0 } , core: true },
      { name: "Krompir", unit: "g", qty: 320, rate: { kcal: 90, p: 2, f: 0.2, c: 20 } , priloga: true },
      { name: "Blitva/špinača", unit: "g", qty: 200, rate: { kcal: 19, p: 1.8, f: 0.2, c: 3.7 } },
      { name: "Olivno olje s česnom (za marinado/prelivek)", unit: "g", qty: 10, rate: { kcal: 884, p: 0, f: 100, c: 0 } , brand: "Primadonna (Lidl)" },
      { name: "Limona, česen, rožmarin/timijan", unit: "note" },
    ],
  },
  {
    code: "K11",
    type: "kosilo",
    prepMinutes: 20,
    title: "Testenine s tuno",
    original: "620 kcal / 49 g B / 14 g M / 75 g OH · vlaknine ≈6 g",
    fiber: 6,
    micro: { vitC: 22.5, iron: 3.6, calcium: 239, vitD: 2.6, potassium: 946.8, folate: 42.3 },
    steps: "Testenine skuhaj al dente. Na pršilu olja podušite česen, dodaj paradižnikovo mezgo in oljke, kuhaj 5 min. Vmešaj odcejeno tuno in na koncu testenine. Postrezi z naribanim parmezanom in po želji sveženj bazilike ali peteršilja.",
    ing: [
      { name: "Testenine", unit: "g", qty: 90, rate: { kcal: 355, p: 12.5, f: 2, c: 71 } , priloga: true },
      { name: "Tuna v lastnem soku, odcejena (2 konzervi)", unit: "g", qty: 130, rate: { kcal: 100, p: 23, f: 0.7, c: 0 } , core: true , brand: "Nixe (Lidl)" },
      { name: "Paradižnikova mezga", unit: "g", qty: 150, rate: { kcal: 32, p: 1.5, f: 0.3, c: 6.5 } , brand: "Casa Morando (Lidl)" },
      { name: "Črne oljke", unit: "g", qty: 25, rate: { kcal: 145, p: 1, f: 15, c: 3.8 } },
      { name: "Parmezan", unit: "g", qty: 15, rate: { kcal: 392, p: 35, f: 26, c: 4 } , brand: "Grand Padano (Lidl)" },
      { name: "Olivno olje (pršilo)", unit: "kos", qty: 3, rate: { kcal: 9, p: 0, f: 1, c: 0 } , brand: "Primadonna (Lidl)" },
      { name: "Česen, bazilika/peteršilj", unit: "note" },
    ],
  },
  {
    code: "K12",
    type: "kosilo",
    title: "Losos bowl z rižem in zelenjavo",
    batch: 4,
    prepMinutes: 25,
    original: "632 kcal / 30 g B / 28 g M / 66 g OH · vlaknine ≈6 g",
    note: "Losos pri Lidlu pride v pakiranju 400 g — spodnje količine porabijo cel paket naenkrat za natanko 4 kosila.",
    fiber: 6,
    micro: { vitC: 69, iron: 3.86, calcium: 161, vitD: 11, potassium: 1161, folate: 111 },
    steps: "Riž skuhaj in pusti ob strani. Lososa nariši na kocke ali pusti cele kose, na pršilu olja na ponvi ali v pečici (200°C, ~12-15 min) speci do zlato rjave skorjice. Zelenjavo (papriko, korenje, kumare) nareži na tanke rezine. V skledo daj riž, zraven razporedi zelenjavo, lososa, rezine avokada, potresi s sezamovimi semeni in prelij s sojino omako.",
    ing: [
      { name: "Losos (cel paket, 400 g)", unit: "g", qty: 400, rate: { kcal: 200, p: 20, f: 13, c: 0 }, core: true },
      { name: "Riž, kuhan", unit: "g", qty: 720, rate: { kcal: 130, p: 2.7, f: 0.3, c: 28 }, priloga: true },
      { name: "Zelenjava (paprika, korenje, kumare)", unit: "g", qty: 720, rate: { kcal: 22, p: 1, f: 0.2, c: 4 }, priloga: true },
      { name: "Avokado", unit: "g", qty: 240, rate: { kcal: 160, p: 2, f: 15, c: 9 } },
      { name: "Sojina omaka", unit: "g", qty: 40, rate: { kcal: 53, p: 8, f: 0.1, c: 5 }, brand: "Kikkoman" },
      { name: "Sezamova semena", unit: "g", qty: 40, rate: { kcal: 573, p: 17.7, f: 49.7, c: 23.4 } },
    ],
  },
  {
    code: "K13",
    type: "kosilo",
    title: "Losos s testeninami",
    batch: 4,
    prepMinutes: 25,
    original: "604 kcal / 35 g B / 26 g M / 54 g OH · vlaknine ≈4 g",
    note: "Losos pri Lidlu pride v pakiranju 400 g — spodnje količine porabijo cel paket naenkrat za natanko 4 kosila.",
    fiber: 4,
    micro: { vitC: 14, iron: 2.9, calcium: 257, vitD: 11, potassium: 879, folate: 123 },
    steps: "Testenine skuhaj al dente. Lososa na kockah na pršilu olja popeci na ponvi 3-4 min, dodaj smetano za kuhanje in na hitro podušiš, da se rahlo zgosti. Vmešaj svežo špinačo, da ovene. Skuhane testenine zmešaj z omako, postrezi z naribanim parmezanom.",
    ing: [
      { name: "Losos (cel paket, 400 g)", unit: "g", qty: 400, rate: { kcal: 200, p: 20, f: 13, c: 0 }, core: true },
      { name: "Testenine", unit: "g", qty: 280, rate: { kcal: 355, p: 12.5, f: 2, c: 71 }, priloga: true },
      { name: "Smetana za kuhanje 10 %", unit: "g", qty: 240, rate: { kcal: 130, p: 2.5, f: 10, c: 4 }, brand: "Milbona (Lidl)" },
      { name: "Sveža špinača", unit: "g", qty: 200, rate: { kcal: 23, p: 2.9, f: 0.4, c: 3.6 }, priloga: true },
      { name: "Parmezan", unit: "g", qty: 40, rate: { kcal: 392, p: 35, f: 26, c: 4 }, brand: "Grand Padano (Lidl)" },
      { name: "Olivno olje (pršilo)", unit: "kos", qty: 12, rate: { kcal: 9, p: 0, f: 1, c: 0 }, brand: "Primadonna (Lidl)" },
    ],
  },
];

const ALL_RECIPES = [...ZV, ...K];

const SNACKS = [
  { name: "Milka mlečna čokolada", unit: "g", defaultQty: 20, rate: { kcal: 534, p: 6.3, f: 29.8, c: 58 } , category: "Čokolada in sladkarije" },
  { name: "Milka piškoti (Choco Biscuits)", unit: "g", defaultQty: 25, rate: { kcal: 500, p: 6, f: 24, c: 64 } , category: "Čokolada in sladkarije" },
  { name: "Jabolko", unit: "g", defaultQty: 150, rate: { kcal: 52, p: 0.3, f: 0.2, c: 14 } , category: "Sadje" },
  { name: "Banana", unit: "g", defaultQty: 120, rate: { kcal: 90, p: 1, f: 0.3, c: 21 } , category: "Sadje" },
  { name: "Pomaranča", unit: "g", defaultQty: 180, rate: { kcal: 47, p: 0.9, f: 0.1, c: 12 } , category: "Sadje" },
  { name: "Grozdje", unit: "g", defaultQty: 100, rate: { kcal: 69, p: 0.7, f: 0.2, c: 18 } , category: "Sadje" },
  { name: "Skyr naraven", unit: "g", defaultQty: 150, rate: { kcal: 63, p: 11, f: 0.2, c: 4 } , category: "Proteinski izdelki" },
  { name: "Proteinska ploščica", unit: "g", defaultQty: 40, rate: { kcal: 380, p: 30, f: 12, c: 38 } , category: "Proteinski izdelki" },
  { name: "Riževi vaflji", unit: "g", defaultQty: 20, rate: { kcal: 387, p: 8, f: 2.8, c: 82 } , category: "Slani prigrizki" },
  { name: "Temna čokolada (70 %)", unit: "g", defaultQty: 20, rate: { kcal: 580, p: 8, f: 42, c: 40 } , category: "Čokolada in sladkarije" },
  { name: "Mandlji", unit: "g", defaultQty: 20, rate: { kcal: 590, p: 21, f: 50, c: 9 } , category: "Oreščki in semena" },
  { name: "Orehi", unit: "g", defaultQty: 20, rate: { kcal: 654, p: 15, f: 65, c: 14 } , category: "Oreščki in semena" },
  { name: "Slani kokosovi flips/čips", unit: "g", defaultQty: 25, rate: { kcal: 540, p: 6, f: 35, c: 50 } , category: "Slani prigrizki" },
  { name: "Grški jogurt z medom", unit: "g", defaultQty: 150, rate: { kcal: 90, p: 6, f: 2, c: 12 } , category: "Mlečni izdelki" },
  { name: "Mešana sadna solata", unit: "g", defaultQty: 150, rate: { kcal: 55, p: 0.8, f: 0.2, c: 13 } , category: "Sadje" },
  { name: "Skuta s sadjem", unit: "g", defaultQty: 150, rate: { kcal: 100, p: 10, f: 2, c: 12 } , category: "Mlečni izdelki" },
  { name: "Proteinski puding (čokolada/vanilija)", unit: "g", defaultQty: 150, rate: { kcal: 75, p: 10, f: 1.5, c: 6 } , category: "Proteinski izdelki" },
  { name: "Proteinski puding (karamel)", unit: "g", defaultQty: 150, rate: { kcal: 80, p: 9.5, f: 2, c: 7 } , category: "Proteinski izdelki" },
  { name: "Čokoladna pena/mousse (proteinska)", unit: "g", defaultQty: 150, rate: { kcal: 95, p: 8, f: 3, c: 9 } , category: "Proteinski izdelki" },
  { name: "Čokoladna pena/mousse (navadna)", unit: "g", defaultQty: 100, rate: { kcal: 180, p: 4, f: 10, c: 18 } , category: "Mlečni izdelki" },
  { name: "Visokobeljakovinski (High Protein) jogurt", unit: "g", defaultQty: 200, rate: { kcal: 62, p: 10, f: 0.3, c: 4 } , category: "Proteinski izdelki" },
  { name: "Skyr sadni", unit: "g", defaultQty: 150, rate: { kcal: 75, p: 9, f: 0.3, c: 9 } , category: "Proteinski izdelki" },
  { name: "Frutabela Sport Protein rezina, čokolada", unit: "g", defaultQty: 40, rate: { kcal: 167, p: 10.4, f: 6.8, c: 14 }, category: "Proteinski izdelki" },
  { name: "Frutabela Sport Protein rezina, karamela", unit: "g", defaultQty: 40, rate: { kcal: 161, p: 10.4, f: 6.4, c: 14 }, category: "Proteinski izdelki" },
  { name: "Frutabela Sport Protein rezina, banana", unit: "g", defaultQty: 40, rate: { kcal: 154, p: 10.4, f: 5.2, c: 14.4 }, category: "Proteinski izdelki" },
  { name: "Warrior Protein Crunch Bar, bela čokolada", unit: "g", defaultQty: 55, rate: { kcal: 195, p: 21.2, f: 7.3, c: 11.1 }, category: "Proteinski izdelki" },
  { name: "Sportyfeel Protein Bar Neo (Lidl)", unit: "g", defaultQty: 50, rate: { kcal: 190, p: 16, f: 6, c: 15 }, category: "Proteinski izdelki" },
  { name: "Milbona Proteinski puding (Lidl)", unit: "g", defaultQty: 150, rate: { kcal: 95, p: 10, f: 2.5, c: 9 }, category: "Proteinski izdelki" },
  { name: "Milbona Proteinski jogurt na grški način, 0% m.m. (Lidl)", unit: "g", defaultQty: 500, rate: { kcal: 57, p: 10, f: 0, c: 4 }, category: "Proteinski izdelki" },
  { name: "Milbona Proteinski jogurt z granolo in malinami (Lidl)", unit: "g", defaultQty: 185, rate: { kcal: 130, p: 10.8, f: 2.5, c: 17 }, category: "Proteinski izdelki" },
  { name: "Milbona Proteinski sadni jogurt na grški način (Lidl)", unit: "g", defaultQty: 170, rate: { kcal: 90, p: 10, f: 1.5, c: 10 }, category: "Proteinski izdelki" },
  { name: "YoPro Proteinski napitek (Lidl)", unit: "g", defaultQty: 270, rate: { kcal: 45, p: 8.5, f: 0, c: 3 }, category: "Proteinski izdelki" },
  { name: "YoPro Proteinski jogurt (Lidl)", unit: "g", defaultQty: 160, rate: { kcal: 75, p: 9.4, f: 1.5, c: 6 }, category: "Proteinski izdelki" },
  { name: "Dr. Oetker Proteinski kavni napitek (Lidl)", unit: "ml", defaultQty: 250, rate: { kcal: 90, p: 10, f: 2, c: 10 }, category: "Proteinski izdelki" },
  { name: "Proteini.si Proteinska ploščica (Lidl)", unit: "g", defaultQty: 55, rate: { kcal: 380, p: 30, f: 12, c: 35 }, category: "Proteinski izdelki" },
  { name: "Sportyfeel Crunchy Protein Bar (Lidl)", unit: "g", defaultQty: 50, rate: { kcal: 390, p: 32, f: 14, c: 28 }, category: "Proteinski izdelki" },
  { name: "Gelatelli Proteinski sladoled, na palčki 5x70ml (Lidl)", unit: "ml", defaultQty: 70, rate: { kcal: 110, p: 7.4, f: 4, c: 10 }, category: "Proteinski izdelki" },
  { name: "Gelatelli Proteinski sladoled v lončku (Lidl)", unit: "ml", defaultQty: 500, rate: { kcal: 120, p: 5.6, f: 4, c: 14 }, category: "Proteinski izdelki" },
  { name: "Brezkvasni proteinski kruh (Lidl)", unit: "g", defaultQty: 350, rate: { kcal: 230, p: 3.7, f: 3, c: 42 }, category: "Pekovski izdelki" },
  { name: "Pilos Proteinski kefir (Lidl)", unit: "g", defaultQty: 350, rate: { kcal: 55, p: 6.6, f: 0.2, c: 4 }, category: "Proteinski izdelki" },
  { name: "Ljubljanske mlekarne Alpsko mleko s proteini", unit: "ml", defaultQty: 1000, rate: { kcal: 65, p: 6, f: 2, c: 5 }, category: "Mlečni izdelki" },
  { name: "Pilos Proteinska skutna ploščica (Lidl)", unit: "g", defaultQty: 40, rate: { kcal: 180, p: 22, f: 7, c: 10 }, category: "Proteinski izdelki" },
  { name: "Štark Smoki Protein", unit: "g", defaultQty: 70, rate: { kcal: 500, p: 20, f: 25, c: 45 }, category: "Slani prigrizki" },
  { name: "Lay's Slani čips", unit: "g", defaultQty: 30, rate: { kcal: 536, p: 6.6, f: 34.4, c: 52.6 }, category: "Slani prigrizki" },
  { name: "Lay's Paprika čips", unit: "g", defaultQty: 30, rate: { kcal: 533, p: 6.5, f: 34.2, c: 52.3 }, category: "Slani prigrizki" },
  { name: "Lay's Sour Cream & Onion", unit: "g", defaultQty: 30, rate: { kcal: 531, p: 6.5, f: 34.1, c: 52.1 }, category: "Slani prigrizki" },
  { name: "Pringles Original", unit: "g", defaultQty: 30, rate: { kcal: 536, p: 3.9, f: 34.0, c: 53.0 }, category: "Slani prigrizki" },
  { name: "Pringles Paprika", unit: "g", defaultQty: 30, rate: { kcal: 525, p: 4.0, f: 33.0, c: 52.0 }, category: "Slani prigrizki" },
  { name: "Pringles Sour Cream & Onion", unit: "g", defaultQty: 30, rate: { kcal: 527, p: 4.0, f: 33.0, c: 52.0 }, category: "Slani prigrizki" },
  { name: "Chio Chips slani", unit: "g", defaultQty: 30, rate: { kcal: 528, p: 6.5, f: 33.9, c: 51.8 }, category: "Slani prigrizki" },
  { name: "Chio Tortillas Nacho Cheese", unit: "g", defaultQty: 30, rate: { kcal: 490, p: 6.0, f: 31.4, c: 48.1 }, category: "Slani prigrizki" },
  { name: "Doritos Nacho Cheese", unit: "g", defaultQty: 30, rate: { kcal: 498, p: 6.8, f: 26.0, c: 60.0 }, category: "Slani prigrizki" },
  { name: "Cheetos Crunchy", unit: "g", defaultQty: 25, rate: { kcal: 545, p: 6.7, f: 35.0, c: 53.5 }, category: "Slani prigrizki" },
  { name: "Lorenz Crunchips Paprika", unit: "g", defaultQty: 30, rate: { kcal: 522, p: 6.4, f: 33.5, c: 51.2 }, category: "Slani prigrizki" },
  { name: "Smoki (kikirikijev prigrizek)", unit: "g", defaultQty: 30, rate: { kcal: 535, p: 6.6, f: 34.3, c: 52.5 }, category: "Slani prigrizki" },
  { name: "Snack Day Chips slani", unit: "g", defaultQty: 30, rate: { kcal: 530, p: 6.5, f: 34.0, c: 52.0 }, category: "Slani prigrizki" },
  { name: "Chips slani (lastna znamka)", unit: "g", defaultQty: 30, rate: { kcal: 528, p: 6.5, f: 33.9, c: 51.8 }, category: "Slani prigrizki" },
  { name: "Bits2 koruzni čips", unit: "g", defaultQty: 30, rate: { kcal: 515, p: 6.3, f: 33.0, c: 50.5 }, category: "Slani prigrizki" },
  { name: "Lay's Stax (tuba)", unit: "g", defaultQty: 30, rate: { kcal: 540, p: 6.6, f: 34.6, c: 53.0 }, category: "Slani prigrizki" },
  { name: "Kelly's Chips (irski slog)", unit: "g", defaultQty: 30, rate: { kcal: 520, p: 6.4, f: 33.4, c: 51.0 }, category: "Slani prigrizki" },
  { name: "Estrella čips paprika", unit: "g", defaultQty: 30, rate: { kcal: 520, p: 6.4, f: 33.4, c: 51.0 }, category: "Slani prigrizki" },
  { name: "Milka Lešnik", unit: "g", defaultQty: 25, rate: { kcal: 557, p: 7.5, f: 34.0, c: 54.0 }, category: "Čokolada in sladkarije" },
  { name: "Milka Oreo", unit: "g", defaultQty: 25, rate: { kcal: 535, p: 5.5, f: 20.0, c: 69.0 }, category: "Čokolada in sladkarije" },
  { name: "Gorenjka mlečna čokolada", unit: "g", defaultQty: 25, rate: { kcal: 545, p: 7.1, f: 31.3, c: 58.5 }, category: "Čokolada in sladkarije" },
  { name: "Kraš Dorina mlečna čokolada", unit: "g", defaultQty: 25, rate: { kcal: 545, p: 7.1, f: 31.3, c: 58.5 }, category: "Čokolada in sladkarije" },
  { name: "Lindt Excellence 70% kakav", unit: "g", defaultQty: 20, rate: { kcal: 584, p: 7.9, f: 42.0, c: 38.0 }, category: "Čokolada in sladkarije" },
  { name: "Ritter Sport cela lešnik", unit: "g", defaultQty: 25, rate: { kcal: 566, p: 8.0, f: 36.0, c: 51.0 }, category: "Čokolada in sladkarije" },
  { name: "Toblerone mlečna čokolada", unit: "g", defaultQty: 25, rate: { kcal: 534, p: 5.5, f: 29.0, c: 61.0 }, category: "Čokolada in sladkarije" },
  { name: "Kinder Bueno", unit: "g", defaultQty: 43, rate: { kcal: 573, p: 8.5, f: 38.0, c: 50.0 }, category: "Čokolada in sladkarije" },
  { name: "Kinder Chocolate", unit: "g", defaultQty: 12.5, rate: { kcal: 545, p: 7.3, f: 32.0, c: 56.0 }, category: "Čokolada in sladkarije" },
  { name: "Kinder Joy", unit: "g", defaultQty: 20, rate: { kcal: 555, p: 5.5, f: 33.0, c: 56.0 }, category: "Čokolada in sladkarije" },
  { name: "Ferrero Rocher (3 kosi)", unit: "g", defaultQty: 37.5, rate: { kcal: 604, p: 7.6, f: 42.5, c: 46.0 }, category: "Čokolada in sladkarije" },
  { name: "Nutella namaz", unit: "g", defaultQty: 15, rate: { kcal: 539, p: 6.3, f: 30.9, c: 57.5 }, category: "Čokolada in sladkarije" },
  { name: "Twix", unit: "g", defaultQty: 50, rate: { kcal: 495, p: 4.9, f: 24.4, c: 64.4 }, category: "Čokolada in sladkarije" },
  { name: "Snickers", unit: "g", defaultQty: 50, rate: { kcal: 488, p: 9.0, f: 25.0, c: 57.0 }, category: "Čokolada in sladkarije" },
  { name: "Mars batonček", unit: "g", defaultQty: 51, rate: { kcal: 449, p: 4.0, f: 17.0, c: 70.0 }, category: "Čokolada in sladkarije" },
  { name: "Bounty", unit: "g", defaultQty: 57, rate: { kcal: 471, p: 3.6, f: 26.0, c: 55.0 }, category: "Čokolada in sladkarije" },
  { name: "KitKat 4-prstni", unit: "g", defaultQty: 41.5, rate: { kcal: 518, p: 6.5, f: 27.0, c: 62.0 }, category: "Čokolada in sladkarije" },
  { name: "Milky Way", unit: "g", defaultQty: 26, rate: { kcal: 448, p: 3.7, f: 15.0, c: 74.0 }, category: "Čokolada in sladkarije" },
  { name: "Choceur mlečna čokolada", unit: "g", defaultQty: 25, rate: { kcal: 540, p: 7.0, f: 31.0, c: 58.0 }, category: "Čokolada in sladkarije" },
  { name: "Milka Choco Snack", unit: "g", defaultQty: 25, rate: { kcal: 480, p: 6.2, f: 27.6, c: 51.6 }, category: "Čokolada in sladkarije" },
  { name: "Kinder Country", unit: "g", defaultQty: 23.5, rate: { kcal: 495, p: 7.0, f: 27.0, c: 60.0 }, category: "Čokolada in sladkarije" },
  { name: "Kinder Mlečna rezina", unit: "g", defaultQty: 28, rate: { kcal: 375, p: 7.0, f: 20.0, c: 47.0 }, category: "Čokolada in sladkarije" },
  { name: "Oreo original keksi", unit: "g", defaultQty: 33, rate: { kcal: 480, p: 5.5, f: 20.0, c: 69.0 }, category: "Keksi in vafli" },
  { name: "Petit Beurre keksi", unit: "g", defaultQty: 25, rate: { kcal: 440, p: 6.1, f: 17.8, c: 63.7 }, category: "Keksi in vafli" },
  { name: "Napolitanke lešnik", unit: "g", defaultQty: 30, rate: { kcal: 505, p: 7.0, f: 20.4, c: 73.1 }, category: "Keksi in vafli" },
  { name: "Plazma keks", unit: "g", defaultQty: 30, rate: { kcal: 462, p: 6.4, f: 18.7, c: 66.8 }, category: "Keksi in vafli" },
  { name: "Domaćica keksi", unit: "g", defaultQty: 30, rate: { kcal: 465, p: 6.4, f: 18.8, c: 67.3 }, category: "Keksi in vafli" },
  { name: "Manner Neapolitaner vafli", unit: "g", defaultQty: 25, rate: { kcal: 523, p: 6.8, f: 19.9, c: 71.3 }, category: "Keksi in vafli" },
  { name: "Leibniz Butterkeks", unit: "g", defaultQty: 25, rate: { kcal: 463, p: 6.4, f: 18.7, c: 67.0 }, category: "Keksi in vafli" },
  { name: "McVitie's Digestive", unit: "g", defaultQty: 30, rate: { kcal: 471, p: 6.5, f: 19.0, c: 68.1 }, category: "Keksi in vafli" },
  { name: "Barni medvedki mlečni", unit: "g", defaultQty: 30, rate: { kcal: 440, p: 6.1, f: 17.8, c: 63.7 }, category: "Keksi in vafli" },
  { name: "Tedi keksi z lešnikom", unit: "g", defaultQty: 30, rate: { kcal: 500, p: 6.9, f: 20.2, c: 72.3 }, category: "Keksi in vafli" },
  { name: "Vitalis müsli keksi", unit: "g", defaultQty: 25, rate: { kcal: 430, p: 5.9, f: 17.4, c: 62.2 }, category: "Keksi in vafli" },
  { name: "Crownfield vafli", unit: "g", defaultQty: 25, rate: { kcal: 520, p: 6.8, f: 19.9, c: 71.2 }, category: "Keksi in vafli" },
  { name: "Choco Leibniz", unit: "g", defaultQty: 25, rate: { kcal: 493, p: 6.8, f: 19.9, c: 71.3 }, category: "Keksi in vafli" },
  { name: "Haribo Goldbären", unit: "g", defaultQty: 30, rate: { kcal: 343, p: 6.9, f: 0.5, c: 77.0 }, category: "Bomboni in sladkarije" },
  { name: "Haribo Fun Mix", unit: "g", defaultQty: 30, rate: { kcal: 350, p: 5.5, f: 3.0, c: 78.0 }, category: "Bomboni in sladkarije" },
  { name: "Skittles", unit: "g", defaultQty: 40, rate: { kcal: 397, p: 0.0, f: 4.5, c: 90.0 }, category: "Bomboni in sladkarije" },
  { name: "M&M's mlečna čokolada", unit: "g", defaultQty: 30, rate: { kcal: 483, p: 4.6, f: 20.0, c: 68.0 }, category: "Bomboni in sladkarije" },
  { name: "M&M's Peanut", unit: "g", defaultQty: 30, rate: { kcal: 493, p: 9.0, f: 24.0, c: 60.0 }, category: "Bomboni in sladkarije" },
  { name: "Chupa Chups lizika (mešano)", unit: "g", defaultQty: 12, rate: { kcal: 394, p: 0.0, f: 0.0, c: 98.0 }, category: "Bomboni in sladkarije" },
  { name: "Sour Patch Kids", unit: "g", defaultQty: 30, rate: { kcal: 340, p: 0.0, f: 0.0, c: 84.0 }, category: "Bomboni in sladkarije" },
  { name: "Werther's Original karamela", unit: "g", defaultQty: 20, rate: { kcal: 405, p: 0.8, f: 9.5, c: 79.0 }, category: "Bomboni in sladkarije" },
  { name: "Sončnična semena praženo-soljena", unit: "g", defaultQty: 30, rate: { kcal: 590, p: 20.0, f: 51.0, c: 15.0 }, category: "Oreščki in semena" },
  { name: "Arašidi praženi soljeni", unit: "g", defaultQty: 30, rate: { kcal: 590, p: 20.0, f: 51.0, c: 15.0 }, category: "Oreščki in semena" },
  { name: "Mandeljni naravni", unit: "g", defaultQty: 25, rate: { kcal: 579, p: 19.6, f: 50.0, c: 14.7 }, category: "Oreščki in semena" },
  { name: "Lešniki naravni", unit: "g", defaultQty: 25, rate: { kcal: 646, p: 21.9, f: 55.8, c: 16.4 }, category: "Oreščki in semena" },
  { name: "Pistacije praženo-soljene", unit: "g", defaultQty: 30, rate: { kcal: 562, p: 19.1, f: 48.6, c: 14.3 }, category: "Oreščki in semena" },
  { name: "Orehove polovice", unit: "g", defaultQty: 25, rate: { kcal: 654, p: 22.2, f: 56.5, c: 16.6 }, category: "Oreščki in semena" },
  { name: "Indijski oreščki (cashew)", unit: "g", defaultQty: 30, rate: { kcal: 553, p: 18.7, f: 47.8, c: 14.1 }, category: "Oreščki in semena" },
  { name: "Mešani oreščki (party mix)", unit: "g", defaultQty: 30, rate: { kcal: 600, p: 20.3, f: 51.9, c: 15.3 }, category: "Oreščki in semena" },
  { name: "Bučna semena", unit: "g", defaultQty: 25, rate: { kcal: 559, p: 18.9, f: 48.3, c: 14.2 }, category: "Oreščki in semena" },
  { name: "Prekajeni mandeljni", unit: "g", defaultQty: 25, rate: { kcal: 598, p: 20.3, f: 51.7, c: 15.2 }, category: "Oreščki in semena" },
  { name: "TUC krekerji original", unit: "g", defaultQty: 25, rate: { kcal: 502, p: 9.8, f: 18.6, c: 69.8 }, category: "Slani prigrizki" },
  { name: "TUC Sandwich sir", unit: "g", defaultQty: 25, rate: { kcal: 520, p: 10.2, f: 19.2, c: 72.3 }, category: "Slani prigrizki" },
  { name: "Bake Rolls slani", unit: "g", defaultQty: 25, rate: { kcal: 428, p: 8.4, f: 15.8, c: 59.5 }, category: "Slani prigrizki" },
  { name: "Grissini slane palčke", unit: "g", defaultQty: 20, rate: { kcal: 431, p: 8.4, f: 15.9, c: 60.0 }, category: "Slani prigrizki" },
  { name: "Ritz krekerji", unit: "g", defaultQty: 25, rate: { kcal: 495, p: 9.7, f: 18.3, c: 68.9 }, category: "Slani prigrizki" },
  { name: "Sirovi krekerji (lastna znamka)", unit: "g", defaultQty: 25, rate: { kcal: 500, p: 9.8, f: 18.5, c: 69.6 }, category: "Slani prigrizki" },
  { name: "3 Bit krekerji", unit: "g", defaultQty: 25, rate: { kcal: 470, p: 9.2, f: 17.4, c: 65.4 }, category: "Slani prigrizki" },
  { name: "Snyder's of Hanover pretzels", unit: "g", defaultQty: 30, rate: { kcal: 380, p: 7.4, f: 14.0, c: 52.9 }, category: "Slani prigrizki" },
  { name: "Lorenz Saltletts pretzels", unit: "g", defaultQty: 30, rate: { kcal: 386, p: 7.6, f: 14.3, c: 53.7 }, category: "Slani prigrizki" },
  { name: "Corny Classic müsli batonček", unit: "g", defaultQty: 25, rate: { kcal: 450, p: 6.6, f: 12.1, c: 74.6 }, category: "Žita in musli" },
  { name: "Corny Free (brez dodanega sladkorja)", unit: "g", defaultQty: 20, rate: { kcal: 415, p: 6.1, f: 11.1, c: 68.8 }, category: "Žita in musli" },
  { name: "Nutri-Grain sadni batonček", unit: "g", defaultQty: 37, rate: { kcal: 375, p: 5.5, f: 10.1, c: 62.2 }, category: "Žita in musli" },
  { name: "Frutabela sadna rezina", unit: "g", defaultQty: 30, rate: { kcal: 380, p: 5.6, f: 10.2, c: 63.0 }, category: "Žita in musli" },
  { name: "Alpen müsli batonček", unit: "g", defaultQty: 29, rate: { kcal: 430, p: 6.3, f: 11.5, c: 71.3 }, category: "Žita in musli" },
  { name: "Special K batonček", unit: "g", defaultQty: 22, rate: { kcal: 395, p: 5.8, f: 10.6, c: 65.5 }, category: "Žita in musli" },
  { name: "Popcorn mikrovalovni maslen", unit: "g", defaultQty: 30, rate: { kcal: 480, p: 7.6, f: 21.8, c: 63.3 }, category: "Popcorn in riževi vaflji" },
  { name: "Popcorn sladki karamelni", unit: "g", defaultQty: 30, rate: { kcal: 440, p: 7.0, f: 20.0, c: 58.0 }, category: "Popcorn in riževi vaflji" },
  { name: "Riževi vaflji naravni", unit: "g", defaultQty: 20, rate: { kcal: 387, p: 7.9, f: 2.0, c: 81.4 }, category: "Popcorn in riževi vaflji" },
  { name: "Riževi vaflji čokoladni", unit: "g", defaultQty: 20, rate: { kcal: 460, p: 8.5, f: 2.2, c: 87.3 }, category: "Popcorn in riževi vaflji" },
  { name: "Magnum Classic", unit: "g", defaultQty: 80, rate: { kcal: 330, p: 4.7, f: 18.9, c: 34.2 }, category: "Sladoled in zamrznjeni prigrizki" },
  { name: "Cornetto Classico", unit: "g", defaultQty: 90, rate: { kcal: 250, p: 3.6, f: 14.3, c: 25.9 }, category: "Sladoled in zamrznjeni prigrizki" },
  { name: "Milka sladoledni sendvič", unit: "g", defaultQty: 100, rate: { kcal: 280, p: 4.0, f: 16.0, c: 29.0 }, category: "Sladoled in zamrznjeni prigrizki" },
  { name: "Lino Lada namaz", unit: "g", defaultQty: 15, rate: { kcal: 540, p: 6.0, f: 32.0, c: 56.0 }, category: "Slovenski specialiteti" },
  { name: "Bajadera pralineji", unit: "g", defaultQty: 25, rate: { kcal: 520, p: 6.2, f: 29.1, c: 57.2 }, category: "Slovenski specialiteti" },
  { name: "Cockta bomboni", unit: "g", defaultQty: 20, rate: { kcal: 390, p: 0.0, f: 1.0, c: 92.0 }, category: "Slovenski specialiteti" },
  { name: "Grand kava keksi", unit: "g", defaultQty: 25, rate: { kcal: 470, p: 6.5, f: 19.0, c: 68.0 }, category: "Slovenski specialiteti" },
  { name: "Griotte praline", unit: "g", defaultQty: 25, rate: { kcal: 430, p: 5.2, f: 24.1, c: 47.3 }, category: "Slovenski specialiteti" },
  { name: "7Days croissant čokoladni", unit: "g", defaultQty: 80, rate: { kcal: 420, p: 6.0, f: 22.0, c: 50.0 }, category: "Drugo" },
  { name: "Vanilijev puding", unit: "g", defaultQty: 150, rate: { kcal: 110, p: 3.5, f: 3, c: 18 } , category: "Mlečni izdelki" },
  { name: "Datlji, suhi", unit: "g", defaultQty: 40, rate: { kcal: 282, p: 2.5, f: 0.4, c: 75 } , category: "Sadje" },
  { name: "Popkorn (naraven)", unit: "g", defaultQty: 25, rate: { kcal: 385, p: 11, f: 5, c: 74 } , category: "Slani prigrizki" },
  // -- mlečni izdelki --
  { name: "Navadni jogurt (3,5 %)", unit: "g", defaultQty: 150, rate: { kcal: 62, p: 3.5, f: 3.5, c: 4.5 } , category: "Mlečni izdelki" },
  { name: "Kefir", unit: "g", defaultQty: 200, rate: { kcal: 55, p: 3.3, f: 2, c: 4.5 } , category: "Mlečni izdelki" },
  { name: "Sirni narezek (Gouda/Edamec)", unit: "g", defaultQty: 30, rate: { kcal: 350, p: 25, f: 27, c: 1 } , category: "Mlečni izdelki" },
  { name: "Sveža mocarela (kroglice)", unit: "g", defaultQty: 50, rate: { kcal: 280, p: 22, f: 21, c: 2 } , category: "Mlečni izdelki" },
  { name: "Skutni namaz (svež sir za mazanje)", unit: "g", defaultQty: 30, rate: { kcal: 245, p: 6, f: 23, c: 4 } , category: "Mlečni izdelki" },
  { name: "Sladoled (vaniljev)", unit: "g", defaultQty: 100, rate: { kcal: 207, p: 3.5, f: 11, c: 23 } , category: "Mlečni izdelki" },
  // -- mesni narezki --
  { name: "Pršut/panceta narezek", unit: "g", defaultQty: 30, rate: { kcal: 195, p: 27, f: 9, c: 0.5 } , category: "Mesni narezki" },
  { name: "Šunka (pusta, narezki)", unit: "g", defaultQty: 40, rate: { kcal: 110, p: 20, f: 3, c: 1 } , category: "Mesni narezki" },
  { name: "Piščančja prsa, dimljena (narezek)", unit: "g", defaultQty: 40, rate: { kcal: 105, p: 20, f: 2, c: 1 } , category: "Mesni narezki" },
  // -- pekovski izdelki --
  { name: "Žemlja/hlebček", unit: "g", defaultQty: 60, rate: { kcal: 265, p: 8, f: 1.5, c: 53 } , category: "Pekovski izdelki" },
  { name: "Krekerji (slani)", unit: "g", defaultQty: 25, rate: { kcal: 440, p: 9, f: 15, c: 68 } , category: "Slani prigrizki" },
  { name: "Grisini", unit: "g", defaultQty: 20, rate: { kcal: 400, p: 11, f: 8, c: 72 } , category: "Pekovski izdelki" },
  { name: "Domači kruh z maslom", unit: "g", defaultQty: 50, rate: { kcal: 300, p: 7, f: 12, c: 40 } , category: "Pekovski izdelki" },
  // -- namazi --
  { name: "Arašidovo maslo", unit: "g", defaultQty: 20, rate: { kcal: 590, p: 25, f: 50, c: 8 } , category: "Oreščki in semena" },
  { name: "Lešnikov namaz (Nutella tip)", unit: "g", defaultQty: 20, rate: { kcal: 539, p: 6, f: 31, c: 58 } , category: "Čokolada in sladkarije" },
  { name: "Marmelada/džem", unit: "g", defaultQty: 20, rate: { kcal: 250, p: 0.3, f: 0.1, c: 62 } , category: "Čokolada in sladkarije" },
  { name: "Hummus", unit: "g", defaultQty: 50, rate: { kcal: 240, p: 7, f: 15, c: 20 } , category: "Namazi" },
  { name: "Guacamole", unit: "g", defaultQty: 50, rate: { kcal: 150, p: 2, f: 13, c: 6 } , category: "Namazi" },
  // -- slani prigrizki --
  { name: "Tortilja čips", unit: "g", defaultQty: 30, rate: { kcal: 480, p: 7, f: 24, c: 60 } , category: "Slani prigrizki" },
  { name: "Slane palčke", unit: "g", defaultQty: 30, rate: { kcal: 380, p: 10, f: 3, c: 75 } , category: "Slani prigrizki" },
  { name: "Mešani oreščki, nesoljeni", unit: "g", defaultQty: 25, rate: { kcal: 600, p: 18, f: 52, c: 15 } , category: "Oreščki in semena" },
  { name: "Rozine/mešano suho sadje", unit: "g", defaultQty: 30, rate: { kcal: 300, p: 2.5, f: 0.5, c: 70 } , category: "Sadje" },
  // -- žita/musli --
  { name: "Müsli ploščica", unit: "g", defaultQty: 30, rate: { kcal: 430, p: 7, f: 16, c: 62 } , category: "Žita in musli" },
  { name: "Musli s čokolado", unit: "g", defaultQty: 50, rate: { kcal: 400, p: 8, f: 12, c: 65 } , category: "Žita in musli" },
  { name: "Kosmiči (čokoladni)", unit: "g", defaultQty: 40, rate: { kcal: 390, p: 6, f: 5, c: 78 } , category: "Žita in musli" },
  // -- pijače --
  { name: "Sadni sok (100 %)", unit: "ml", defaultQty: 200, rate: { kcal: 45, p: 0.5, f: 0.1, c: 10.5 } , category: "Pijače" },
  { name: "Rastlinski napitek (ovseni/mandljev)", unit: "ml", defaultQty: 200, rate: { kcal: 45, p: 0.5, f: 1.5, c: 7 } , category: "Pijače" },
  { name: "Ledeni čaj", unit: "ml", defaultQty: 250, rate: { kcal: 35, p: 0, f: 0, c: 8.5 } , category: "Pijače" },
  { name: "Coca-Cola Original (pločevinka)", unit: "g", defaultQty: 330, rate: { kcal: 42, p: 0, f: 0, c: 10.6 }, category: "Pijače" },
  { name: "Coca-Cola Zero (pločevinka)", unit: "g", defaultQty: 330, rate: { kcal: 0, p: 0, f: 0, c: 0.1 }, category: "Pijače" },
  { name: "Fanta Pomaranča", unit: "g", defaultQty: 330, rate: { kcal: 45, p: 0, f: 0, c: 11 }, category: "Pijače" },
  { name: "Sprite", unit: "g", defaultQty: 330, rate: { kcal: 39, p: 0, f: 0, c: 10.5 }, category: "Pijače" },
  { name: "Cockta (brezalkoholna pijača)", unit: "g", defaultQty: 330, rate: { kcal: 39, p: 0.4, f: 0.0, c: 8.7 }, category: "Pijače" },
  { name: "Radenska Klasik (mineralna voda)", unit: "g", defaultQty: 500, rate: { kcal: 0, p: 0.0, f: 0.0, c: 0.0 }, category: "Pijače" },
  { name: "Radenska Naturelle", unit: "g", defaultQty: 500, rate: { kcal: 0, p: 0.0, f: 0.0, c: 0.0 }, category: "Pijače" },
  { name: "Fruc breskev nektar", unit: "g", defaultQty: 200, rate: { kcal: 46, p: 0.5, f: 0.0, c: 10.2 }, category: "Pijače" },
  { name: "Fruc pomaranča", unit: "g", defaultQty: 200, rate: { kcal: 45, p: 0.5, f: 0.0, c: 10.0 }, category: "Pijače" },
  { name: "Jana negazirana voda", unit: "g", defaultQty: 500, rate: { kcal: 0, p: 0.0, f: 0.0, c: 0.0 }, category: "Pijače" },
  { name: "Ledeni čaj breskev", unit: "g", defaultQty: 330, rate: { kcal: 27, p: 0.3, f: 0.0, c: 6.0 }, category: "Pijače" },
  { name: "Red Bull energijska pijača", unit: "g", defaultQty: 250, rate: { kcal: 45, p: 0.5, f: 0, c: 11 }, category: "Pijače" },
  { name: "Bravo sok jabolko", unit: "g", defaultQty: 200, rate: { kcal: 46, p: 0.5, f: 0.0, c: 10.2 }, category: "Pijače" },
  { name: "Next sok mango", unit: "g", defaultQty: 200, rate: { kcal: 54, p: 0.6, f: 0.0, c: 12.0 }, category: "Pijače" },
  { name: "Nescafe ledena kava", unit: "g", defaultQty: 250, rate: { kcal: 55, p: 0.6, f: 0.0, c: 12.2 }, category: "Pijače" },
  { name: "Monster Energy", unit: "g", defaultQty: 500, rate: { kcal: 47, p: 0.5, f: 0.0, c: 10.4 }, category: "Pijače" },
  { name: "Powerade modra pomaranča", unit: "g", defaultQty: 500, rate: { kcal: 24, p: 0.3, f: 0.0, c: 5.3 }, category: "Pijače" },
  { name: "Activia jogurt naravni", unit: "g", defaultQty: 125, rate: { kcal: 65, p: 3.2, f: 2.0, c: 5.2 }, category: "Mlečni izdelki" },
  { name: "Actimel jagoda", unit: "g", defaultQty: 100, rate: { kcal: 65, p: 3.2, f: 2.0, c: 5.2 }, category: "Mlečni izdelki" },
  { name: "Danonino sadni jogurt", unit: "g", defaultQty: 100, rate: { kcal: 96, p: 4.8, f: 2.9, c: 7.7 }, category: "Mlečni izdelki" },
  { name: "Mu jogurt sadni", unit: "g", defaultQty: 150, rate: { kcal: 90, p: 4.5, f: 2.7, c: 7.2 }, category: "Mlečni izdelki" },
  { name: "Jogurt grški 10 % m.m.", unit: "g", defaultQty: 150, rate: { kcal: 130, p: 4, f: 10, c: 3.6 }, category: "Mlečni izdelki" },
  { name: "Skyr naravni", unit: "g", defaultQty: 150, rate: { kcal: 63, p: 3.1, f: 1.9, c: 5.0 }, category: "Mlečni izdelki" },
  { name: "Sirni namaz", unit: "g", defaultQty: 30, rate: { kcal: 260, p: 9, f: 23, c: 4 }, category: "Mlečni izdelki" },
  { name: "Ementalec sir 45 % m.m.", unit: "g", defaultQty: 30, rate: { kcal: 380, p: 28, f: 30, c: 1 }, category: "Mlečni izdelki" },
  { name: "Kravji sir Bohinjc", unit: "g", defaultQty: 30, rate: { kcal: 350, p: 25, f: 27, c: 2 }, category: "Mlečni izdelki" },
  { name: "Skuta z zelišči (namaz)", unit: "g", defaultQty: 30, rate: { kcal: 150, p: 10, f: 9, c: 3 }, category: "Mlečni izdelki" },
  { name: "Puding čokoladni", unit: "g", defaultQty: 125, rate: { kcal: 120, p: 3.5, f: 3, c: 19 }, category: "Mlečni izdelki" },
  { name: "Aktivia pitni jogurt", unit: "g", defaultQty: 280, rate: { kcal: 65, p: 3.2, f: 2.0, c: 5.2 }, category: "Mlečni izdelki" },
  { name: "Mleko čokoladno", unit: "g", defaultQty: 250, rate: { kcal: 75, p: 3.8, f: 2.2, c: 6.0 }, category: "Mlečni izdelki" },
  { name: "Sadni jogurt pitni", unit: "g", defaultQty: 250, rate: { kcal: 80, p: 4.0, f: 2.4, c: 6.4 }, category: "Mlečni izdelki" },
  { name: "Sirček (namazljivi sirček)", unit: "g", defaultQty: 20, rate: { kcal: 300, p: 10, f: 26, c: 3 }, category: "Mlečni izdelki" },
  { name: "Sirni trikotnički", unit: "g", defaultQty: 30, rate: { kcal: 270, p: 9, f: 24, c: 4 }, category: "Mlečni izdelki" },
  { name: "Ementalec v rezinah", unit: "g", defaultQty: 30, rate: { kcal: 380, p: 28, f: 30, c: 1 }, category: "Mlečni izdelki" },
  { name: "Camembert", unit: "g", defaultQty: 30, rate: { kcal: 300, p: 20, f: 24, c: 1 }, category: "Mlečni izdelki" },
  { name: "Walkers čips slani", unit: "g", defaultQty: 30, rate: { kcal: 532, p: 6.5, f: 34.1, c: 52.2 }, category: "Slani prigrizki" },
  { name: "Pringles Hot & Spicy", unit: "g", defaultQty: 30, rate: { kcal: 522, p: 6.4, f: 33.5, c: 51.2 }, category: "Slani prigrizki" },
  { name: "Tortilla čips soljeni", unit: "g", defaultQty: 30, rate: { kcal: 490, p: 6.0, f: 31.4, c: 48.1 }, category: "Slani prigrizki" },
  { name: "Sirovi krekerji Ritz Cheese", unit: "g", defaultQty: 25, rate: { kcal: 490, p: 9.6, f: 18.1, c: 68.2 }, category: "Slani prigrizki" },
  { name: "Fritos koruzni čips", unit: "g", defaultQty: 30, rate: { kcal: 540, p: 6.6, f: 34.6, c: 53.0 }, category: "Slani prigrizki" },
  { name: "Chio Ranch čips", unit: "g", defaultQty: 30, rate: { kcal: 525, p: 6.4, f: 33.7, c: 51.5 }, category: "Slani prigrizki" },
  { name: "Lay's Wavy Chips", unit: "g", defaultQty: 30, rate: { kcal: 540, p: 6.6, f: 34.6, c: 53.0 }, category: "Slani prigrizki" },
  { name: "Estrella popcorn slan", unit: "g", defaultQty: 30, rate: { kcal: 480, p: 5.9, f: 30.8, c: 47.1 }, category: "Slani prigrizki" },
  { name: "Tortilla Chips Chilli", unit: "g", defaultQty: 30, rate: { kcal: 470, p: 5.8, f: 30.2, c: 46.1 }, category: "Slani prigrizki" },
  { name: "Milka Tender čokoladno pecivo", unit: "g", defaultQty: 25, rate: { kcal: 480, p: 6.2, f: 27.6, c: 51.6 }, category: "Čokolada in sladkarije" },
  { name: "Kinder Pingui", unit: "g", defaultQty: 30, rate: { kcal: 380, p: 4.9, f: 21.8, c: 40.8 }, category: "Čokolada in sladkarije" },
  { name: "Kinder Happy Hippo", unit: "g", defaultQty: 20.7, rate: { kcal: 530, p: 6.9, f: 30.4, c: 56.9 }, category: "Čokolada in sladkarije" },
  { name: "Twix Xtra", unit: "g", defaultQty: 75, rate: { kcal: 495, p: 4.9, f: 24.4, c: 64.4 }, category: "Čokolada in sladkarije" },
  { name: "Bounty Dark", unit: "g", defaultQty: 57, rate: { kcal: 469, p: 3.6, f: 26, c: 55 }, category: "Čokolada in sladkarije" },
  { name: "Toblerone temna čokolada", unit: "g", defaultQty: 25, rate: { kcal: 517, p: 5.5, f: 29, c: 61 }, category: "Čokolada in sladkarije" },
  { name: "Milka Alpine Milk mini kroglice", unit: "g", defaultQty: 25, rate: { kcal: 540, p: 7.0, f: 31.0, c: 58.0 }, category: "Čokolada in sladkarije" },
  { name: "Merci Assorted", unit: "g", defaultQty: 25, rate: { kcal: 540, p: 7.0, f: 31.0, c: 58.0 }, category: "Čokolada in sladkarije" },
  { name: "Raffaello", unit: "g", defaultQty: 37.5, rate: { kcal: 596, p: 7.1, f: 31.6, c: 59.2 }, category: "Čokolada in sladkarije" },
  { name: "Lindor kroglice mlečne", unit: "g", defaultQty: 25, rate: { kcal: 555, p: 7.2, f: 31.9, c: 59.6 }, category: "Čokolada in sladkarije" },
  { name: "Pez bonboni", unit: "g", defaultQty: 8.5, rate: { kcal: 390, p: 1.0, f: 1.0, c: 92.4 }, category: "Bomboni in sladkarije" },
  { name: "Rozine (sušeno grozdje)", unit: "g", defaultQty: 30, rate: { kcal: 299, p: 3.1, f: 0.5, c: 79 }, category: "Sadje" },
  { name: "Suhe fige", unit: "g", defaultQty: 30, rate: { kcal: 249, p: 3.3, f: 0.9, c: 63.9 }, category: "Sadje" },
  { name: "Suhe marelice", unit: "g", defaultQty: 30, rate: { kcal: 241, p: 3.4, f: 0.5, c: 63 }, category: "Sadje" },
  { name: "Datlji brez koščice", unit: "g", defaultQty: 30, rate: { kcal: 282, p: 2.5, f: 0.4, c: 75 }, category: "Sadje" },
  { name: "Trail mix (oreščki in sadje)", unit: "g", defaultQty: 30, rate: { kcal: 450, p: 15.3, f: 38.9, c: 11.4 }, category: "Oreščki in semena" },
  { name: "Kokosovi čips", unit: "g", defaultQty: 20, rate: { kcal: 630, p: 21.4, f: 54.5, c: 16.0 }, category: "Oreščki in semena" },
  { name: "Ben & Jerry's Cookie Dough", unit: "g", defaultQty: 100, rate: { kcal: 250, p: 3.6, f: 14.3, c: 25.9 }, category: "Sladoled in zamrznjeni prigrizki" },
  { name: "Häagen-Dazs vanilija", unit: "g", defaultQty: 100, rate: { kcal: 245, p: 3.5, f: 14.0, c: 25.4 }, category: "Sladoled in zamrznjeni prigrizki" },
  { name: "Solero sladoledna štručka", unit: "g", defaultQty: 90, rate: { kcal: 130, p: 1.9, f: 7.4, c: 13.5 }, category: "Sladoled in zamrznjeni prigrizki" },
  { name: "Nogger Choc", unit: "g", defaultQty: 90, rate: { kcal: 260, p: 3.7, f: 14.9, c: 26.9 }, category: "Sladoled in zamrznjeni prigrizki" },
  { name: "Lujo sladoledna torta (rezina)", unit: "g", defaultQty: 100, rate: { kcal: 230, p: 3.3, f: 13.1, c: 23.8 }, category: "Sladoled in zamrznjeni prigrizki" },
  { name: "Listnato testo s slanino (zamrznjeno)", unit: "g", defaultQty: 50, rate: { kcal: 320, p: 6.3, f: 11.8, c: 44.5 }, category: "Slani prigrizki" },
  { name: "Slani polžki s sirom (zamrznjeno pecivo)", unit: "g", defaultQty: 50, rate: { kcal: 350, p: 6.8, f: 12.9, c: 48.7 }, category: "Slani prigrizki" },
  { name: "Mini pizza rezine (zamrznjene)", unit: "g", defaultQty: 100, rate: { kcal: 250, p: 4.0, f: 11.4, c: 33.0 }, category: "Popcorn in riževi vaflji" },
  { name: "Corny Big čokolada", unit: "g", defaultQty: 50, rate: { kcal: 430, p: 6.3, f: 11.5, c: 71.3 }, category: "Žita in musli" },
  { name: "Milka Little Moo bonboni", unit: "g", defaultQty: 30, rate: { kcal: 420, p: 1.1, f: 1.1, c: 99.5 }, category: "Bomboni in sladkarije" },
  { name: "Werther's Original mehke karamele", unit: "g", defaultQty: 20, rate: { kcal: 435, p: 2, f: 9, c: 78 }, category: "Bomboni in sladkarije" },
  { name: "Ledeni čaj FuzeTea limona", unit: "g", defaultQty: 330, rate: { kcal: 20, p: 0.2, f: 0.0, c: 4.4 }, category: "Pijače" },
  { name: "Frutek sadna kašica jabolko", unit: "g", defaultQty: 100, rate: { kcal: 65, p: 3.2, f: 2.0, c: 5.2 }, category: "Mlečni izdelki" },
  { name: "Fruc sadna rezina", unit: "g", defaultQty: 22, rate: { kcal: 350, p: 4.5, f: 20.1, c: 37.6 }, category: "Čokolada in sladkarije" },
  { name: "Bebeto gumi bomboni", unit: "g", defaultQty: 30, rate: { kcal: 330, p: 0.9, f: 0.9, c: 78.2 }, category: "Bomboni in sladkarije" },
  { name: "Kolibri gumi bomboni", unit: "g", defaultQty: 30, rate: { kcal: 340, p: 0.9, f: 0.9, c: 80.5 }, category: "Bomboni in sladkarije" },
  { name: "Smoki jumbo", unit: "g", defaultQty: 30, rate: { kcal: 535, p: 6.6, f: 34.3, c: 52.5 }, category: "Slani prigrizki" },
  { name: "Cheetos Flamin' Hot", unit: "g", defaultQty: 25, rate: { kcal: 545, p: 6.7, f: 35.0, c: 53.5 }, category: "Slani prigrizki" },
  { name: "Corny Nut müsli batonček", unit: "g", defaultQty: 40, rate: { kcal: 500, p: 6.9, f: 12.7, c: 78.4 }, category: "Žita in musli" },
  { name: "Prote proteinska ploščica", unit: "g", defaultQty: 35, rate: { kcal: 380, p: 5.6, f: 10.2, c: 63.0 }, category: "Žita in musli" },
  { name: "Grenade Carb Killa", unit: "g", defaultQty: 60, rate: { kcal: 410, p: 6.0, f: 11.0, c: 68.0 }, category: "Žita in musli" },
  { name: "Wasa Sport prepečenec", unit: "g", defaultQty: 25, rate: { kcal: 335, p: 6.6, f: 12.4, c: 46.6 }, category: "Slani prigrizki" },
  { name: "Rakete čokoladne", unit: "g", defaultQty: 30, rate: { kcal: 500, p: 6.9, f: 20.2, c: 72.3 }, category: "Keksi in vafli" },
  { name: "Kiki keksi", unit: "g", defaultQty: 30, rate: { kcal: 460, p: 6.4, f: 18.6, c: 66.6 }, category: "Keksi in vafli" },
  { name: "Napolitanke vanilija", unit: "g", defaultQty: 30, rate: { kcal: 500, p: 6.9, f: 20.2, c: 72.3 }, category: "Keksi in vafli" },
  { name: "Cappuccino v pločevinki", unit: "g", defaultQty: 250, rate: { kcal: 65, p: 0.7, f: 0.0, c: 14.4 }, category: "Pijače" },
  { name: "Nestea limona (0,5 L)", unit: "g", defaultQty: 330, rate: { kcal: 20, p: 0.2, f: 0.0, c: 4.4 }, category: "Pijače" },
  { name: "Cornetto Enigma", unit: "g", defaultQty: 110, rate: { kcal: 250, p: 3.6, f: 14.3, c: 25.9 }, category: "Sladoled in zamrznjeni prigrizki" },
  { name: "Twister sladoled", unit: "g", defaultQty: 70, rate: { kcal: 150, p: 2.1, f: 8.6, c: 15.5 }, category: "Sladoled in zamrznjeni prigrizki" },
  { name: "Calippo sadni sladoled", unit: "g", defaultQty: 105, rate: { kcal: 90, p: 1.3, f: 5.1, c: 9.3 }, category: "Sladoled in zamrznjeni prigrizki" },
  { name: "Kinder Maxi King", unit: "g", defaultQty: 35, rate: { kcal: 530, p: 6.9, f: 30.4, c: 56.9 }, category: "Čokolada in sladkarije" },
  { name: "Milka Daim", unit: "g", defaultQty: 25, rate: { kcal: 510, p: 6.6, f: 29.3, c: 54.8 }, category: "Čokolada in sladkarije" },
  { name: "Ricola zeliščni bonboni", unit: "g", defaultQty: 10, rate: { kcal: 390, p: 1.0, f: 1.0, c: 92.4 }, category: "Bomboni in sladkarije" },
  { name: "Tuc Bits (mini krekerji)", unit: "g", defaultQty: 25, rate: { kcal: 490, p: 9.6, f: 18.1, c: 68.2 }, category: "Slani prigrizki" },
  { name: "Chio Rings (obročki)", unit: "g", defaultQty: 30, rate: { kcal: 510, p: 6.3, f: 32.7, c: 50.0 }, category: "Slani prigrizki" },
  { name: "Alesto praženi indijski oreščki s soljo", unit: "g", defaultQty: 30, rate: { kcal: 570, p: 19.3, f: 49.3, c: 14.5 }, category: "Oreščki in semena" },
  { name: "Cottage sir (svež sir v zrnu)", unit: "g", defaultQty: 100, rate: { kcal: 98, p: 11, f: 4.3, c: 3.4 }, category: "Mlečni izdelki" },
  { name: "Skuta poltrda", unit: "g", defaultQty: 100, rate: { kcal: 155, p: 13, f: 10, c: 3 }, category: "Mlečni izdelki" },
  { name: "Schweppes Bitter Lemon", unit: "g", defaultQty: 250, rate: { kcal: 42, p: 0.5, f: 0.0, c: 9.3 }, category: "Pijače" },
  { name: "San Pellegrino Aranciata", unit: "g", defaultQty: 330, rate: { kcal: 45, p: 0.5, f: 0.0, c: 10.0 }, category: "Pijače" },
  { name: "Šola (sirni namaz trikotnički)", unit: "g", defaultQty: 30, rate: { kcal: 260, p: 9, f: 23, c: 4 }, category: "Mlečni izdelki" },
  { name: "Zlati zajtrk koruzni flips", unit: "g", defaultQty: 30, rate: { kcal: 510, p: 6.3, f: 32.7, c: 50.0 }, category: "Slani prigrizki" },
  { name: "Gorenjka Deda Mraz mlečna čokolada", unit: "g", defaultQty: 25, rate: { kcal: 545, p: 7.1, f: 31.3, c: 58.5 }, category: "Čokolada in sladkarije" },
  { name: "Jelly Belly bonboni", unit: "g", defaultQty: 30, rate: { kcal: 375, p: 1.0, f: 1.0, c: 88.8 }, category: "Bomboni in sladkarije" },
  { name: "Konopljina semena olupljena", unit: "g", defaultQty: 20, rate: { kcal: 555, p: 18.8, f: 48.0, c: 14.1 }, category: "Oreščki in semena" },
  { name: "Corny Milk & Cereals", unit: "g", defaultQty: 30, rate: { kcal: 410, p: 6.0, f: 11.0, c: 68.0 }, category: "Žita in musli" },
  { name: "Bela štruca kruh", unit: "g", defaultQty: 50, rate: { kcal: 265, p: 6.0, f: 2.4, c: 55.0 }, category: "Pekovski izdelki" },
  { name: "Črn kruh", unit: "g", defaultQty: 50, rate: { kcal: 240, p: 5.4, f: 2.1, c: 49.8 }, category: "Pekovski izdelki" },
  { name: "Polnozrnati kruh", unit: "g", defaultQty: 50, rate: { kcal: 230, p: 5.2, f: 2.0, c: 47.7 }, category: "Pekovski izdelki" },
  { name: "Koruzni kruh", unit: "g", defaultQty: 50, rate: { kcal: 250, p: 5.6, f: 2.2, c: 51.9 }, category: "Pekovski izdelki" },
  { name: "Ajdov kruh", unit: "g", defaultQty: 50, rate: { kcal: 245, p: 5.5, f: 2.2, c: 50.8 }, category: "Pekovski izdelki" },
  { name: "Kajzerica (žemlja)", unit: "g", defaultQty: 60, rate: { kcal: 275, p: 6.2, f: 2.4, c: 57.1 }, category: "Pekovski izdelki" },
  { name: "Bela žemlja", unit: "g", defaultQty: 50, rate: { kcal: 270, p: 6.1, f: 2.4, c: 56.0 }, category: "Pekovski izdelki" },
  { name: "Rogljič maslen (croissant)", unit: "g", defaultQty: 60, rate: { kcal: 406, p: 8.1, f: 20.3, c: 47.7 }, category: "Pekovski izdelki" },
  { name: "Čokoladni rogljič", unit: "g", defaultQty: 70, rate: { kcal: 420, p: 8.4, f: 21.0, c: 49.3 }, category: "Pekovski izdelki" },
  { name: "Sirov burek", unit: "g", defaultQty: 200, rate: { kcal: 280, p: 8.4, f: 15.6, c: 26.6 }, category: "Pekovski izdelki" },
  { name: "Mesni burek", unit: "g", defaultQty: 200, rate: { kcal: 284, p: 8.5, f: 15.8, c: 27.0 }, category: "Pekovski izdelki" },
  { name: "Krompirjev burek", unit: "g", defaultQty: 200, rate: { kcal: 230, p: 6.9, f: 12.8, c: 21.9 }, category: "Pekovski izdelki" },
  { name: "Jabolčni zavitek (štrudelj)", unit: "g", defaultQty: 100, rate: { kcal: 250, p: 5.0, f: 9.7, c: 35.6 }, category: "Pekovski izdelki" },
  { name: "Skutin zavitek", unit: "g", defaultQty: 100, rate: { kcal: 260, p: 5.2, f: 10.1, c: 37.0 }, category: "Pekovski izdelki" },
  { name: "Makov zavitek", unit: "g", defaultQty: 100, rate: { kcal: 270, p: 5.4, f: 10.5, c: 38.5 }, category: "Pekovski izdelki" },
  { name: "Orehova potica (rezina)", unit: "g", defaultQty: 100, rate: { kcal: 380, p: 7.6, f: 14.8, c: 54.1 }, category: "Pekovski izdelki" },
  { name: "Pehtranova potica (rezina)", unit: "g", defaultQty: 100, rate: { kcal: 340, p: 6.8, f: 13.2, c: 48.4 }, category: "Pekovski izdelki" },
  { name: "Skutna potica (rezina)", unit: "g", defaultQty: 100, rate: { kcal: 320, p: 6.4, f: 12.4, c: 45.6 }, category: "Pekovski izdelki" },
  { name: "Krof (domači)", unit: "g", defaultQty: 60, rate: { kcal: 350, p: 6.1, f: 15.6, c: 46.4 }, category: "Pekovski izdelki" },
  { name: "Krof z marmelado", unit: "g", defaultQty: 70, rate: { kcal: 340, p: 6.0, f: 15.1, c: 45.1 }, category: "Pekovski izdelki" },
  { name: "Buhtelj z marmelado", unit: "g", defaultQty: 80, rate: { kcal: 320, p: 5.6, f: 14.2, c: 42.4 }, category: "Pekovski izdelki" },
  { name: "Štruklji orehovi (porcija)", unit: "g", defaultQty: 150, rate: { kcal: 300, p: 7.5, f: 10.0, c: 45.0 }, category: "Pekovski izdelki" },
  { name: "Štruklji skutini (porcija)", unit: "g", defaultQty: 150, rate: { kcal: 220, p: 5.5, f: 7.3, c: 33.0 }, category: "Pekovski izdelki" },
  { name: "Pica rezina salama", unit: "g", defaultQty: 150, rate: { kcal: 260, p: 9.1, f: 10.1, c: 33.1 }, category: "Pekovski izdelki" },
  { name: "Pica rezina štirje sirovi", unit: "g", defaultQty: 150, rate: { kcal: 275, p: 9.6, f: 10.7, c: 35.1 }, category: "Pekovski izdelki" },
  { name: "Pica rezina vegetarijanska", unit: "g", defaultQty: 150, rate: { kcal: 220, p: 7.7, f: 8.6, c: 28.1 }, category: "Pekovski izdelki" },
  { name: "Sendvič šunka-sir", unit: "g", defaultQty: 150, rate: { kcal: 250, p: 9.4, f: 8.3, c: 34.4 }, category: "Pekovski izdelki" },
  { name: "Sendvič piščanec solata", unit: "g", defaultQty: 180, rate: { kcal: 210, p: 7.9, f: 7.0, c: 28.9 }, category: "Pekovski izdelki" },
  { name: "Toast sendvič (ocvrt)", unit: "g", defaultQty: 120, rate: { kcal: 290, p: 10.9, f: 9.7, c: 39.9 }, category: "Pekovski izdelki" },
  { name: "Kremna rezina", unit: "g", defaultQty: 100, rate: { kcal: 320, p: 4.8, f: 16.0, c: 39.2 }, category: "Pekovski izdelki" },
  { name: "Gibanica prekmurska (rezina)", unit: "g", defaultQty: 120, rate: { kcal: 330, p: 5.0, f: 16.5, c: 40.4 }, category: "Pekovski izdelki" },
  { name: "Flancati", unit: "g", defaultQty: 30, rate: { kcal: 480, p: 8.4, f: 21.3, c: 63.6 }, category: "Pekovski izdelki" },
  { name: "Miške (piškoti)", unit: "g", defaultQty: 40, rate: { kcal: 420, p: 7.4, f: 18.7, c: 55.7 }, category: "Pekovski izdelki" },
  { name: "Linški oči (piškoti)", unit: "g", defaultQty: 40, rate: { kcal: 470, p: 8.2, f: 20.9, c: 62.3 }, category: "Pekovski izdelki" },
  { name: "Vanilijeve rogljičke", unit: "g", defaultQty: 30, rate: { kcal: 490, p: 9.8, f: 24.5, c: 57.6 }, category: "Pekovski izdelki" },
  { name: "Čajno pecivo mešano", unit: "g", defaultQty: 30, rate: { kcal: 450, p: 7.9, f: 20.0, c: 59.6 }, category: "Pekovski izdelki" },
  { name: "Makrone (mandljevi)", unit: "g", defaultQty: 40, rate: { kcal: 400, p: 7.0, f: 17.8, c: 53.0 }, category: "Pekovski izdelki" },
  { name: "Torta Sacher (rezina)", unit: "g", defaultQty: 120, rate: { kcal: 360, p: 5.4, f: 18.0, c: 44.1 }, category: "Pekovski izdelki" },
  { name: "Torta Rakija (rezina)", unit: "g", defaultQty: 120, rate: { kcal: 370, p: 5.5, f: 18.5, c: 45.3 }, category: "Pekovski izdelki" },
  { name: "Tiramisu (kos)", unit: "g", defaultQty: 120, rate: { kcal: 300, p: 4.5, f: 15.0, c: 36.8 }, category: "Pekovski izdelki" },
  { name: "Torta Grand Marnier (rezina)", unit: "g", defaultQty: 120, rate: { kcal: 380, p: 5.7, f: 19.0, c: 46.5 }, category: "Pekovski izdelki" },
  { name: "Medenjaki", unit: "g", defaultQty: 40, rate: { kcal: 400, p: 10.0, f: 13.3, c: 60.0 }, category: "Pekovski izdelki" },
  { name: "Lect srce (medeno pecivo)", unit: "g", defaultQty: 50, rate: { kcal: 380, p: 9.5, f: 12.7, c: 57.0 }, category: "Pekovski izdelki" },
  { name: "Sirovi štangeljni", unit: "g", defaultQty: 50, rate: { kcal: 420, p: 10.5, f: 14.0, c: 63.0 }, category: "Pekovski izdelki" },
  { name: "Slani polžki (pekovski)", unit: "g", defaultQty: 80, rate: { kcal: 380, p: 9.5, f: 12.7, c: 57.0 }, category: "Pekovski izdelki" },
  { name: "Pletenka (kvašeno pecivo)", unit: "g", defaultQty: 60, rate: { kcal: 290, p: 7.2, f: 9.7, c: 43.5 }, category: "Pekovski izdelki" },
  { name: "Panettone (božični kolač)", unit: "g", defaultQty: 80, rate: { kcal: 380, p: 9.5, f: 12.7, c: 57.0 }, category: "Pekovski izdelki" },
  { name: "Berlinski krof s čokolado", unit: "g", defaultQty: 80, rate: { kcal: 370, p: 6.5, f: 16.4, c: 49.0 }, category: "Pekovski izdelki" },
  { name: "Kifeljc z lešnikovim nadevom", unit: "g", defaultQty: 70, rate: { kcal: 400, p: 10.0, f: 13.3, c: 60.0 }, category: "Pekovski izdelki" },
  { name: "Makova štručka", unit: "g", defaultQty: 70, rate: { kcal: 350, p: 8.8, f: 11.7, c: 52.5 }, category: "Pekovski izdelki" },
  { name: "Sirova štručka", unit: "g", defaultQty: 70, rate: { kcal: 300, p: 7.5, f: 10.0, c: 45.0 }, category: "Pekovski izdelki" },
  { name: "Ovseni kruhki (piškoti)", unit: "g", defaultQty: 25, rate: { kcal: 440, p: 9.2, f: 3.6, c: 85.1 }, category: "Pekovski izdelki" },
  { name: "Grisini palčke", unit: "g", defaultQty: 20, rate: { kcal: 400, p: 10.0, f: 13.3, c: 60.0 }, category: "Pekovski izdelki" },
  { name: "Prepečenec navaden", unit: "g", defaultQty: 20, rate: { kcal: 380, p: 9.5, f: 12.7, c: 57.0 }, category: "Pekovski izdelki" },
  { name: "Prepečenec polnozrnati", unit: "g", defaultQty: 20, rate: { kcal: 370, p: 9.2, f: 12.3, c: 55.5 }, category: "Pekovski izdelki" },
  { name: "Toast kruh beli", unit: "g", defaultQty: 50, rate: { kcal: 265, p: 6.0, f: 2.4, c: 55.0 }, category: "Pekovski izdelki" },
  { name: "Toast kruh polnozrnati", unit: "g", defaultQty: 50, rate: { kcal: 250, p: 5.6, f: 2.2, c: 51.9 }, category: "Pekovski izdelki" },
  { name: "Tortilja pšenična", unit: "g", defaultQty: 60, rate: { kcal: 300, p: 7.5, f: 10.0, c: 45.0 }, category: "Pekovski izdelki" },
  { name: "Lepinja (pita kruh)", unit: "g", defaultQty: 90, rate: { kcal: 275, p: 6.2, f: 2.4, c: 57.1 }, category: "Pekovski izdelki" },
  { name: "Somun", unit: "g", defaultQty: 100, rate: { kcal: 280, p: 7.0, f: 9.3, c: 42.0 }, category: "Pekovski izdelki" },
  { name: "Pogača z zelišči", unit: "g", defaultQty: 60, rate: { kcal: 290, p: 7.2, f: 9.7, c: 43.5 }, category: "Pekovski izdelki" },
  { name: "Focaccia z oljkami", unit: "g", defaultQty: 60, rate: { kcal: 270, p: 6.8, f: 9.0, c: 40.5 }, category: "Pekovski izdelki" },
  { name: "Baguette francoski", unit: "g", defaultQty: 50, rate: { kcal: 270, p: 6.8, f: 9.0, c: 40.5 }, category: "Pekovski izdelki" },
  { name: "Ciabatta", unit: "g", defaultQty: 50, rate: { kcal: 265, p: 6.6, f: 8.8, c: 39.8 }, category: "Pekovski izdelki" },
  { name: "Pletenka z rozinami", unit: "g", defaultQty: 60, rate: { kcal: 310, p: 7.8, f: 10.3, c: 46.5 }, category: "Pekovski izdelki" },
  { name: "Orehova štručka mini", unit: "g", defaultQty: 50, rate: { kcal: 400, p: 10.0, f: 13.3, c: 60.0 }, category: "Pekovski izdelki" },
  { name: "Makova štručka mini", unit: "g", defaultQty: 50, rate: { kcal: 390, p: 9.8, f: 13.0, c: 58.5 }, category: "Pekovski izdelki" },
  { name: "Kranjska klobasa v testu", unit: "g", defaultQty: 150, rate: { kcal: 300, p: 7.5, f: 10.0, c: 45.0 }, category: "Pekovski izdelki" },
  { name: "Hrenovka v testu", unit: "g", defaultQty: 100, rate: { kcal: 290, p: 7.2, f: 9.7, c: 43.5 }, category: "Pekovski izdelki" },
  { name: "Pica burek (calzone)", unit: "g", defaultQty: 200, rate: { kcal: 260, p: 7.8, f: 14.4, c: 24.7 }, category: "Pekovski izdelki" },
  { name: "Sirovi štruklji pečeni", unit: "g", defaultQty: 150, rate: { kcal: 250, p: 6.2, f: 8.3, c: 37.5 }, category: "Pekovski izdelki" },
  { name: "Kruhki z bučnimi semeni", unit: "g", defaultQty: 50, rate: { kcal: 260, p: 5.8, f: 2.3, c: 53.9 }, category: "Pekovski izdelki" },
  { name: "Grisini s sezamom", unit: "g", defaultQty: 20, rate: { kcal: 410, p: 10.2, f: 13.7, c: 61.5 }, category: "Pekovski izdelki" },
  { name: "Rženi kruh", unit: "g", defaultQty: 50, rate: { kcal: 220, p: 5.0, f: 2.0, c: 45.6 }, category: "Pekovski izdelki" },
  { name: "Big Mac", unit: "g", defaultQty: 211, rate: { kcal: 238, p: 11.9, f: 11.9, c: 20.9 }, category: "McDonald's" },
  { name: "Hamburger", unit: "g", defaultQty: 105, rate: { kcal: 242, p: 12.1, f: 12.1, c: 21.2 }, category: "McDonald's" },
  { name: "Cheeseburger", unit: "g", defaultQty: 119, rate: { kcal: 254, p: 12.7, f: 12.7, c: 22.2 }, category: "McDonald's" },
  { name: "McChicken", unit: "g", defaultQty: 187, rate: { kcal: 234, p: 11.7, f: 11.7, c: 20.4 }, category: "McDonald's" },
  { name: "Pommes frites (srednji)", unit: "g", defaultQty: 114, rate: { kcal: 289, p: 2.9, f: 14.1, c: 37.5 }, category: "McDonald's" },
  { name: "Chicken McNuggets 6 kosov", unit: "g", defaultQty: 109, rate: { kcal: 243, p: 12.2, f: 12.2, c: 21.3 }, category: "McDonald's" },
  { name: "Jabolčna pita", unit: "g", defaultQty: 80, rate: { kcal: 284, p: 2.1, f: 13.2, c: 39.0 }, category: "McDonald's" },
  { name: "McSundae čokolada", unit: "g", defaultQty: 151, rate: { kcal: 184, p: 4.6, f: 4.1, c: 32.2 }, category: "McDonald's" },
  { name: "Filet-o-Fish", unit: "g", defaultQty: 137, rate: { kcal: 242, p: 12.1, f: 12.1, c: 21.2 }, category: "McDonald's" },
  { name: "Big Tasty", unit: "g", defaultQty: 300, rate: { kcal: 232, p: 11.6, f: 11.6, c: 20.3 }, category: "McDonald's" },
  { name: "McFlurry Oreo", unit: "g", defaultQty: 166, rate: { kcal: 190, p: 4.8, f: 4.2, c: 33.3 }, category: "McDonald's" },
  { name: "Coca-Cola (0,25 L)", unit: "g", defaultQty: 258, rate: { kcal: 43, p: 0, f: 0, c: 10.6 }, category: "McDonald's" },
  { name: "Coca-Cola (0,5 L)", unit: "g", defaultQty: 516, rate: { kcal: 41, p: 0, f: 0, c: 10.6 }, category: "McDonald's" },
  { name: "Coca-Cola Zero (0,4 L)", unit: "g", defaultQty: 410, rate: { kcal: 0, p: 0, f: 0, c: 0.1 }, category: "McDonald's" },
  { name: "Coca-Cola Zero (0,5 L)", unit: "g", defaultQty: 516, rate: { kcal: 1, p: 0, f: 0, c: 0.1 }, category: "McDonald's" },
  { name: "Egg McMuffin", unit: "g", defaultQty: 129, rate: { kcal: 225, p: 12.4, f: 10.0, c: 21.4 }, category: "McDonald's" },
  { name: "McMuffin Ham & Egg", unit: "g", defaultQty: 136, rate: { kcal: 210, p: 11.5, f: 9.3, c: 19.9 }, category: "McDonald's" },
  { name: "McMuffin Bacon & Egg", unit: "g", defaultQty: 138, rate: { kcal: 228, p: 12.6, f: 10.1, c: 21.7 }, category: "McDonald's" },
  { name: "Piščančji trakci 8 kosov", unit: "g", defaultQty: 150, rate: { kcal: 150, p: 7.5, f: 7.5, c: 13.1 }, category: "McDonald's" },
  { name: "McPlant", unit: "g", defaultQty: 231, rate: { kcal: 198, p: 8.9, f: 9.7, c: 18.8 }, category: "McDonald's" },
  { name: "Fanta Zero", unit: "g", defaultQty: 330, rate: { kcal: 0.5, p: 0, f: 0, c: 0.1 }, category: "Pijače" },
  { name: "Sprite Zero", unit: "g", defaultQty: 330, rate: { kcal: 0.3, p: 0, f: 0, c: 0.1 }, category: "Pijače" },
  { name: "Schweppes Tonic", unit: "g", defaultQty: 250, rate: { kcal: 35, p: 0.4, f: 0.0, c: 7.8 }, category: "Pijače" },
  { name: "Fructal 100% sok jabolko", unit: "g", defaultQty: 200, rate: { kcal: 46, p: 0.5, f: 0.0, c: 10.2 }, category: "Pijače" },
  { name: "Fructal 100% sok pomaranča", unit: "g", defaultQty: 200, rate: { kcal: 45, p: 0.5, f: 0.0, c: 10.0 }, category: "Pijače" },
  { name: "Rauch Happy Day breskev", unit: "g", defaultQty: 200, rate: { kcal: 48, p: 0.5, f: 0.0, c: 10.7 }, category: "Pijače" },
  { name: "Granini jagoda-banana", unit: "g", defaultQty: 200, rate: { kcal: 52, p: 0.6, f: 0.0, c: 11.6 }, category: "Pijače" },
  { name: "Costa ledena kava karamel", unit: "g", defaultQty: 250, rate: { kcal: 58, p: 0.6, f: 0.0, c: 12.9 }, category: "Pijače" },
  { name: "Lipton ledeni čaj limona", unit: "g", defaultQty: 330, rate: { kcal: 24, p: 0.3, f: 0.0, c: 5.3 }, category: "Pijače" },
  { name: "Sonnentor zeliščni čaj (brez kalorij)", unit: "g", defaultQty: 250, rate: { kcal: 0, p: 0.0, f: 0.0, c: 0.0 }, category: "Pijače" },
  { name: "Isostar športni napitek pomaranča", unit: "g", defaultQty: 500, rate: { kcal: 24, p: 0.3, f: 0.0, c: 5.3 }, category: "Pijače" },
  { name: "Gatorade limona", unit: "g", defaultQty: 500, rate: { kcal: 25, p: 0.3, f: 0.0, c: 5.6 }, category: "Pijače" },
  { name: "Cedevita pomaranča (pripravljena)", unit: "g", defaultQty: 200, rate: { kcal: 20, p: 0.2, f: 0.0, c: 4.4 }, category: "Pijače" },
  { name: "Fructal Jupi sirup", unit: "g", defaultQty: 50, rate: { kcal: 120, p: 1.3, f: 0.0, c: 26.7 }, category: "Pijače" },
  { name: "Alpsko mleko polnomastno 3,5 %", unit: "g", defaultQty: 250, rate: { kcal: 64, p: 3.2, f: 1.9, c: 5.1 }, category: "Mlečni izdelki" },
  { name: "Mleko posneto 0,5 %", unit: "g", defaultQty: 250, rate: { kcal: 35, p: 1.8, f: 1.0, c: 2.8 }, category: "Mlečni izdelki" },
  { name: "Kislo mleko", unit: "g", defaultQty: 250, rate: { kcal: 58, p: 2.9, f: 1.7, c: 4.6 }, category: "Mlečni izdelki" },
  { name: "Zeleni gozd smetana za stepanje 30 %", unit: "g", defaultQty: 30, rate: { kcal: 292, p: 2.2, f: 30, c: 3.3 }, category: "Mlečni izdelki" },
  { name: "Kefir naravni", unit: "g", defaultQty: 250, rate: { kcal: 55, p: 2.8, f: 1.7, c: 4.4 }, category: "Mlečni izdelki" },
  { name: "Jogurt bio naravni", unit: "g", defaultQty: 180, rate: { kcal: 62, p: 3.1, f: 1.9, c: 5.0 }, category: "Mlečni izdelki" },
  { name: "Mascarpone", unit: "g", defaultQty: 50, rate: { kcal: 355, p: 5, f: 37, c: 3 }, category: "Mlečni izdelki" },
  { name: "Rikotta", unit: "g", defaultQty: 50, rate: { kcal: 146, p: 11, f: 10, c: 3 }, category: "Mlečni izdelki" },
  { name: "Feta sir", unit: "g", defaultQty: 50, rate: { kcal: 264, p: 15, f: 21, c: 3 }, category: "Mlečni izdelki" },
  { name: "Mocarela kroglice", unit: "g", defaultQty: 60, rate: { kcal: 280, p: 22, f: 20, c: 2 }, category: "Mlečni izdelki" },
  { name: "Parmezan naribani", unit: "g", defaultQty: 20, rate: { kcal: 392, p: 35, f: 26, c: 4 }, category: "Mlečni izdelki" },
  { name: "Gouda sir 45 %", unit: "g", defaultQty: 30, rate: { kcal: 356, p: 25, f: 28, c: 2 }, category: "Mlečni izdelki" },
  { name: "Topljeni sirčki (Lila trikotnički)", unit: "g", defaultQty: 30, rate: { kcal: 255, p: 10, f: 22, c: 4 }, category: "Mlečni izdelki" },
  { name: "Sladoledni rogljiček Cornetto mini (multipack, kos)", unit: "g", defaultQty: 40, rate: { kcal: 250, p: 4, f: 14, c: 27 }, category: "Mlečni izdelki" },
  { name: "Lay's Max hrustljavi rebrasti čips", unit: "g", defaultQty: 30, rate: { kcal: 540, p: 6.6, f: 34.6, c: 53.0 }, category: "Slani prigrizki" },
  { name: "Doritos Cool Original", unit: "g", defaultQty: 30, rate: { kcal: 495, p: 6.1, f: 31.8, c: 48.6 }, category: "Slani prigrizki" },
  { name: "Pringles Texas BBQ", unit: "g", defaultQty: 30, rate: { kcal: 530, p: 6.5, f: 34.0, c: 52.0 }, category: "Slani prigrizki" },
  { name: "Chio čips sirov", unit: "g", defaultQty: 30, rate: { kcal: 527, p: 6.5, f: 33.8, c: 51.7 }, category: "Slani prigrizki" },
  { name: "Bugles koruzni rožički", unit: "g", defaultQty: 30, rate: { kcal: 520, p: 6.4, f: 33.4, c: 51.0 }, category: "Slani prigrizki" },
  { name: "Monster Munch pikantni", unit: "g", defaultQty: 30, rate: { kcal: 510, p: 6.3, f: 32.7, c: 50.0 }, category: "Slani prigrizki" },
  { name: "Lorenz Naturals čips", unit: "g", defaultQty: 30, rate: { kcal: 540, p: 6.6, f: 34.6, c: 53.0 }, category: "Slani prigrizki" },
  { name: "Estrella Dill čips", unit: "g", defaultQty: 30, rate: { kcal: 515, p: 6.3, f: 33.0, c: 50.5 }, category: "Slani prigrizki" },
  { name: "Chio čips paprika XXL", unit: "g", defaultQty: 30, rate: { kcal: 528, p: 6.5, f: 33.9, c: 51.8 }, category: "Slani prigrizki" },
  { name: "Snack Day Tortilla čips", unit: "g", defaultQty: 30, rate: { kcal: 495, p: 6.1, f: 31.8, c: 48.6 }, category: "Slani prigrizki" },
  { name: "Milka Crispy Choco", unit: "g", defaultQty: 25, rate: { kcal: 505, p: 6.5, f: 29.0, c: 54.2 }, category: "Čokolada in sladkarije" },
  { name: "Milka Bubbles", unit: "g", defaultQty: 25, rate: { kcal: 540, p: 7.0, f: 31.0, c: 58.0 }, category: "Čokolada in sladkarije" },
  { name: "Kraš Bajadera lešnikova", unit: "g", defaultQty: 25, rate: { kcal: 520, p: 6.7, f: 29.9, c: 55.9 }, category: "Čokolada in sladkarije" },
  { name: "Kraš Životinjsko carstvo", unit: "g", defaultQty: 25, rate: { kcal: 530, p: 6.9, f: 30.4, c: 56.9 }, category: "Čokolada in sladkarije" },
  { name: "Ferrero Kinder Surprise", unit: "g", defaultQty: 20, rate: { kcal: 530, p: 6.9, f: 30.4, c: 56.9 }, category: "Čokolada in sladkarije" },
  { name: "Milka Fibre Lova (žitni kroglici)", unit: "g", defaultQty: 25, rate: { kcal: 470, p: 6.1, f: 27.0, c: 50.5 }, category: "Čokolada in sladkarije" },
  { name: "Nestlé Aero mlečna čokolada", unit: "g", defaultQty: 25, rate: { kcal: 530, p: 6.9, f: 30.4, c: 56.9 }, category: "Čokolada in sladkarije" },
  { name: "Cote d'Or mlečna čokolada", unit: "g", defaultQty: 25, rate: { kcal: 545, p: 7.1, f: 31.3, c: 58.5 }, category: "Čokolada in sladkarije" },
  { name: "Ritter Sport Corn Flakes", unit: "g", defaultQty: 25, rate: { kcal: 500, p: 8, f: 36, c: 51 }, category: "Čokolada in sladkarije" },
  { name: "Lindt Lindor stick", unit: "g", defaultQty: 38, rate: { kcal: 555, p: 7.2, f: 31.9, c: 59.6 }, category: "Čokolada in sladkarije" },
  { name: "Toblerone tiny mix", unit: "g", defaultQty: 25, rate: { kcal: 520, p: 5.5, f: 29, c: 61 }, category: "Čokolada in sladkarije" },
  { name: "Milka Crispy Joghurt", unit: "g", defaultQty: 25, rate: { kcal: 500, p: 6.5, f: 28.7, c: 53.7 }, category: "Čokolada in sladkarije" },
  { name: "Ledo lešnik vafelj", unit: "g", defaultQty: 30, rate: { kcal: 510, p: 7.1, f: 20.6, c: 73.8 }, category: "Keksi in vafli" },
  { name: "Bahlsen Deloba", unit: "g", defaultQty: 25, rate: { kcal: 505, p: 7.0, f: 20.4, c: 73.1 }, category: "Keksi in vafli" },
  { name: "Loacker Quadratini vanilija", unit: "g", defaultQty: 25, rate: { kcal: 525, p: 6.8, f: 19.9, c: 71.3 }, category: "Keksi in vafli" },
  { name: "Milka vafelj Choco Wafer", unit: "g", defaultQty: 25, rate: { kcal: 495, p: 6.8, f: 20.0, c: 71.6 }, category: "Keksi in vafli" },
  { name: "Kraš Zoo animal keksi", unit: "g", defaultQty: 30, rate: { kcal: 440, p: 6.1, f: 17.8, c: 63.7 }, category: "Keksi in vafli" },
  { name: "Peto keksi z mlečnim nadevom", unit: "g", defaultQty: 30, rate: { kcal: 470, p: 6.5, f: 19.0, c: 68.0 }, category: "Keksi in vafli" },
  { name: "Digestive čokoladni McVitie's", unit: "g", defaultQty: 30, rate: { kcal: 490, p: 6.8, f: 19.8, c: 70.9 }, category: "Keksi in vafli" },
  { name: "Jaffa Cakes", unit: "g", defaultQty: 25, rate: { kcal: 375, p: 5.2, f: 15.2, c: 54.3 }, category: "Keksi in vafli" },
  { name: "Kraš Mentos mint", unit: "g", defaultQty: 38, rate: { kcal: 395, p: 1.0, f: 1.0, c: 93.6 }, category: "Bomboni in sladkarije" },
  { name: "Milka Mliječni bombon", unit: "g", defaultQty: 30, rate: { kcal: 450, p: 3, f: 9, c: 80 }, category: "Bomboni in sladkarije" },
  { name: "Trolli gumi črvi", unit: "g", defaultQty: 30, rate: { kcal: 340, p: 0.9, f: 0.9, c: 80.5 }, category: "Bomboni in sladkarije" },
  { name: "Haribo Šarene medvedke Sour", unit: "g", defaultQty: 30, rate: { kcal: 335, p: 0.9, f: 0.9, c: 79.3 }, category: "Bomboni in sladkarije" },
  { name: "Rowntree's Fruit Pastilles", unit: "g", defaultQty: 30, rate: { kcal: 340, p: 0.9, f: 0.9, c: 80.5 }, category: "Bomboni in sladkarije" },
  { name: "Golden Boy arašidi v čokoladi", unit: "g", defaultQty: 30, rate: { kcal: 510, p: 17.3, f: 44.1, c: 13.0 }, category: "Oreščki in semena" },
  { name: "Alesto makadamija oreščki", unit: "g", defaultQty: 20, rate: { kcal: 718, p: 7.9, f: 75.8, c: 13.8 }, category: "Oreščki in semena" },
  { name: "Alesto brazilski oreščki", unit: "g", defaultQty: 20, rate: { kcal: 656, p: 22.2, f: 56.7, c: 16.7 }, category: "Oreščki in semena" },
  { name: "Alesto pekan oreščki", unit: "g", defaultQty: 20, rate: { kcal: 691, p: 23.4, f: 59.7, c: 17.6 }, category: "Oreščki in semena" },
  { name: "Chia semena", unit: "g", defaultQty: 15, rate: { kcal: 486, p: 16.5, f: 42.0, c: 12.4 }, category: "Oreščki in semena" },
  { name: "Laneno seme", unit: "g", defaultQty: 15, rate: { kcal: 534, p: 18.1, f: 46.2, c: 13.6 }, category: "Oreščki in semena" },
  { name: "Magnum Almond", unit: "g", defaultQty: 80, rate: { kcal: 340, p: 4.9, f: 19.4, c: 35.2 }, category: "Sladoled in zamrznjeni prigrizki" },
  { name: "Magnum White", unit: "g", defaultQty: 80, rate: { kcal: 325, p: 4.6, f: 18.6, c: 33.7 }, category: "Sladoled in zamrznjeni prigrizki" },
  { name: "Milka sladoled v kornetu", unit: "g", defaultQty: 110, rate: { kcal: 270, p: 3.9, f: 15.4, c: 28.0 }, category: "Sladoled in zamrznjeni prigrizki" },
  { name: "Frigo Big Bang", unit: "g", defaultQty: 90, rate: { kcal: 240, p: 3.4, f: 13.7, c: 24.9 }, category: "Sladoled in zamrznjeni prigrizki" },
  { name: "Ljubljanske mlekarne rodoljub sladoled vanilija (1 L)", unit: "g", defaultQty: 100, rate: { kcal: 190, p: 2.7, f: 10.9, c: 19.7 }, category: "Sladoled in zamrznjeni prigrizki" },
  { name: "Sunar krekerji polnozrnati", unit: "g", defaultQty: 25, rate: { kcal: 440, p: 8.6, f: 16.3, c: 61.2 }, category: "Slani prigrizki" },
  { name: "Rico krekerji", unit: "g", defaultQty: 25, rate: { kcal: 470, p: 9.2, f: 17.4, c: 65.4 }, category: "Slani prigrizki" },
  { name: "Cracotte prepečenec", unit: "g", defaultQty: 20, rate: { kcal: 410, p: 8.0, f: 15.2, c: 57.0 }, category: "Slani prigrizki" },
  { name: "Belvita zajtrkovni keksi", unit: "g", defaultQty: 50, rate: { kcal: 440, p: 8.6, f: 16.3, c: 61.2 }, category: "Slani prigrizki" },
  { name: "Fitness müsli batonček", unit: "g", defaultQty: 23.5, rate: { kcal: 375, p: 5.5, f: 10.1, c: 62.2 }, category: "Žita in musli" },
  { name: "Kellogg's Crunchy müsli batonček", unit: "g", defaultQty: 25, rate: { kcal: 435, p: 6.4, f: 11.7, c: 72.1 }, category: "Žita in musli" },
  { name: "Emco müsli batonček jabolko-cimet", unit: "g", defaultQty: 30, rate: { kcal: 390, p: 5.7, f: 10.5, c: 64.7 }, category: "Žita in musli" },
  { name: "Popcorn slan mikrovalovni", unit: "g", defaultQty: 30, rate: { kcal: 500, p: 8.0, f: 22.7, c: 65.9 }, category: "Popcorn in riževi vaflji" },
  { name: "Riževi vaflji s soljo", unit: "g", defaultQty: 20, rate: { kcal: 385, p: 7.7, f: 2.1, c: 83.7 }, category: "Popcorn in riževi vaflji" },
  { name: "Klasje mlečni rogljiček", unit: "g", defaultQty: 70, rate: { kcal: 290, p: 3.6, f: 15.1, c: 33.2 }, category: "Slovenski specialiteti" },
  { name: "Kraš Kiki bonboni", unit: "g", defaultQty: 30, rate: { kcal: 395, p: 4.9, f: 20.6, c: 45.3 }, category: "Slovenski specialiteti" },
  { name: "Fructal marmelada mešano sadje", unit: "g", defaultQty: 20, rate: { kcal: 250, p: 3.1, f: 13.0, c: 28.6 }, category: "Slovenski specialiteti" },
  { name: "Medex med cvetlični", unit: "g", defaultQty: 20, rate: { kcal: 304, p: 3.8, f: 15.8, c: 34.8 }, category: "Slovenski specialiteti" },
  { name: "Zlato polje ovsena kaša instant", unit: "g", defaultQty: 40, rate: { kcal: 370, p: 5.3, f: 19.4, c: 44.0 }, category: "Drugo" },
  { name: "Kellogg's Corn Flakes", unit: "g", defaultQty: 30, rate: { kcal: 378, p: 5.4, f: 19.8, c: 45.0 }, category: "Drugo" },
  { name: "Nestlé Chocapic kosmiči", unit: "g", defaultQty: 30, rate: { kcal: 395, p: 5.6, f: 20.7, c: 47.0 }, category: "Drugo" },
  { name: "Kellogg's Crunchy Nut", unit: "g", defaultQty: 30, rate: { kcal: 453, p: 6.5, f: 23.7, c: 53.9 }, category: "Drugo" },
  { name: "Muesli Crunchy Alpen Gold", unit: "g", defaultQty: 45, rate: { kcal: 470, p: 6.7, f: 24.6, c: 56.0 }, category: "Drugo" },
  { name: "Granola z medom in oreščki", unit: "g", defaultQty: 45, rate: { kcal: 460, p: 6.6, f: 24.1, c: 54.8 }, category: "Drugo" },
  { name: "Tuc Chips slani", unit: "g", defaultQty: 30, rate: { kcal: 510, p: 6.3, f: 32.7, c: 50.0 }, category: "Slani prigrizki" },
  { name: "Lay's Light manj maščob", unit: "g", defaultQty: 30, rate: { kcal: 470, p: 5.8, f: 30.2, c: 46.1 }, category: "Slani prigrizki" },
  { name: "Pringles Paprika mini", unit: "g", defaultQty: 30, rate: { kcal: 525, p: 6.4, f: 33.7, c: 51.5 }, category: "Slani prigrizki" },
  { name: "Kinder Schoko-Bons", unit: "g", defaultQty: 25, rate: { kcal: 545, p: 7.1, f: 31.3, c: 58.5 }, category: "Čokolada in sladkarije" },
  { name: "Nesquik čokoladne kroglice v čokoladi", unit: "g", defaultQty: 25, rate: { kcal: 510, p: 6.6, f: 29.3, c: 54.8 }, category: "Čokolada in sladkarije" },
  { name: "Milka Sarcastik bonbon", unit: "g", defaultQty: 30, rate: { kcal: 450, p: 3, f: 9, c: 80 }, category: "Bomboni in sladkarije" },
  { name: "Slani mandlji praženi", unit: "g", defaultQty: 25, rate: { kcal: 608, p: 20.6, f: 52.6, c: 15.5 }, category: "Oreščki in semena" },
  { name: "Voda z okusom limone (negazirana)", unit: "g", defaultQty: 500, rate: { kcal: 18, p: 0.2, f: 0.0, c: 4.0 }, category: "Pijače" },
  { name: "Sirni narezek gouda-ementalec (mix pack)", unit: "g", defaultQty: 30, rate: { kcal: 360, p: 26, f: 28, c: 2 }, category: "Mlečni izdelki" },
  { name: "Kraš Baccio di Dama", unit: "g", defaultQty: 25, rate: { kcal: 530, p: 6.9, f: 20.3, c: 72.8 }, category: "Keksi in vafli" },
  { name: "Sirova štruca (polnozrnata)", unit: "g", defaultQty: 50, rate: { kcal: 255, p: 5.7, f: 2.3, c: 52.9 }, category: "Pekovski izdelki" },
  { name: "Ovseni kruh", unit: "g", defaultQty: 50, rate: { kcal: 235, p: 5.3, f: 2.1, c: 48.8 }, category: "Pekovski izdelki" },
  { name: "Bučni kruh", unit: "g", defaultQty: 50, rate: { kcal: 255, p: 5.7, f: 2.3, c: 52.9 }, category: "Pekovski izdelki" },
  { name: "Kmečki kruh (mešan)", unit: "g", defaultQty: 50, rate: { kcal: 250, p: 5.6, f: 2.2, c: 51.9 }, category: "Pekovski izdelki" },
  { name: "Sadni kruh (s suhim sadjem)", unit: "g", defaultQty: 50, rate: { kcal: 280, p: 6.3, f: 2.5, c: 58.1 }, category: "Pekovski izdelki" },
  { name: "Semenka štručka", unit: "g", defaultQty: 60, rate: { kcal: 270, p: 6.8, f: 9.0, c: 40.5 }, category: "Pekovski izdelki" },
  { name: "Sezamova štručka", unit: "g", defaultQty: 60, rate: { kcal: 275, p: 6.9, f: 9.2, c: 41.2 }, category: "Pekovski izdelki" },
  { name: "Makova štručka (velika)", unit: "g", defaultQty: 80, rate: { kcal: 270, p: 6.8, f: 9.0, c: 40.5 }, category: "Pekovski izdelki" },
  { name: "Fokačja z rožmarinom", unit: "g", defaultQty: 60, rate: { kcal: 275, p: 6.9, f: 9.2, c: 41.2 }, category: "Pekovski izdelki" },
  { name: "Pizza calzone sir-šunka", unit: "g", defaultQty: 250, rate: { kcal: 265, p: 6.6, f: 8.8, c: 39.8 }, category: "Pekovski izdelki" },
  { name: "Pizza margherita (kos)", unit: "g", defaultQty: 150, rate: { kcal: 240, p: 6.0, f: 8.0, c: 36.0 }, category: "Pekovski izdelki" },
  { name: "Pizza salama-gobice (kos)", unit: "g", defaultQty: 150, rate: { kcal: 270, p: 6.8, f: 9.0, c: 40.5 }, category: "Pekovski izdelki" },
  { name: "Pizza tuna (kos)", unit: "g", defaultQty: 150, rate: { kcal: 235, p: 5.9, f: 7.8, c: 35.2 }, category: "Pekovski izdelki" },
  { name: "Sirovi rogljiček (croissant s sirom)", unit: "g", defaultQty: 70, rate: { kcal: 320, p: 6.4, f: 16.0, c: 37.6 }, category: "Pekovski izdelki" },
  { name: "Šunka rogljiček", unit: "g", defaultQty: 80, rate: { kcal: 300, p: 6.0, f: 15.0, c: 35.2 }, category: "Pekovski izdelki" },
  { name: "Pariški rogljič (maslen)", unit: "g", defaultQty: 65, rate: { kcal: 410, p: 8.2, f: 20.5, c: 48.2 }, category: "Pekovski izdelki" },
  { name: "Griz štručka (mafin slog)", unit: "g", defaultQty: 70, rate: { kcal: 350, p: 8.8, f: 11.7, c: 52.5 }, category: "Pekovski izdelki" },
  { name: "Muffin borovnice", unit: "g", defaultQty: 90, rate: { kcal: 370, p: 9.2, f: 12.3, c: 55.5 }, category: "Pekovski izdelki" },
  { name: "Muffin čokolada", unit: "g", defaultQty: 90, rate: { kcal: 400, p: 10.0, f: 13.3, c: 60.0 }, category: "Pekovski izdelki" },
  { name: "Cimet polžek (cinnamon roll)", unit: "g", defaultQty: 100, rate: { kcal: 390, p: 9.8, f: 13.0, c: 58.5 }, category: "Pekovski izdelki" },
  { name: "Donut glazirani", unit: "g", defaultQty: 60, rate: { kcal: 380, p: 9.5, f: 12.7, c: 57.0 }, category: "Pekovski izdelki" },
  { name: "Donut čokoladni", unit: "g", defaultQty: 65, rate: { kcal: 400, p: 10.0, f: 13.3, c: 60.0 }, category: "Pekovski izdelki" },
  { name: "Eclair (šoto s smetano)", unit: "g", defaultQty: 90, rate: { kcal: 300, p: 7.5, f: 10.0, c: 45.0 }, category: "Pekovski izdelki" },
  { name: "Profiterol (kos)", unit: "g", defaultQty: 30, rate: { kcal: 290, p: 7.2, f: 9.7, c: 43.5 }, category: "Pekovski izdelki" },
  { name: "Kremšnita (Bled)", unit: "g", defaultQty: 130, rate: { kcal: 320, p: 8.0, f: 10.7, c: 48.0 }, category: "Pekovski izdelki" },
  { name: "Bavarska rezina", unit: "g", defaultQty: 100, rate: { kcal: 310, p: 7.8, f: 10.3, c: 46.5 }, category: "Pekovski izdelki" },
  { name: "Praline sadna torta (rezina)", unit: "g", defaultQty: 120, rate: { kcal: 290, p: 4.3, f: 14.5, c: 35.5 }, category: "Pekovski izdelki" },
  { name: "Rdeča žamet torta (rezina)", unit: "g", defaultQty: 120, rate: { kcal: 370, p: 5.5, f: 18.5, c: 45.3 }, category: "Pekovski izdelki" },
  { name: "Cheesecake New York (rezina)", unit: "g", defaultQty: 120, rate: { kcal: 350, p: 8.8, f: 11.7, c: 52.5 }, category: "Pekovski izdelki" },
  { name: "Panna cotta (kos)", unit: "g", defaultQty: 100, rate: { kcal: 220, p: 5.5, f: 7.3, c: 33.0 }, category: "Pekovski izdelki" },
  { name: "Palačinke z marmelado (2 kosa)", unit: "g", defaultQty: 150, rate: { kcal: 260, p: 6.5, f: 8.7, c: 39.0 }, category: "Pekovski izdelki" },
  { name: "Palačinke z Nutello (2 kosa)", unit: "g", defaultQty: 160, rate: { kcal: 340, p: 8.5, f: 11.3, c: 51.0 }, category: "Pekovski izdelki" },
  { name: "Vaflji s smetano", unit: "g", defaultQty: 150, rate: { kcal: 300, p: 7.5, f: 10.0, c: 45.0 }, category: "Pekovski izdelki" },
  { name: "Churros (porcija)", unit: "g", defaultQty: 100, rate: { kcal: 420, p: 10.5, f: 14.0, c: 63.0 }, category: "Pekovski izdelki" },
  { name: "Langoš s česnom", unit: "g", defaultQty: 200, rate: { kcal: 270, p: 6.8, f: 9.0, c: 40.5 }, category: "Pekovski izdelki" },
  { name: "Pica rezina hawai", unit: "g", defaultQty: 150, rate: { kcal: 255, p: 8.9, f: 9.9, c: 32.5 }, category: "Pekovski izdelki" },
  { name: "Pica rezina pikantna salama", unit: "g", defaultQty: 150, rate: { kcal: 280, p: 9.8, f: 10.9, c: 35.7 }, category: "Pekovski izdelki" },
  { name: "Sendvič tuna solata", unit: "g", defaultQty: 170, rate: { kcal: 220, p: 8.2, f: 7.3, c: 30.3 }, category: "Pekovski izdelki" },
  { name: "Sendvič vegetarijanski (zelenjavni)", unit: "g", defaultQty: 160, rate: { kcal: 190, p: 7.1, f: 6.3, c: 26.1 }, category: "Pekovski izdelki" },
  { name: "Sendvič jajčna solata", unit: "g", defaultQty: 160, rate: { kcal: 240, p: 9.0, f: 8.0, c: 33.0 }, category: "Pekovski izdelki" },
  { name: "Baguette sendvič šunka-sir", unit: "g", defaultQty: 200, rate: { kcal: 260, p: 9.8, f: 8.7, c: 35.8 }, category: "Pekovski izdelki" },
  { name: "Bagel sezamov", unit: "g", defaultQty: 90, rate: { kcal: 270, p: 6.8, f: 9.0, c: 40.5 }, category: "Pekovski izdelki" },
  { name: "Bagel sirov namaz", unit: "g", defaultQty: 150, rate: { kcal: 260, p: 6.5, f: 8.7, c: 39.0 }, category: "Pekovski izdelki" },
  { name: "Pretzel (kranjski precelj) slan", unit: "g", defaultQty: 90, rate: { kcal: 290, p: 7.2, f: 9.7, c: 43.5 }, category: "Pekovski izdelki" },
  { name: "Pretzel s sirom", unit: "g", defaultQty: 110, rate: { kcal: 320, p: 8.0, f: 10.7, c: 48.0 }, category: "Pekovski izdelki" },
  { name: "Hot dog (klasični)", unit: "g", defaultQty: 150, rate: { kcal: 270, p: 6.8, f: 9.0, c: 40.5 }, category: "Pekovski izdelki" },
  { name: "Sendvič salama-kumarice", unit: "g", defaultQty: 150, rate: { kcal: 270, p: 10.1, f: 9.0, c: 37.1 }, category: "Pekovski izdelki" },
  { name: "Toast s pršutom in sirom", unit: "g", defaultQty: 150, rate: { kcal: 300, p: 11.2, f: 10.0, c: 41.2 }, category: "Pekovski izdelki" },
  { name: "Toast vegetarijanski", unit: "g", defaultQty: 140, rate: { kcal: 230, p: 8.6, f: 7.7, c: 31.6 }, category: "Pekovski izdelki" },
  { name: "Pica burek z mesom", unit: "g", defaultQty: 220, rate: { kcal: 300, p: 9.0, f: 16.7, c: 28.5 }, category: "Pekovski izdelki" },
  { name: "Zeljnati burek", unit: "g", defaultQty: 200, rate: { kcal: 235, p: 7.0, f: 13.1, c: 22.3 }, category: "Pekovski izdelki" },
  { name: "Jabolčni burek (sladki)", unit: "g", defaultQty: 180, rate: { kcal: 270, p: 8.1, f: 15.0, c: 25.6 }, category: "Pekovski izdelki" },
  { name: "Skutin burek (sladki)", unit: "g", defaultQty: 180, rate: { kcal: 265, p: 7.9, f: 14.7, c: 25.2 }, category: "Pekovski izdelki" },
  { name: "Orehovi rogljički (mini)", unit: "g", defaultQty: 50, rate: { kcal: 430, p: 8.6, f: 21.5, c: 50.5 }, category: "Pekovski izdelki" },
  { name: "Makovi rogljički (mini)", unit: "g", defaultQty: 50, rate: { kcal: 420, p: 8.4, f: 21.0, c: 49.3 }, category: "Pekovski izdelki" },
  { name: "Kokosove kocke", unit: "g", defaultQty: 50, rate: { kcal: 410, p: 10.2, f: 13.7, c: 61.5 }, category: "Pekovski izdelki" },
  { name: "Rum kroglice", unit: "g", defaultQty: 20, rate: { kcal: 420, p: 10.5, f: 14.0, c: 63.0 }, category: "Pekovski izdelki" },
  { name: "Piškoti Linzer (2 kosa)", unit: "g", defaultQty: 40, rate: { kcal: 480, p: 12.0, f: 16.0, c: 72.0 }, category: "Pekovski izdelki" },
  { name: "Biskvitna rulada z marmelado (rezina)", unit: "g", defaultQty: 100, rate: { kcal: 320, p: 8.0, f: 10.7, c: 48.0 }, category: "Pekovski izdelki" },
  { name: "Orehova rulada (rezina)", unit: "g", defaultQty: 100, rate: { kcal: 370, p: 9.2, f: 12.3, c: 55.5 }, category: "Pekovski izdelki" },
  { name: "Makova rulada (rezina)", unit: "g", defaultQty: 100, rate: { kcal: 360, p: 9.0, f: 12.0, c: 54.0 }, category: "Pekovski izdelki" },
  { name: "Bučna štrukljev pita (kos)", unit: "g", defaultQty: 150, rate: { kcal: 240, p: 6.0, f: 8.0, c: 36.0 }, category: "Pekovski izdelki" },
  { name: "Ajdovi žganci s ocvirki (porcija)", unit: "g", defaultQty: 300, rate: { kcal: 320, p: 8.0, f: 10.7, c: 48.0 }, category: "Pekovski izdelki" },
  { name: "Štruklji z mesom (kosilo, porcija)", unit: "g", defaultQty: 300, rate: { kcal: 260, p: 6.5, f: 8.7, c: 39.0 }, category: "Pekovski izdelki" },
  { name: "Golaž z žlikrofi (porcija)", unit: "g", defaultQty: 400, rate: { kcal: 220, p: 3.9, f: 9.8, c: 29.2 }, category: "Pekovski izdelki" },
  { name: "Jota (enolončnica, porcija)", unit: "g", defaultQty: 350, rate: { kcal: 150, p: 3.8, f: 5.0, c: 22.5 }, category: "Pekovski izdelki" },
  { name: "Ričet (enolončnica, porcija)", unit: "g", defaultQty: 350, rate: { kcal: 140, p: 3.5, f: 4.7, c: 21.0 }, category: "Pekovski izdelki" },
  { name: "Pleskavica s pecivom", unit: "g", defaultQty: 250, rate: { kcal: 300, p: 7.5, f: 10.0, c: 45.0 }, category: "Pekovski izdelki" },
  { name: "Čevapčiči (5 kosov) s kruhom", unit: "g", defaultQty: 250, rate: { kcal: 290, p: 6.5, f: 2.6, c: 60.2 }, category: "Pekovski izdelki" },
  { name: "Krompir solata (priloga)", unit: "g", defaultQty: 150, rate: { kcal: 130, p: 3.2, f: 4.3, c: 19.5 }, category: "Pekovski izdelki" },
  { name: "Zeljna solata (priloga)", unit: "g", defaultQty: 150, rate: { kcal: 60, p: 1.5, f: 2.0, c: 9.0 }, category: "Pekovski izdelki" },
  { name: "Pomfri (gostinski, porcija)", unit: "g", defaultQty: 150, rate: { kcal: 300, p: 7.5, f: 10.0, c: 45.0 }, category: "Pekovski izdelki" },
  { name: "Ocvrti sir (porcija)", unit: "g", defaultQty: 150, rate: { kcal: 340, p: 8.5, f: 11.3, c: 51.0 }, category: "Pekovski izdelki" },
  { name: "Dunajski zrezek s prilogo (porcija)", unit: "g", defaultQty: 350, rate: { kcal: 320, p: 8.0, f: 10.7, c: 48.0 }, category: "Pekovski izdelki" },
  { name: "Piščančja solata (porcija)", unit: "g", defaultQty: 300, rate: { kcal: 180, p: 4.5, f: 6.0, c: 27.0 }, category: "Pekovski izdelki" },
  { name: "Lazanja (porcija)", unit: "g", defaultQty: 350, rate: { kcal: 220, p: 5.5, f: 7.3, c: 33.0 }, category: "Pekovski izdelki" },
  { name: "Lasagne bolognese (porcija, gostinsko)", unit: "g", defaultQty: 350, rate: { kcal: 230, p: 5.8, f: 7.7, c: 34.5 }, category: "Pekovski izdelki" },
  { name: "Rižota z gobami (porcija)", unit: "g", defaultQty: 300, rate: { kcal: 180, p: 4.5, f: 6.0, c: 27.0 }, category: "Pekovski izdelki" },
  { name: "Testenine s pestom (porcija)", unit: "g", defaultQty: 300, rate: { kcal: 210, p: 5.2, f: 7.0, c: 31.5 }, category: "Pekovski izdelki" },
  { name: "Njoki s siром (porcija)", unit: "g", defaultQty: 300, rate: { kcal: 200, p: 5.0, f: 6.7, c: 30.0 }, category: "Pekovski izdelki" },
  { name: "Kremna kava (cappuccino s sladkorjem)", unit: "g", defaultQty: 200, rate: { kcal: 90, p: 1.3, f: 4.5, c: 11.0 }, category: "Pekovski izdelki" },
  { name: "Vroča čokolada (kavarna)", unit: "g", defaultQty: 250, rate: { kcal: 220, p: 5.5, f: 7.3, c: 33.0 }, category: "Pekovski izdelki" },
  { name: "Frape (ledena kava s smetano)", unit: "g", defaultQty: 300, rate: { kcal: 180, p: 4.5, f: 6.0, c: 27.0 }, category: "Pekovski izdelki" },
  { name: "Sladoledni kupček (2 kepici, sladoledarna)", unit: "g", defaultQty: 100, rate: { kcal: 180, p: 4.5, f: 6.0, c: 27.0 }, category: "Pekovski izdelki" },
  { name: "Sladoledni kupček s smetano (sladoledarna)", unit: "g", defaultQty: 150, rate: { kcal: 260, p: 6.5, f: 8.7, c: 39.0 }, category: "Pekovski izdelki" },
  { name: "Sladoledna kupa (banana split)", unit: "g", defaultQty: 250, rate: { kcal: 380, p: 9.5, f: 12.7, c: 57.0 }, category: "Pekovski izdelki" },
  { name: "Vaflji sladoledarna (s sladoledom in smetano)", unit: "g", defaultQty: 200, rate: { kcal: 420, p: 10.5, f: 14.0, c: 63.0 }, category: "Pekovski izdelki" },
  { name: "Milkshake vanilija (sladoledarna)", unit: "g", defaultQty: 300, rate: { kcal: 320, p: 8.0, f: 10.7, c: 48.0 }, category: "Pekovski izdelki" },
  { name: "Grški jogurt z medom in orehi (sladica)", unit: "g", defaultQty: 200, rate: { kcal: 260, p: 6.5, f: 8.7, c: 39.0 }, category: "Pekovski izdelki" },
  { name: "Palačinke Suzette (2 kosa)", unit: "g", defaultQty: 180, rate: { kcal: 320, p: 8.0, f: 10.7, c: 48.0 }, category: "Pekovski izdelki" },
  { name: "Skutni štrudelj (kavarna)", unit: "g", defaultQty: 120, rate: { kcal: 270, p: 5.4, f: 10.5, c: 38.5 }, category: "Pekovski izdelki" },
  { name: "Makova potičnica (mini)", unit: "g", defaultQty: 50, rate: { kcal: 370, p: 9.2, f: 12.3, c: 55.5 }, category: "Pekovski izdelki" },
  { name: "Orehova potičnica (mini)", unit: "g", defaultQty: 50, rate: { kcal: 390, p: 9.8, f: 13.0, c: 58.5 }, category: "Pekovski izdelki" },
  { name: "Rogljiček s skuto in rozinami", unit: "g", defaultQty: 80, rate: { kcal: 310, p: 6.2, f: 15.5, c: 36.4 }, category: "Pekovski izdelki" },
  { name: "Ovseni piškoti domači (2 kosa)", unit: "g", defaultQty: 40, rate: { kcal: 460, p: 11.5, f: 15.3, c: 69.0 }, category: "Pekovski izdelki" },
  { name: "Karamelni flan (kos)", unit: "g", defaultQty: 100, rate: { kcal: 200, p: 5.0, f: 6.7, c: 30.0 }, category: "Pekovski izdelki" },
];

const SNACK_CATEGORIES = [
  "Proteinski izdelki",
  "Mlečni izdelki",
  "Sadje",
  "Čokolada in sladkarije",
  "Bomboni in sladkarije",
  "Keksi in vafli",
  "Oreščki in semena",
  "Slani prigrizki",
  "Popcorn in riževi vaflji",
  "Mesni narezki",
  "Pekovski izdelki",
  "Namazi",
  "Žita in musli",
  "Sladoled in zamrznjeni prigrizki",
  "Slovenski specialiteti",
  "McDonald's",
  "Drugo",
  "Pijače",
];

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

function bestSourceFor(nutrientKey, excludeCodes) {
  const candidates = ALL_RECIPES.filter((r) => r.micro && !excludeCodes.includes(r.code));
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

function useDayPlan(targetKcal, selectedDay, recipes) {
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
      const item = SNACKS[s.snackIdx];
      const qty = s.qty === "" ? item.defaultQty : Number(s.qty);
      return { item, qty, macros: contribution({ unit: "g", qty, rate: item.rate }), isCustom: false };
    });
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
    const suggestion = low ? bestSourceFor(key, usedCodes) : null;
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
 * po dolgem seznamu (174+ izdelkov) uporabnik samo tipka (npr. "jog") in
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

function SnackAutocomplete({ value, query, onQueryChange, onSelect }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const selected = value !== "" && value !== "custom" ? SNACKS[Number(value)] : null;
  const displayValue = value === "custom" ? "✏️ Dodaj svoje živilo (ročno)" : selected ? selected.name : query;

  const q = normalizeSl(query.trim());
  const pool = q.length > 0 ? SNACKS.filter((sn) => normalizeSl(sn.name).includes(q)) : SNACKS;
  const matches = pool.slice(0, 15);

  function handleFocus() {
    setOpen(true);
    // Na telefonu tipkovnica prekrije spodnji del zaslona — počakamo, da se
    // tipkovnica prikaže, nato polje pomaknemo na vrh vidnega dela zaslona,
    // da ima seznam predlogov čim več prostora.
    setTimeout(() => {
      wrapRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 300);
  }

  return (
    <div className="relative flex-1" ref={wrapRef}>
      <input
        value={displayValue}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Išči živilo (npr. jogurt, čips, čokolada ...)"
        className="w-full text-[13px] px-2 py-1.5 rounded-sm outline-none"
        style={{ border: `1px solid ${COLOR.line}`, background: COLOR.paper, fontFamily: "Georgia, serif" }}
      />
      {open && (
        <div
          className="absolute z-10 left-0 right-0 mt-1 rounded-sm overflow-y-auto"
          style={{ background: COLOR.card, border: `1px solid ${COLOR.line}`, boxShadow: "0 4px 12px rgba(0,0,0,0.12)", maxHeight: 340 }}
        >
          <button
            onMouseDown={() => onSelect("custom")}
            className="w-full text-left px-2.5 py-2 text-[13px]"
            style={{ borderBottom: `1px solid ${COLOR.line}`, color: COLOR.forest, background: COLOR.sageSoft }}
          >
            ✏️ Dodaj svoje živilo (ročno)
          </button>
          {q.length === 0 && (
            <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-wide" style={{ color: COLOR.sage }}>
              Nekaj predlogov — ali začni tipkati za ožji izbor
            </div>
          )}
          {q.length > 0 && matches.length === 0 && (
            <div className="px-2.5 py-2 text-[12px]" style={{ color: COLOR.sage }}>
              Ni zadetkov — poskusi "Dodaj svoje živilo" zgoraj.
            </div>
          )}
          {matches.map((sn) => {
            const idx = SNACKS.indexOf(sn);
            return (
              <button
                key={sn.name}
                onMouseDown={() => onSelect(String(idx))}
                className="w-full text-left px-2.5 py-2"
                style={{ borderBottom: `1px solid ${COLOR.line}` }}
              >
                <div className="text-[13px]" style={{ fontFamily: "Georgia, serif", color: COLOR.ink, lineHeight: 1.3 }}>
                  {sn.name}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: COLOR.sage }}>
                  {sn.category}
                </div>
              </button>
            );
          })}
          {q.length > 0 && pool.length > matches.length && (
            <div className="px-2.5 py-1.5 text-[10px]" style={{ color: COLOR.sage }}>
              + še {pool.length - matches.length} zadetkov — natipkaj več črk za ožji izbor
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MobileMealCard({ slot, label, icon, open, onToggle, code, setCode, options, mealExtras, setMealExtras }) {
  const rows = mealExtras[slot] || [];
  const add = () => setMealExtras((prev) => ({ ...prev, [slot]: [...(prev[slot] || []), { snackIdx: "", qty: "" }] }));
  const update = (idx, field, value) => setMealExtras((prev) => ({ ...prev, [slot]: prev[slot].map((row, i) => i === idx ? { ...row, [field]: value } : row) }));
  return <section className="rounded-md overflow-hidden" style={{ background: COLOR.card, border: `1px solid ${open ? COLOR.forest : COLOR.line}` }}>
    <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-4 text-left"><span className="w-10 h-10 rounded-full flex items-center justify-center text-xl" style={{ background: open ? COLOR.sageSoft : COLOR.amberSoft }}>{icon}</span><span className="flex-1 text-[18px] uppercase" style={{ fontFamily: "Georgia, serif", color: COLOR.forest }}>{label}</span>{open ? <ChevronUp size={22} /> : <ChevronDown size={22} />}</button>
    {open ? <div className="px-4 pb-4"><label className="text-[11px] block mb-1" style={{ color: COLOR.sage }}>Kateri obrok naj se prilagodi?</label><select value={code} onChange={(e) => setCode(e.target.value)} className="w-full text-[16px] px-3 py-2 rounded-md outline-none" style={{ border: `1px solid ${COLOR.line}`, background: COLOR.paper, fontFamily: "Georgia, serif" }}><option value="">—</option>{options.map((recipe) => <option key={recipe.code} value={recipe.code}>{recipe.code} · {recipe.title}</option>)}</select><div className="mt-4"><label className="text-[11px] uppercase tracking-wide" style={{ color: COLOR.sage }}>Dodana živila</label>{rows.map((row, idx) => <div className="flex items-center gap-2 mt-2" key={idx}><select value={row.snackIdx} onChange={(e) => update(idx, "snackIdx", e.target.value)} className="min-w-0 flex-1 text-[15px] px-2 py-2 rounded-md" style={{ border: `1px solid ${COLOR.line}`, background: COLOR.paper, fontFamily: "Georgia, serif" }}><option value="">Izberi živilo</option>{SNACKS.map((food, foodIdx) => <option key={food.name} value={foodIdx}>{food.name}</option>)}</select><input type="number" value={row.qty} placeholder="150" onChange={(e) => update(idx, "qty", e.target.value)} className="w-20 text-[15px] px-2 py-2 rounded-md" style={{ border: `1px solid ${COLOR.line}`, background: COLOR.card }} /><span style={{ color: COLOR.sage }}>g</span><button onClick={() => setMealExtras((prev) => ({ ...prev, [slot]: prev[slot].filter((_, i) => i !== idx) }))} style={{ color: COLOR.danger }}><X size={20} /></button></div>)}<button onClick={add} className="mt-3 w-full py-3 rounded-md text-[16px]" style={{ border: `1px solid ${COLOR.line}`, background: COLOR.paper, color: COLOR.ink }}><Plus size={16} className="inline mr-2" />Dodaj še živilo</button></div></div> : <button onClick={onToggle} className="mx-4 mb-4 w-[calc(100%-2rem)] py-3 rounded-md text-[16px]" style={{ border: `1px solid ${COLOR.line}`, background: COLOR.paper }}><Plus size={16} className="inline mr-2" />Dodaj še živilo</button>}
  </section>;
}

function DayPlannerScreen({ plan, wb, selectedDay, setSelectedDay }) {
  const {
    dayTarget,
    zajtrkCode, setZajtrkCode, kosiloCode, setKosiloCode, vecerjaCode, setVecerjaCode,
    snacks, addSnack, updateSnack, removeSnack, snackEntries, snackM, mealExtras, setMealExtras,
    zajtrk, kosilo, vecerja, ingFor, zajtrkM, kosiloM, vecerjaM, dayTotal,
    microRows, showMicro, overBudget, adjustSlot, setAdjustSlot, slotLabels,
    recipeOptions,
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

      <div className="space-y-3 mb-5">
        <MobileMealCard slot="zajtrk" label="Zajtrk" icon="☀️" open={openMeal === "zajtrk"} onToggle={() => setOpenMeal(openMeal === "zajtrk" ? "" : "zajtrk")} code={zajtrkCode} setCode={setZajtrkCode} options={recipeOptions.breakfast} mealExtras={mealExtras} setMealExtras={setMealExtras} />
        <MobileMealCard slot="kosilo" label="Kosilo" icon="☀️" open={openMeal === "kosilo"} onToggle={() => setOpenMeal(openMeal === "kosilo" ? "" : "kosilo")} code={kosiloCode} setCode={setKosiloCode} options={recipeOptions.lunch} mealExtras={mealExtras} setMealExtras={setMealExtras} />
        <MobileMealCard slot="vecerja" label="Večerja" icon="🌙" open={openMeal === "vecerja"} onToggle={() => setOpenMeal(openMeal === "vecerja" ? "" : "vecerja")} code={vecerjaCode} setCode={setVecerjaCode} options={recipeOptions.breakfast} mealExtras={mealExtras} setMealExtras={setMealExtras} />
      </div>
      <div className="rounded-sm overflow-hidden hidden" style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}>
        <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ borderBottom: `1px solid ${COLOR.line}` }}>
          <div>
            <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: COLOR.sage }}>
              Zajtrk
            </label>
            <select
              value={zajtrkCode}
              onChange={(e) => setZajtrkCode(e.target.value)}
              className="w-full text-[13px] px-2 py-1.5 rounded-sm outline-none"
              style={{ border: `1px solid ${COLOR.line}`, background: COLOR.paper, fontFamily: "Georgia, serif" }}
            >
              <option value="">—</option>
              {recipeOptions.breakfast.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} · {r.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: COLOR.sage }}>
              Kosilo
            </label>
            <select
              value={kosiloCode}
              onChange={(e) => setKosiloCode(e.target.value)}
              className="w-full text-[13px] px-2 py-1.5 rounded-sm outline-none"
              style={{ border: `1px solid ${COLOR.line}`, background: COLOR.paper, fontFamily: "Georgia, serif" }}
            >
              <option value="">—</option>
              {recipeOptions.lunch.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} · {r.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: COLOR.sage }}>
              Večerja
            </label>
            <select
              value={vecerjaCode}
              onChange={(e) => setVecerjaCode(e.target.value)}
              className="w-full text-[13px] px-2 py-1.5 rounded-sm outline-none"
              style={{ border: `1px solid ${COLOR.line}`, background: COLOR.paper, fontFamily: "Georgia, serif" }}
            >
              <option value="">—</option>
              {recipeOptions.breakfast.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} · {r.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: COLOR.sage }}>
              Kateri obrok naj se prilagodi?
            </label>
            <select
              value={adjustSlot}
              onChange={(e) => setAdjustSlot(e.target.value)}
              className="w-full text-[13px] px-2 py-1.5 rounded-sm outline-none"
              style={{ border: `1px solid ${COLOR.line}`, background: COLOR.paper, fontFamily: "Georgia, serif" }}
            >
              <option value="zajtrk">Zajtrk</option>
              <option value="kosilo">Kosilo</option>
              <option value="vecerja">Večerja</option>
            </select>
          </div>
        </div>

        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${COLOR.line}` }}>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] uppercase tracking-wide" style={{ color: COLOR.sage }}>
              Malica / sladica (lahko dodaš več)
            </label>
            <button onClick={addSnack} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-sm" style={{ background: COLOR.forest, color: "#FFFFFF" }}>
              <Plus size={12} /> Dodaj
            </button>
          </div>
          {snacks.length === 0 && (
            <p className="text-[12px]" style={{ color: COLOR.sage }}>
              Brez malice — pritisni "Dodaj", če želiš vključiti npr. jabolko in proteinski puding.
            </p>
          )}
          <div className="space-y-2">
            {snacks.map((s, idx) => {
              const item = s.snackIdx !== "" && s.snackIdx !== "custom" ? SNACKS[s.snackIdx] : null;
              const isCustom = s.snackIdx === "custom";
              return (
                <div key={idx} className="rounded-sm" style={isCustom ? { border: `1px solid ${COLOR.line}`, padding: 8 } : null}>
                  <div className="flex items-center gap-2">
                    <SnackAutocomplete
                      value={s.snackIdx}
                      query={s.query || ""}
                      onQueryChange={(v) => updateSnack(idx, "query", v)}
                      onSelect={(v) => updateSnack(idx, "snackIdx", v)}
                    />
                    {!isCustom && (
                      <input
                        type="number"
                        min="0"
                        disabled={!item}
                        placeholder={item ? String(item.defaultQty) : "g"}
                        value={s.qty}
                        onChange={(e) => updateSnack(idx, "qty", e.target.value)}
                        className="w-16 text-right text-[13px] px-2 py-1.5 rounded-sm outline-none"
                        style={{ border: `1px solid ${COLOR.line}`, background: COLOR.paper, fontFamily: "'Courier New', monospace", opacity: item ? 1 : 0.5 }}
                      />
                    )}
                    {!isCustom && (
                      <span className="text-[11px]" style={{ color: COLOR.sage }}>
                        g
                      </span>
                    )}
                    <button onClick={() => removeSnack(idx)} style={{ color: COLOR.danger }}>
                      <X size={14} />
                    </button>
                  </div>
                  {isCustom && (
                    <div className="mt-2 space-y-1.5">
                      <input
                        value={s.customName}
                        onChange={(e) => updateSnack(idx, "customName", e.target.value)}
                        placeholder="Ime živila (npr. domača pica)"
                        className="w-full text-[13px] px-2 py-1.5 rounded-sm outline-none"
                        style={{ border: `1px solid ${COLOR.line}`, background: COLOR.paper, fontFamily: "Georgia, serif" }}
                      />
                      <p className="text-[10px]" style={{ color: COLOR.sage }}>
                        Hranilne vrednosti preveri na embalaži (poglej "Hranilna vrednost na 100 g") ali na spletu, nato
                        vnesi spodaj. Za drugačno količino od 100 g spremeni polje "g" spodaj.
                      </p>
                      <div className="grid grid-cols-4 gap-1.5">
                        <div>
                          <label className="text-[9px]" style={{ color: COLOR.sage }}>
                            Kcal/100g
                          </label>
                          <input
                            type="number"
                            value={s.customKcal}
                            onChange={(e) => updateSnack(idx, "customKcal", e.target.value)}
                            className="w-full text-[12px] px-1.5 py-1 rounded-sm outline-none"
                            style={{ border: `1px solid ${COLOR.line}`, background: COLOR.paper, fontFamily: "'Courier New', monospace" }}
                          />
                        </div>
                        <div>
                          <label className="text-[9px]" style={{ color: COLOR.sage }}>
                            B (g)
                          </label>
                          <input
                            type="number"
                            value={s.customP}
                            onChange={(e) => updateSnack(idx, "customP", e.target.value)}
                            className="w-full text-[12px] px-1.5 py-1 rounded-sm outline-none"
                            style={{ border: `1px solid ${COLOR.line}`, background: COLOR.paper, fontFamily: "'Courier New', monospace" }}
                          />
                        </div>
                        <div>
                          <label className="text-[9px]" style={{ color: COLOR.sage }}>
                            M (g)
                          </label>
                          <input
                            type="number"
                            value={s.customF}
                            onChange={(e) => updateSnack(idx, "customF", e.target.value)}
                            className="w-full text-[12px] px-1.5 py-1 rounded-sm outline-none"
                            style={{ border: `1px solid ${COLOR.line}`, background: COLOR.paper, fontFamily: "'Courier New', monospace" }}
                          />
                        </div>
                        <div>
                          <label className="text-[9px]" style={{ color: COLOR.sage }}>
                            OH (g)
                          </label>
                          <input
                            type="number"
                            value={s.customC}
                            onChange={(e) => updateSnack(idx, "customC", e.target.value)}
                            className="w-full text-[12px] px-1.5 py-1 rounded-sm outline-none"
                            style={{ border: `1px solid ${COLOR.line}`, background: COLOR.paper, fontFamily: "'Courier New', monospace" }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px]" style={{ color: COLOR.sage }}>
                          Tvoja količina:
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="100"
                          value={s.qty}
                          onChange={(e) => updateSnack(idx, "qty", e.target.value)}
                          className="w-16 text-right text-[12px] px-1.5 py-1 rounded-sm outline-none"
                          style={{ border: `1px solid ${COLOR.line}`, background: COLOR.paper, fontFamily: "'Courier New', monospace" }}
                        />
                        <span className="text-[10px]" style={{ color: COLOR.sage }}>
                          g
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-4 py-3 grid grid-cols-4 gap-2" style={{ background: COLOR.forest }}>
          <StatPill label="Skupaj dan" value={round1(dayTotal.kcal)} unit="kcal" tone="#FFFFFF" />
          <StatPill label="Beljakovine" value={round1(dayTotal.p)} unit="g" tone="#FFFFFF" />
          <StatPill label="Maščobe" value={round1(dayTotal.f)} unit="g" tone="#FFFFFF" />
          <StatPill label="OH" value={round1(dayTotal.c)} unit="g" tone="#FFFFFF" />
        </div>
        {overBudget && (
          <p className="text-[11px] px-4 py-2" style={{ background: COLOR.amberSoft, color: "#8A4B23" }}>
            Ostala dva obroka + malica že skoraj porabijo celoten dnevni proračun — {slotLabels[adjustSlot].toLowerCase()} bo
            zato zelo majhen/-a. Izberi drug obrok za prilagoditev ali manjšo malico.
          </p>
        )}
      </div>

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
  const [customRecipes, setCustomRecipes] = useState([]);
  const recipes = useMemo(() => {
    const customCodes = new Set(customRecipes.map((recipe) => recipe.code));
    return [...ALL_RECIPES.filter((recipe) => !customCodes.has(recipe.code)), ...customRecipes];
  }, [customRecipes]);
  const wb = useWeeklyBudget();
  const [selectedDay, setSelectedDay] = useState(WEEK_DAYS[JS_DAY_TO_INDEX[new Date().getDay()]].key);
  const dayPlan = useDayPlan(wb.weeklyTargets[selectedDay], selectedDay, recipes);

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
    fetchPublishedRecipes()
      .then((loadedRecipes) => {
        if (!cancelled) setCustomRecipes(loadedRecipes);
      })
      .catch(() => {
        // Admin shema morda še ni nameščena; vgrajeni recepti ostanejo na voljo.
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
