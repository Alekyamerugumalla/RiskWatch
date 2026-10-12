import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildState } from './engine/store.js';
import { analyze } from './engine/analyze.js';
import { matchCampaigns } from './engine/campaigns.js';
import { takedownForEntity, takedownForCampaign } from './engine/takedown.js';
import { evaluate } from './engine/evaluation.js';
import { DEMO_ID, addBrand, getBrand, listBrands, publicBrand, removeBrand } from './engine/brands.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '200kb' }));

const state = buildState(); // FreshKart demo data (review queue, campaigns, accuracy)
const decisions = new Map(); // analyst review decisions (in memory; swap for a DB in production)
const history = new Map(); // brandId -> earlier flagged checks, used to link new checks to them

// Strip the heavy raw record from list responses.
const slim = ({ raw, indicatorKeys, ...a }) => ({ ...a, decision: decisions.get(a.id) || null });
const full = ({ indicatorKeys, ...a }) => ({ ...a, decision: decisions.get(a.id) || null });

const str = (v, n = 500) => String(v ?? '').slice(0, n);
const num = (v) => {
  if (v === '' || v === null || v === undefined) return null; // blank means "unknown", not zero
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const hex = (v) => (typeof v === 'string' && /^[0-9a-f]{16}$/i.test(v) ? v.toLowerCase() : undefined);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/brand', (_req, res) => res.json(state.brand));

/* ------------------------------------------------------------------ brands */

app.get('/api/brands', (_req, res) => res.json(listBrands().map(publicBrand)));

app.post('/api/brands', (req, res) => {
  try {
    res.status(201).json(publicBrand(addBrand(req.body)));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/brands/:id', (req, res) => {
  try {
    if (!removeBrand(req.params.id)) return res.status(404).json({ error: 'Brand not found' });
    history.delete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/brands/:id/history', (req, res) => {
  history.delete(req.params.id);
  res.json({ ok: true });
});

/* -------------------------------------------------------------- demo queue */

app.get('/api/stats', (_req, res) => {
  const a = state.analyses.filter((x) => !x.official);
  res.json({
    monitored: state.analyses.length,
    flagged: a.filter((x) => x.score >= 55).length,
    critical: a.filter((x) => x.level === 'Critical').length,
    campaigns: state.campaigns.length,
    accounts: state.analyses.filter((x) => x.type === 'account').length,
    apps: state.analyses.filter((x) => x.type === 'app').length,
    confirmed: [...decisions.values()].filter((d) => d === 'confirmed').length,
  });
});

app.get('/api/entities', (_req, res) => res.json(state.analyses.map(slim)));

app.get('/api/entities/:id', (req, res) => {
  const a = state.byId.get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  res.json(full(a));
});

app.post('/api/entities/:id/decision', (req, res) => {
  const a = state.byId.get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  const { decision } = req.body || {};
  if (!['confirmed', 'dismissed', null].includes(decision)) return res.status(400).json({ error: 'decision must be confirmed | dismissed | null' });
  if (decision) decisions.set(a.id, decision);
  else decisions.delete(a.id);
  res.json({ id: a.id, decision: decisions.get(a.id) || null });
});

app.get('/api/campaigns', (_req, res) =>
  res.json(state.campaigns.map((c) => ({ ...c, memberDetails: c.members.map((id) => slim(state.byId.get(id))) })))
);

app.get('/api/takedown/entity/:id', (req, res) => {
  const a = state.byId.get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  const campaign = state.campaigns.find((c) => c.id === a.campaignId);
  res.json(takedownForEntity(a, state.brand, campaign));
});

app.get('/api/takedown/campaign/:id', (req, res) => {
  const c = state.campaigns.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(takedownForCampaign(c, state.byId, state.brand));
});

/* -------------------------------------------------------------- live check */

// Check any handle / app against ANY configured brand: explainable verdict + links to earlier findings.
app.post('/api/check', (req, res) => {
  const b = req.body || {};
  const brand = getBrand(b.brandId || DEMO_ID);
  if (!brand) return res.status(404).json({ error: 'Unknown brand. Add it on the Brands screen first.' });

  const type = b.type === 'app' ? 'app' : 'account';
  let entity;
  if (type === 'account') {
    const handle = str(b.handle, 100).replace(/^@/, '').trim();
    if (!handle) return res.status(400).json({ error: 'Enter the account handle.' });
    entity = {
      id: 'adhoc', type, platform: ['instagram', 'facebook', 'x', 'telegram'].includes(b.platform) ? b.platform : 'instagram',
      handle, displayName: str(b.displayName, 100).trim() || handle, bio: str(b.bio, 1000), verified: !!b.verified,
      createdDaysAgo: num(b.createdDaysAgo), followers: num(b.followers), following: num(b.following), posts: num(b.posts),
      logoHash: hex(b.logoHash) || (b.copiesLogo && brand.logoHash ? brand.logoHash : undefined),
      link: str(b.link, 500).trim(),
      recentPosts: (Array.isArray(b.recentPosts) ? b.recentPosts : []).slice(0, 20).map((p) => str(p, 2000)).filter(Boolean),
      label: 'unknown',
    };
  } else {
    const name = str(b.name, 100).trim();
    if (!name) return res.status(400).json({ error: 'Enter the app name.' });
    entity = {
      id: 'adhoc', type, platform: 'android', name, packageName: str(b.packageName, 150).trim(),
      developer: str(b.developer, 100).trim() || 'Unknown',
      store: ['Google Play', 'third-party-store', 'direct-download', 'telegram', 'whatsapp'].includes(b.store) ? b.store : 'direct-download',
      downloadUrl: str(b.downloadUrl, 500).trim(), certSha256: str(b.certSha256, 100).trim(),
      iconHash: hex(b.iconHash) || (b.copiesLogo && brand.logoHash ? brand.logoHash : undefined),
      permissions: (Array.isArray(b.permissions) ? b.permissions : []).slice(0, 50).map((p) => str(p, 60).trim().toUpperCase()).filter(Boolean),
      description: str(b.description, 1000), label: 'unknown',
    };
  }

  const result = analyze(entity, brand);
  const linkedCampaigns = brand.isDemo ? matchCampaigns(result, state.campaigns, state.byId) : [];

  // Link to earlier checks of this brand that share a link, phone number, payment ID or file.
  const selfKey = `${result.type}:${result.title.toLowerCase()}`;
  const earlier = (history.get(brand.id) || []).filter((h) => h.key !== selfKey);
  const mine = new Set(result.indicatorKeys);
  const relatedChecks = earlier
    .map((h) => ({
      title: h.title, type: h.type, score: h.score, level: h.level,
      shared: h.keys.filter((k) => mine.has(k)).map((k) => { const [t, ...r] = k.split(':'); return { type: t, value: r.join(':') }; }),
    }))
    .filter((h) => h.shared.length);
  if (result.score >= 35 && !result.official) {
    earlier.push({ key: selfKey, title: result.title, type: result.type, score: result.score, level: result.level, keys: result.indicatorKeys });
  }
  history.set(brand.id, earlier.slice(-200));

  const { indicatorKeys, ...rest } = result;
  res.json({
    ...rest,
    brand: { id: brand.id, name: brand.name },
    linkedCampaigns,
    relatedChecks,
    takedown: result.score >= 55 ? takedownForEntity(result, brand, null) : null,
  });
});

app.get('/api/eval', (_req, res) => res.json(evaluate(state.analyses, state.campaigns)));

// Serve the built dashboard when present (single-process deployment).
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`RiskWatch API on http://localhost:${PORT}`));
