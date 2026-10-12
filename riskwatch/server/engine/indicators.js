// Extract "indicators of compromise" (links, phones, UPI ids, file hashes) from an entity.
// Entities sharing an indicator are likely run by the same scammer -> same campaign.

const UPI_HANDLES = 'okaxis|okhdfcbank|oksbi|okicici|ybl|paytm|upi|ibl|axl|apl|fbl';
const URL_RE = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s)"'<>,]*)?/gi;
const UPI_RE = new RegExp(`\\b[\\w.\\-]{2,}@(?:${UPI_HANDLES})\\b`, 'gi');
const PHONE_RE = /(?:\+?91[\s-]?)?\b([6-9]\d{4}[\s-]?\d{5})\b/g;
const WA_RE = /wa\.me\/(?:91)?([6-9]\d{9})/gi;

const NOISE_TLDS = /\.(png|jpg|jpeg|gif|mp4|css|js)$/i;

function cleanUrl(u) {
  let s = u.toLowerCase().replace(/[.,;:!?]+$/, '');
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.split('?')[0].replace(/\/$/, '');
  return s;
}

export function extractIndicators(texts, officialDomains = [], officialPhones = []) {
  const joined = texts.filter(Boolean).join(' \n ');
  const official = officialDomains.map((d) => d.replace(/^www\./, ''));
  const links = new Set();
  const phones = new Set();
  const upi = new Set();

  // UPI ids first, so "name@okaxis" is not mistaken for a URL.
  for (const m of joined.matchAll(UPI_RE)) upi.add(m[0].toLowerCase());
  const withoutUpi = joined.replace(UPI_RE, ' ');

  for (const m of withoutUpi.matchAll(URL_RE)) {
    const u = cleanUrl(m[0]);
    if (NOISE_TLDS.test(u)) continue;
    const host = u.split('/')[0];
    // The brand's own domain and any of its subdomains (help.brand.com) are never indicators.
    if (official.some((d) => host === d || host.endsWith(`.${d}`))) continue;
    // Skip things like "e.g" or bare words that happen to contain a dot (but keep short hosts like t.me).
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host)) continue;
    links.add(u);
  }

  for (const m of joined.matchAll(WA_RE)) phones.add(m[1]);
  for (const m of joined.matchAll(PHONE_RE)) phones.add(m[1].replace(/\D/g, ''));
  officialPhones.forEach((p) => phones.delete(p.replace(/\D/g, '').slice(-10)));

  return { links: [...links], phones: [...phones], upi: [...upi] };
}

/** Flatten to keys like "link:foo.xyz/bar" for cross-entity matching. */
export function indicatorKeys(ind, extraHashes = []) {
  return [
    ...ind.links.map((v) => `link:${v}`),
    ...ind.phones.map((v) => `phone:${v}`),
    ...ind.upi.map((v) => `upi:${v}`),
    ...extraHashes.filter(Boolean).map((v) => `hash:${v}`),
  ];
}
