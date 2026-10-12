// String / hash similarity helpers used by the signal engine.

// Characters scammers swap in to imitate letters (e.g. fr3shkart, freshkartt, freshkarrt).
const HOMOGLYPHS = { '0': 'o', '3': 'e', '4': 'a', '5': 's', '$': 's', '@': 'a', '7': 't', '8': 'b', '!': 'i' };

/**
 * Normalise a handle / name so look-alike tricks collapse to the real word.
 * variant 0 maps "1" -> "l", variant 1 maps "1" -> "i" (both are common).
 */
export function normalize(input, variant = 0) {
  let t = String(input || '').toLowerCase();
  t = t.replace(/rn/g, 'm').replace(/vv/g, 'w');
  t = [...t]
    .map((c) => {
      if (c === '1') return variant === 0 ? 'l' : 'i';
      return HOMOGLYPHS[c] ?? c;
    })
    .join('');
  return t.replace(/[^a-z]/g, '');
}

/** Damerau-Levenshtein (optimal string alignment): a swap of 2 letters costs 1. */
export function editDistance(a, b) {
  const al = a.length;
  const bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  const d = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) d[i][0] = i;
  for (let j = 0; j <= bl; j++) d[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[al][bl];
}

/** Whole-string similarity, 0..1. */
export function ratio(a, b) {
  if (!a.length && !b.length) return 1;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

/** Best similarity of `token` against any substring of `text` (0..1). 1 = token appears exactly. */
export function windowSim(text, token) {
  if (!token) return 0;
  const L = token.length;
  if (text.length < L - 1) return Math.max(0, ratio(text, token));
  let best = 0;
  for (let len = L - 1; len <= L + 1; len++) {
    for (let i = 0; i + len <= text.length; i++) {
      const s = 1 - editDistance(text.slice(i, i + len), token) / L;
      if (s > best) best = s;
      if (best === 1) return 1;
    }
  }
  return Math.max(0, best);
}

/**
 * How strongly does `text` contain / imitate `token`, trying both "1" interpretations.
 * Short brand names (4 letters or fewer, e.g. "SBI", "Ola") must match a whole word or the start of one,
 * otherwise "cola" or "hola" would look like "ola".
 */
export function brandSimilarity(text, token) {
  const tn = normalize(token, 0);
  if (!tn) return 0;
  if (tn.length <= 4) {
    const words = String(text || '').toLowerCase().split(/[^a-z0-9$@!]+/).filter(Boolean);
    return words.some((w) => [0, 1].some((v) => normalize(w, v).startsWith(tn))) ? 1 : 0;
  }
  return Math.max(windowSim(normalize(text, 0), tn), windowSim(normalize(text, 1), tn));
}

/** Best [token, similarity] pair across several brand tokens (name plus short aliases). */
export function bestMatch(text, tokens) {
  let best = ['', 0];
  for (const t of tokens) {
    const s = brandSimilarity(text, t);
    if (s > best[1]) best = [t, s];
  }
  return best;
}

export const brandSim = (text, tokens) => bestMatch(text, tokens)[1];

/** Hamming distance between two equal-length hex strings (perceptual-hash comparison). */
export function hamming(hexA, hexB) {
  if (!hexA || !hexB || hexA.length !== hexB.length) return 64;
  let dist = 0;
  for (let i = 0; i < hexA.length; i++) {
    let x = parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}
