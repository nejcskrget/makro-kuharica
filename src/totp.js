/**
 * Minimalna TOTP (Time-based One-Time Password) implementacija — RFC 6238,
 * enak standard, ki ga uporabljajo Google Authenticator, Authy itd.
 * Uporablja Web Crypto API (crypto.subtle), ki je na voljo v vseh sodobnih
 * brskalnikih — brez zunanjih knjižnic.
 *
 * POMEMBNO (pošteno glede varnosti): ker se koda preverja V BRSKALNIKU
 * (statična spletna stran, brez strežnika), lahko tehnično podkovan
 * uporabnik s pregledom izvorne kode (Network/Sources zavihek) najde
 * skrivni ključ (SECRET) in si nato sam generira veljavne kode kadarkoli.
 * To NI enakovredno pravi strežniški avtentikaciji — je pa bistveno večja
 * ovira za priložnostno posredovanje povezave kot navadno statično geslo,
 * ker se koda vsak dan spremeni in stara koda ne deluje več.
 * Za resnično varnost (npr. plačljiva naročnina) je naslednji korak pravi
 * sistem prijave z računi (glej README.md).
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(base32) {
  let bits = "";
  for (const char of base32.replace(/=+$/, "").toUpperCase()) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substr(i, 8), 2));
  }
  return new Uint8Array(bytes);
}

function counterToBytes(counter) {
  const bytes = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    bytes[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  return bytes;
}

async function hmacSha1(keyBytes, msgBytes) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, msgBytes);
  return new Uint8Array(sig);
}

/**
 * Izračuna trenutno TOTP kodo (ali za sosednje časovno okno, glej `offset`).
 * @param {string} secretBase32 - skrivni ključ v Base32 obliki (isti kot v avtentikator aplikaciji)
 * @param {number} period - dolžina časovnega okna v sekundah (privzeto 1 dan = 86400)
 * @param {number} digits - dolžina kode (privzeto 6)
 * @param {number} offset - koliko časovnih oken naprej/nazaj (za toleranco časovnega zamika)
 */
export async function generateTOTP(secretBase32, period = 86400, digits = 6, offset = 0) {
  const counter = Math.floor(Date.now() / 1000 / period) + offset;
  const key = base32Decode(secretBase32);
  const msg = counterToBytes(counter);
  const hmac = await hmacSha1(key, msg);
  const offsetByte = hmac[hmac.length - 1] & 0xf;
  const binCode =
    ((hmac[offsetByte] & 0x7f) << 24) |
    ((hmac[offsetByte + 1] & 0xff) << 16) |
    ((hmac[offsetByte + 2] & 0xff) << 8) |
    (hmac[offsetByte + 3] & 0xff);
  const code = (binCode % 10 ** digits).toString().padStart(digits, "0");
  return code;
}

/** Preveri vneseno kodo proti trenutnemu oknu ± 1 (toleranca za zamik ure). */
export async function verifyTOTP(secretBase32, inputCode, period = 86400, digits = 6) {
  const candidates = await Promise.all([-1, 0, 1].map((offset) => generateTOTP(secretBase32, period, digits, offset)));
  return candidates.includes(inputCode.trim());
}

/**
 * `otpauth://` URI, ki ga pretvoriš v QR kodo (npr. na https://www.qr-code-generator.com/
 * ali kateremkoli spletnem "text to QR" orodju) in poskeniraš z Google Authenticator /
 * Authy / 1Password — tvoj telefon nato prikazuje ISTO kodo kot spletna stran.
 */
export function buildOtpAuthUri(secretBase32, label = "Makro kuharica", issuer = "Makro kuharica", period = 86400, digits = 6) {
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    period: String(period),
    digits: String(digits),
    algorithm: "SHA1",
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?${params.toString()}`;
}
