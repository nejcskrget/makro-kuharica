# Makro kuharica — spletna aplikacija (Vite + React)

Ta mapa je **pravi, zgrajen in preizkušen spletni projekt** — ne samo osnutek.
V tem okolju sem ga dejansko namestil (`npm install`) in zgradil
(`npm run build`) — brez napak.

## Prijava z računi + omejitev na eno napravo (Supabase Auth)

Namesto začasne dnevne kode zdaj aplikacija uporablja **pravo, strežniško
avtentikacijo** (Supabase — brezplačen do dokaj velikega obsega). Vsak
uporabnik ima svoj račun (e-pošta + geslo), ti pa vsakemu ročno ustvariš
dostop. Ko se nekdo prijavi na **novi napravi**, se prejšnja naprava z istim
računom **samodejno odjavi** — to preverja aplikacija vsakih 20 sekund.

### Nastavitev (enkraten korak, ~10 minut)

1. Pojdi na **https://supabase.com** → "Start your project" → brezplačna
   registracija → "New project" (izberi ime, geslo za bazo, regijo — npr.
   Frankfurt za EU).
2. Ko je projekt pripravljen: **SQL Editor** (levo v meniju) → "New query" →
   prilepi VSO vsebino datoteke `supabase-schema.sql` (priložena v tem
   projektu) → "Run".
3. **Project Settings → API** → prekopiraj `Project URL` in `anon public` ključ.
4. V tej mapi prekopiraj `.env.example` v `.env` in vpiši ti dve vrednosti:
   ```
   VITE_SUPABASE_URL=https://tvoj-projekt.supabase.co
   VITE_SUPABASE_ANON_KEY=tvoj-anon-key
   ```
5. `npm install` → `npm run build` — v `dist/` dobiš zgrajeno stran, ki
   uporablja tvoj Supabase projekt.

### Kako dodaš (plačano) stranko

Supabase nadzorna plošča → **Authentication → Users → "Add user"** → vpiši
njen e-poštni naslov in geslo (lahko ji ga preprosto sporočiš, ali vklopiš
e-poštna povabila v Supabase nastavitvah). Registracija prek same aplikacije
NI omogočena — dostop dodeljuješ samo ti, kar je smiselno za plačljiv produkt.

Za odvzem dostopa: isto mesto → izbriši uporabnika (ali mu spremeni geslo).

### Omejitev na eno napravo — kako deluje

- Ob vsaki prijavi ta naprava v Supabase tabeli `device_sessions` **prepiše**
  zapis za tega uporabnika s svojim edinstvenim ID-jem naprave.
- Vsake 20 sekund vsaka prijavljena naprava preveri: "ali sem še vedno jaz
  zapisan kot aktivna naprava?" Če ne (ker se je nekdo prijavil drugje), se
  samodejno odjavi z jasnim sporočilom.
- To NI 100-odstotno neprebojno (nekdo bi teoretično lahko onemogočil
  internetno povezavo in ostal "prijavljen" dlje), je pa za realno uporabo
  (deljenje računa med prijatelji) zelo učinkovito in odvrne večino ljudi.

### (Opcijsko) Prejšnja TOTP zaščita

Datoteki `src/PasswordGate.jsx` in `src/totp.js` iz prejšnje različice sta še
vedno v projektu, a se trenutno ne uporabljata (`main.jsx` zdaj uporablja
`AuthGate`). Če bi želel oba sloja zaščite hkrati (dnevna koda + prijava),
ju lahko v `main.jsx` gnezdiš enega v drugega.

## Zagon lokalno

```bash
npm install
npm run dev
```

## Objava — dobesedno v eni minuti, brez računa (za hosting)

1. Prepričaj se, da imaš `.env` s pravimi Supabase vrednostmi, nato
   `npm run build`.
2. Pojdi na **https://app.netlify.com/drop**
3. Povleci **celo mapo `dist/`** (ne posameznih datotek) v brskalnik —
   dobiš živo povezavo.

### Alternativa: Vercel

```bash
npm install -g vercel
vercel --prod
```
Pri Vercelu lahko okoljske spremenljivke (`.env` vrednosti) nastaviš tudi
neposredno v njihovi nadzorni plošči (Project → Settings → Environment
Variables), kar je priročno, če ne želiš vsakič ročno graditi lokalno.

## Dodatna zaščita na ravni gostovanja (priporočeno poleg prijave)

Netlify in Vercel imata na plačljivih paketih vgrajeno geslo za dostop do
cele strani ("Password Protection") — dodatna, strežniška plast pred tvojo
lastno prijavo.

## Struktura

```
index.html              - vstopna HTML stran
supabase-schema.sql      - SQL shema za Supabase (poganjaš enkrat, ob nastavitvi)
.env.example             - predloga za tvoje Supabase podatke
src/
  main.jsx                - vstopna točka, ovije aplikacijo z AuthGate
  supabaseClient.js        - poveže se s tvojim Supabase projektom
  AuthGate.jsx             - prijava, seja, omejitev na eno napravo
  App.jsx                  - celotna aplikacija (recepti, dnevni jedilnik, nakupovalni seznam, priljubljeni)
  PasswordGate.jsx, totp.js - (neaktivno) prejšnja TOTP zaščita, na voljo za morebitno dodatno plast
  index.css                - Tailwind direktive
public/                   - ikone, manifest (namestitev na domači zaslon)
dist/                      - zgrajena različica (nastane z `npm run build`)
```
