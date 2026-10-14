// Multi-signal analysis for ANY brand. Every signal returns { id, label, weight, score (0..1), evidence }.
// Final risk = sum(weight * score), rescaled over the checks that actually had data, then a
// "brand-resemblance gate" and mitigating factors. Nothing here is a black box: the UI shows each
// signal, its points and its evidence.

import { bestMatch, brandSim, hamming, normalize } from './similarity.js';
import { classifyMany } from './scamText.js';
import { extractIndicators, indicatorKeys } from './indicators.js';

const KEYWORDS = [
  'support', 'help', 'helpdesk', 'care', 'customer', 'official', 'refund', 'cashback', 'reward', 'rewards',
  'offers', 'claim', 'kyc', 'verify', 'service', 'franchise', 'ceo', 'careers', 'hiring', 'jobs', 'wallet', 'lucky', 'draw',
];
const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.me', 'wa.me', 'linktr.ee', 'cutt.ly', 'rb.gy'];

const DANGEROUS_PERMS = {
  READ_SMS: 0.5, RECEIVE_SMS: 0.4, SEND_SMS: 0.4, BIND_ACCESSIBILITY_SERVICE: 0.6, SYSTEM_ALERT_WINDOW: 0.4,
  REQUEST_INSTALL_PACKAGES: 0.3, READ_CONTACTS: 0.2, BIND_DEVICE_ADMIN: 0.5, READ_CALL_LOG: 0.3, RECORD_AUDIO: 0.2,
};

const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const known = (v) => v !== null && v !== undefined && Number.isFinite(v);

/** `na` marks a check that could not run (missing input); it is left out of the score instead of counted as safe. */
const sig = (id, label, weight, score, evidence, { na = false } = {}) => {
  const s = na ? 0 : clamp(score);
  return { id, label, weight, na, score: Number(s.toFixed(3)), points: na ? 0 : Number((weight * s).toFixed(1)), evidence };
};

export function levelFor(score) {
  if (score >= 75) return 'Critical';
  if (score >= 55) return 'High';
  if (score >= 35) return 'Medium';
  return 'Low';
}

const hostOf = (url) => url.replace(/^https?:\/\//i, '').replace(/^www\./, '').split('/')[0].toLowerCase();

/* ---------------------------------------------------------------- accounts */

function analyzeAccount(e, brand) {
  const signals = [];
  const tokens = brand.tokens;
  const nameToken = normalize(brand.name);
  const say = (t) => (t === nameToken ? brand.name : t);
  const officialList = brand.officialHandles.length ? ` Official handles: ${brand.officialHandles.map((h) => '@' + h).join(', ')}.` : '';

  // 1. Handle look-alike
  const [handleToken, handleSim] = bestMatch(e.handle, tokens);
  const rawHandle = String(e.handle).toLowerCase();
  const plainContains = tokens.some((t) => rawHandle.replace(/[^a-z]/g, '').includes(normalize(t)));
  const handleScore = handleSim >= 0.99 ? 1 : handleSim >= 0.85 ? 0.7 : 0;
  let handleEv = `No resemblance to "${brand.name}" in the handle.`;
  if (handleScore > 0) {
    const tricks = [];
    if (/[0-9@$!]/.test(rawHandle)) tricks.push('character substitution (digits/symbols for letters)');
    if (handleSim >= 0.99 && !plainContains) tricks.push('hidden brand name after normalisation');
    if (handleSim < 0.99) tricks.push('near-miss spelling');
    handleEv = `Handle @${e.handle} ${handleSim >= 0.99 ? 'contains' : 'closely imitates'} "${say(handleToken)}"` +
      (tricks.length ? `, using ${tricks.join(' and ')}.` : '.') + officialList;
  }
  signals.push(sig('handle', 'Handle look-alike', 25, handleScore, handleEv));

  // 2. Display-name clone
  const dispSim = brandSim(e.displayName, tokens);
  const dispExact = brand.officialDisplayNames.some((n) => normalize(n) === normalize(e.displayName));
  const dispScore = dispExact ? 1 : dispSim >= 0.85 ? 0.8 : 0;
  signals.push(sig('display', 'Display-name clone', 8, dispScore,
    dispScore ? `Display name "${e.displayName}" reuses the brand name${dispExact ? ' exactly' : ''} on a non-official account.`
      : 'Display name does not reuse the brand name.'));

  // 3. Logo / profile image (skipped when either image is missing)
  const hasLogo = !!brand.logoHash && !!e.logoHash;
  const d = hasLogo ? hamming(e.logoHash, brand.logoHash) : 64;
  const logoScore = d <= 6 ? 1 : d <= 12 ? 0.75 : d <= 18 ? 0.35 : 0;
  signals.push(sig('logo', 'Logo / image match', 15, logoScore,
    !brand.logoHash ? 'No brand logo is on file, so images were not compared.'
      : !e.logoHash ? 'No profile image was provided, so it was not compared.'
      : logoScore ? `Profile image is a near-copy of the brand logo (perceptual-hash distance ${d}/64; lower = more similar).`
      : `Profile image is different from the brand logo (distance ${d}/64).`, { na: !hasLogo }));

  // 4. Impersonation keywords
  const bag = `${e.handle} ${e.displayName} ${e.bio}`.toLowerCase();
  const kwHits = KEYWORDS.filter((k) => new RegExp(`\\b${k}\\b|${k}`, 'i').test(bag.replace(/[._-]/g, ' ')));
  signals.push(sig('keywords', 'Impersonation keywords', 10, kwHits.length / 2,
    kwHits.length ? `Uses authority/lure words: ${kwHits.slice(0, 6).join(', ')}.` : 'No support/refund/KYC style keywords.'));

  // 5. Account behaviour (only the facts we were given)
  const age = e.createdDaysAgo;
  const flags = [];
  let b = 0;
  if (known(age)) {
    if (age < 7) { b += 1; flags.push(`created ${age} days ago`); }
    else if (age < 30) { b += 0.8; flags.push(`only ${age} days old`); }
    else if (age < 90) { b += 0.4; flags.push(`${age} days old`); }
  }
  if (known(e.followers) && known(e.following)) {
    const ratioFF = e.followers / Math.max(1, e.following);
    if (e.following > 500 && ratioFF < 0.3) { b += 0.5; flags.push(`follows ${e.following} but has ${e.followers} followers`); }
  }
  if (known(e.posts) && known(age) && e.posts <= 10 && age < 60) { b += 0.3; flags.push(`only ${e.posts} posts`); }
  if (!e.verified) { b += 0.15; flags.push('not verified'); }
  const anyProfile = known(age) || known(e.followers) || known(e.following) || known(e.posts);
  signals.push(sig('behaviour', 'Account behaviour', 15, b,
    !anyProfile ? 'No profile details (age, followers, posts) were given, so behaviour was not checked.'
      : flags.length ? `Suspicious profile: ${flags.join('; ')}.` : 'Established account with normal activity.', { na: !anyProfile }));

  // 6. Link risk
  const links = extractIndicators([e.link, e.bio, ...e.recentPosts], brand.officialDomains, brand.officialPhones).links;
  const linkEv = [];
  let linkScore = 0;
  for (const l of links) {
    const host = hostOf(l);
    let s = 0.3;
    if (/\.apk$/i.test(l)) { s = 1; linkEv.push(`links straight to an APK file (${l})`); }
    else if (brandSim(host, tokens) >= 0.85) { s = 1; linkEv.push(`link domain imitates the brand (${host})`); }
    else if (SHORTENERS.some((x) => host === x)) { s = 0.6; linkEv.push(`uses a shortener / chat link (${host})`); }
    else linkEv.push(`links to unrelated domain (${host})`);
    linkScore = Math.max(linkScore, s);
  }
  signals.push(sig('links', 'Link risk', 12, linkScore, linkEv.length ? `Account ${linkEv.join('; ')}.` : 'No external links.'));

  // 7. Scam-message classifier
  const scam = classifyMany([e.bio, ...e.recentPosts]);
  signals.push(Object.assign(sig('scamtext', 'Scam-message classifier', 15, scam.score,
    scam.score > 0.2
      ? `Message reads like a scam (${scam.categories.join(', ')}). Matched: ${scam.matches.map((m) => `"${m}"`).join(', ')}.`
      : 'No scam patterns in bio or recent posts.'), { matches: scam.score > 0.2 ? scam.matches : [] }));

  const brandResemblance = Math.max(handleSim, dispSim, logoScore ? 1 - d / 32 : 0);
  return finish(e, brand, signals, { brandResemblance, scamScore: scam.score, resemblanceNote: 'handle, display name and logo' },
    mitigationsForAccount(e));
}

function mitigationsForAccount(e) {
  const m = [];
  if (/\b(unofficial|fan page|not affiliated|not run by|parody)\b/i.test(e.bio)) {
    m.push({ label: 'Bio says it is unofficial / not affiliated with the brand', points: -15 });
  }
  if (known(e.createdDaysAgo) && known(e.followers) && known(e.following) && e.createdDaysAgo > 730 && e.followers > 5000 && e.following < e.followers) {
    m.push({ label: 'Long-lived account with a real audience', points: -10 });
  }
  return m;
}

/* -------------------------------------------------------------------- apps */

function analyzeApp(e, brand) {
  const o = brand.officialApp;
  const tokens = brand.tokens;
  const signals = [];
  // The form fills a blank developer with "Unknown"; treat that as not provided.
  const dev = e.developer && e.developer !== 'Unknown' ? e.developer : '';

  const nameSim = brandSim(e.name, tokens);
  const pkgSim = brandSim(e.packageName, tokens);
  const pkgExact = !!o.package && e.packageName === o.package;
  const nameScore = Math.max(nameSim >= 0.99 ? 1 : nameSim >= 0.85 ? 0.7 : 0, pkgSim >= 0.99 ? 1 : pkgSim >= 0.85 ? 0.7 : 0);
  signals.push(sig('appname', 'Name / package look-alike', 25, nameScore,
    nameScore ? `App "${e.name}" (${e.packageName || 'no package given'}) imitates "${o.name}"${o.package ? ` (${o.package})` : ''}.`
      : 'App name and package are unrelated to the brand.'));

  const iconRef = o.iconHash || brand.logoHash;
  const hasIcon = !!iconRef && !!e.iconHash;
  const d = hasIcon ? hamming(e.iconHash, iconRef) : 64;
  const iconScore = d <= 6 ? 1 : d <= 12 ? 0.75 : d <= 18 ? 0.35 : 0;
  signals.push(sig('icon', 'Icon match', 10, iconScore,
    !iconRef ? 'No brand logo is on file, so icons were not compared.'
      : !e.iconHash ? 'No app icon was provided, so it was not compared.'
      : iconScore ? `App icon is a near-copy of the official icon (hash distance ${d}/64).`
      : `Icon differs from the official icon (distance ${d}/64).`, { na: !hasIcon }));

  
const sourceMap = {
  'Google Play': 0,
  'third-party-store': 0.7,
  'direct-download': 1,
  telegram: 1,
  whatsapp: 1,
};

let src = sourceMap[e.store] ?? 0.7;
let srcEv = `Distribution source "${e.store}" needs verification.`;

if (e.store === 'Google Play') {
  srcEv = 'Listed on Google Play. Store presence alone does not establish impersonation.';
} else if (src >= 0.7) {
  srcEv = `Potentially untrusted distribution source: ${e.store} (${e.downloadUrl || 'no store listing'}).`;
}

  signals.push(sig('source', 'Distribution source', 20, src, srcEv));

  const permHits = (e.permissions || []).filter((p) => DANGEROUS_PERMS[p] && !o.permissions.includes(p));
  const permScore = permHits.reduce((s, p) => s + DANGEROUS_PERMS[p], 0) / 1.2;
  signals.push(sig('perms', 'Dangerous permissions', 20, permScore,
    permHits.length ? `Requests permissions the real app does not need: ${permHits.join(', ')}.` : 'No unusual permissions compared to the official app.'));

  // Signer: compare the signing certificate when the brand gave one, otherwise the developer name.
  // A blank developer / certificate means "unknown", never "mismatch": we can only judge what we were given.
  const certKnown = !!o.certSha256;
  const certOk = certKnown && !!e.certSha256 && e.certSha256 === o.certSha256;
  const devOk = !!o.developer && dev === o.developer;
  const canJudgeSigner = certKnown ? !!(e.certSha256 || dev) : !!(o.developer && dev);
  let signer = 0;
  if (canJudgeSigner) {
    if (certKnown) signer = certOk && devOk ? 0 : !e.certSha256 ? 0.7 : 1;
    else signer = devOk ? 0 : 0.8;
  }
  signals.push(sig('signer', 'Signer / developer mismatch', 15, signer,
    canJudgeSigner
      ? (signer ? `${certKnown && e.certSha256 ? 'Signing certificate' : certKnown ? 'No signing certificate' : 'Developer'} and developer ("${dev || 'not given'}") do not match the brand's.`
        : 'Matches the brand\'s own signer.')
      : !dev && !e.certSha256 ? 'No developer or signing certificate was given for this app, so the signer could not be checked.'
      : 'No official developer or signing certificate is on file for the brand, so the signer was not checked.', { na: !canJudgeSigner }));

  const brandResemblance = Math.max(nameSim, pkgSim, iconScore ? 1 - d / 32 : 0);
  // Trust needs proof of origin. A matching package name alone is NOT enough: repackaged malware reuses it.
  const trusted = certKnown ? certOk && devOk : pkgExact && devOk && e.store === 'Google Play';
  const text = classifyMany([e.description]);

  // A name match alone is only a lead. Impersonation needs a second, independent sign: a look-alike package,
  // an icon copy, sideloading, dangerous permissions, a failed signer check or scam wording.
  const corroboration = [];
  if (pkgSim >= 0.85 && !pkgExact) corroboration.push('look-alike package name');
  if (iconScore > 0) corroboration.push('icon copy');
  if (src >= 0.6) corroboration.push('distribution source');
  if (permHits.length) corroboration.push('dangerous permissions');
  if (canJudgeSigner && signer > 0) corroboration.push('signer mismatch');
  if (text.score > 0.25) corroboration.push('scam wording');
  const missing = [];
  if (!e.packageName) missing.push('package name');
  if (!dev) missing.push('developer');
  if (!e.iconHash) missing.push('app icon');
  const verification = nameScore > 0 && !corroboration.length && !trusted
    ? { missing, message: `The app name matches "${o.name}", but nothing else corroborates impersonation` +
        (missing.length ? ` and the ${missing.join(', ')} ${missing.length === 1 ? 'was' : 'were'} not provided` : '') +
        '. A matching name alone does not prove impersonation. Needs verification: check the store listing, package name and developer against the official app.' }
    : null;
  const out = finish(e, brand, signals, { brandResemblance, scamScore: text.score, resemblanceNote: 'name, package and icon', verification }, [],
    trusted ? { trusted: true, note: 'Matches the brand\'s own developer account and signing details' } : null);
  if (text.score > 0.25) {
    out.signals.push(sig('apptext', 'Store-description text', 0, text.score,
      `Description contains scam wording (${text.categories.join(', ')}).`));
  }
  return out;
}

/* ------------------------------------------------------------ shared tail  */

function finish(e, brand, signals, { brandResemblance, scamScore, resemblanceNote, verification = null }, mitigations, trust) {
  // Rescale over the checks that ran, so missing inputs lower confidence instead of silently lowering risk.
  const applicable = signals.filter((s) => !s.na && s.weight > 0);
  const totalWeight = applicable.reduce((s, x) => s + x.weight, 0);
  const scale = totalWeight > 0 ? 100 / totalWeight : 1;
  const skipped = signals.filter((s) => s.na).map((s) => s.label);
  let raw = applicable.reduce((s, x) => s + x.points, 0) * scale;
  const gate = { applied: false, reason: '' };

  // Brand-resemblance gate: behaviour alone (new account, few posts) must not flag a random user.
  if (brandResemblance < 0.5) {
    const cap = 35 + 30 * scamScore;
    if (raw > cap) {
      raw = cap;
      gate.applied = true;
      gate.reason = `Capped at ${Math.round(cap)}: no meaningful resemblance to the brand (${resemblanceNote}), so this is at most a generic scam risk, not brand impersonation.`;
    }
  }

  // Insufficient evidence: keep the score below the Medium band and say so explicitly.
  const NEEDS_VERIFICATION_CAP = 30;
  if (verification && raw > NEEDS_VERIFICATION_CAP) raw = NEEDS_VERIFICATION_CAP;

  const mitPoints = mitigations.reduce((s, m) => s + m.points, 0);
  let score = clamp(raw + mitPoints, 0, 100);

  let official = false;
  if (trust?.trusted) {
    score = 0; official = true;
    mitigations = [{ label: trust.note, points: -Math.round(raw) }];
  }
  if (e.type === 'account' && brand.officialHandles.includes(String(e.handle).toLowerCase())) {
    score = 0; official = true;
    mitigations = [{ label: 'Handle is on the brand\'s official allow-list', points: -Math.round(raw) }];
  }
  score = Math.round(score);

  const texts = e.type === 'account'
    ? [e.link, e.bio, ...e.recentPosts]
    : [e.downloadUrl, e.description];
  const indicators = extractIndicators(texts, brand.officialDomains, brand.officialPhones);
  const hashes = e.fileSha256 ? [e.fileSha256] : [];
  // A Telegram channel *is* its own link, so posts elsewhere that point to it connect to it.
  if (e.type === 'account' && e.platform === 'telegram') indicators.links.push(`t.me/${String(e.handle).toLowerCase()}`);

  return {
    id: e.id,
    type: e.type,
    platform: e.platform,
    title: e.type === 'account' ? `@${e.handle}` : e.name,
    subtitle: e.type === 'account' ? e.displayName : e.packageName || 'package not given',
    score,
    level: levelFor(score),
    official,
    signals,
    skipped,
    mitigations,
    gate,
    indicators: { ...indicators, hashes },
    indicatorKeys: indicatorKeys(indicators, hashes),
    status: official ? 'official' : verification ? 'needs_verification' : 'assessed',
    verification: verification && !official ? verification.message : null,
    summary: official ? summarize(signals, score, official)
      : verification ? 'Needs verification: name matches the brand, but there is not enough evidence to call it impersonation.'
      : summarize(signals, score, official),
    label: e.label,
    truthCampaign: e.truthCampaign || null,
    raw: e,
  };
}

function summarize(signals, score, official) {
  if (official) return 'Verified official asset of the brand.';
  const top = [...signals].filter((s) => s.points > 0).sort((a, b) => b.points - a.points).slice(0, 2);
  if (!top.length || score < 20) return 'No meaningful risk signals.';
  return top.map((s) => s.label.toLowerCase()).join(' + ') + (score >= 55 ? ' → likely impersonation' : '');
}

export function analyze(entity, brand) {
  return entity.type === 'app' ? analyzeApp(entity, brand) : analyzeAccount(entity, brand);
}