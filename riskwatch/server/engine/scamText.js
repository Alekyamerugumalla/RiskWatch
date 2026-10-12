// Rule-based scam-message classifier.
// Each category is a classic scam "tell". Scores combine categories, with a bonus for
// the deadly combos (credential request + lure/urgency). It is deliberately transparent:
// every point of score maps to a matched phrase the analyst can read.

const CATEGORIES = {
  urgency: {
    label: 'Urgency / pressure',
    weight: 0.15,
    patterns: [
      /\burgent(ly)?\b/i,
      /\bimmediately\b/i,
      /last chance/i,
      /within \d+ ?(hours|hrs|mins|minutes)/i,
      /expires? (today|soon|in)/i,
      /act now/i,
      /will be (blocked|suspended|closed)/i,
    ],
  },
  payment: {
    label: 'Asks for money',
    weight: 0.3,
    patterns: [
      /(pay|send|transfer)\s+(rs\.?|₹|inr)?\s?[\d,]+/i,
      /(processing|registration|delivery|activation|security|verification|onboarding|refundable) (fee|charge|deposit)/i,
      /advance (payment|amount)/i,
      /\bupi\b/i,
      /scan (the )?qr/i,
    ],
  },
  credentials: {
    label: 'Asks for credentials / KYC',
    weight: 0.35,
    patterns: [
      /\botp\b/i,
      /\bcvv\b/i,
      /\bpin\b/i,
      /\bpassword\b/i,
      /\bkyc\b/i,
      /aadhaar|aadhar/i,
      /verify your (account|identity|details|number)/i,
      /(share|send|enter) your (card|bank|account|upi)/i,
    ],
  },
  lure: {
    label: 'Too-good-to-be-true lure',
    weight: 0.2,
    patterns: [
      /\brefund\b/i,
      /cashback/i,
      /lucky (draw|winner)/i,
      /you('| ha)ve won/i,
      /free (gift|voucher|coupon)/i,
      /reward points?/i,
      /guaranteed (income|returns?|job)/i,
      /work from home/i,
      /franchise/i,
    ],
  },
  offplatform: {
    label: 'Pushes victim off-platform',
    weight: 0.2,
    patterns: [
      /whatsapp|telegram|t\.me\//i,
      /\bdm (us|me)\b/i,
      /click (the )?(link|here)/i,
      /(download|install) (the )?(\w+ )?(apk|app)\b/i,
      /\.apk\b/i,
      /link in bio/i,
    ],
  },
};

// Genuine anti-fraud warnings ("we will never ask for your OTP") should not trigger.
const WARNING = /(never|do not|don'?t|won'?t) (ask|share|request|give)|beware of|stay safe from|report (fake|fraud)/i;

export function classifyText(text) {
  const t = String(text || '');
  if (!t.trim()) return { score: 0, categories: [], matches: [], warning: false };

  const warning = WARNING.test(t);
  const hits = {};
  const matches = [];
  let extra = 0;

  for (const [key, cat] of Object.entries(CATEGORIES)) {
    if (warning && key === 'credentials') continue;
    let n = 0;
    for (const re of cat.patterns) {
      const m = t.match(re);
      if (m) {
        n++;
        matches.push(m[0].trim());
      }
    }
    if (n) {
      hits[key] = n;
      extra += Math.min(n - 1, 2) * 0.03;
    }
  }

  let score = Object.keys(hits).reduce((s, k) => s + CATEGORIES[k].weight, 0) + extra;
  if (hits.credentials && (hits.lure || hits.urgency || hits.payment)) score += 0.15;
  if (hits.payment && hits.lure) score += 0.1;
  if (warning) score *= 0.4;

  return {
    score: Math.min(1, Number(score.toFixed(3))),
    categories: Object.keys(hits).map((k) => CATEGORIES[k].label),
    matches: [...new Set(matches)].slice(0, 6),
    warning,
  };
}

/** Classify several texts, return the worst one. */
export function classifyMany(texts) {
  let worst = { score: 0, categories: [], matches: [], warning: false, text: '' };
  for (const text of texts) {
    const r = classifyText(text);
    if (r.score > worst.score) worst = { ...r, text };
  }
  return worst;
}
