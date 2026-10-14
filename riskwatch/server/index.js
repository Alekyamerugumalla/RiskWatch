
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildState } from './engine/store.js';
import { analyze } from './engine/analyze.js';
import { checkUrl } from './engine/urlChecker.js';
import { matchCampaigns } from './engine/campaigns.js';
import {
  takedownForEntity,
  takedownForCampaign,
} from './engine/takedown.js';
import { evaluate } from './engine/evaluation.js';

import {
  DEMO_ID,
  addBrand,
  getBrand,
  listBrands,
  publicBrand,
  removeBrand,
  listBrandAssets,
  addBrandAsset,
  updateBrandAsset,
  removeBrandAsset,
} from './engine/brands.js';

import { discoverCandidates } from './engine/discovery.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '200kb' }));

const state = buildState();
const decisions = new Map();
const history = new Map();

// Remove large raw records from list responses.
const slim = ({ raw, indicatorKeys, ...a }) => ({
  ...a,
  decision: decisions.get(a.id) || null,
});

const full = ({ indicatorKeys, ...a }) => ({
  ...a,
  decision: decisions.get(a.id) || null,
});

const str = (v, n = 500) => String(v ?? '').slice(0, n);

const num = (v) => {
  if (v === '' || v === null || v === undefined) {
    return null;
  }

  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const hex = (v) =>
  typeof v === 'string' && /^[0-9a-f]{16}$/i.test(v)
    ? v.toLowerCase()
    : undefined;

// Supported platforms and stores for manually entered and discovered candidates.
const ACCOUNT_PLATFORMS = [
  'instagram',
  'facebook',
  'x',
  'telegram',
  'bluesky',
];

const APP_STORES = [
  'Google Play',
  'app-store',
  'third-party-store',
  'direct-download',
  'telegram',
  'whatsapp',
];

/* ------------------------------------------------------------------ health */

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/brand', (_req, res) => {
  res.json(state.brand);
});

/* ------------------------------------------------------------------ brands */

app.get('/api/brands', (_req, res) => {
  res.json(listBrands().map(publicBrand));
});

app.post('/api/brands', (req, res) => {
  try {
    res.status(201).json(publicBrand(addBrand(req.body)));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/brands/:id', (req, res) => {
  try {
    if (!removeBrand(req.params.id)) {
      return res.status(404).json({ error: 'Brand not found' });
    }

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

/* ------------------------------------------------------------ brand assets */

// List a brand's official and reference assets.
app.get('/api/brands/:id/assets', (req, res) => {
  if (!getBrand(req.params.id)) {
    return res.status(404).json({ error: 'Brand not found' });
  }

  res.json(listBrandAssets(req.params.id));
});

// Add an asset.
app.post('/api/brands/:id/assets', (req, res) => {
  try {
    const asset = addBrandAsset(req.params.id, req.body);
    res.status(201).json(asset);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Update an asset.
app.patch('/api/brands/:id/assets/:assetId', (req, res) => {
  try {
    const asset = updateBrandAsset(
      req.params.id,
      req.params.assetId,
      req.body
    );

    if (!asset) {
      return res.status(404).json({ error: 'Brand asset not found' });
    }

    res.json(asset);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Remove an asset.
app.delete('/api/brands/:id/assets/:assetId', (req, res) => {
  try {
    const removed = removeBrandAsset(
      req.params.id,
      req.params.assetId
    );

    if (!removed) {
      return res.status(404).json({ error: 'Brand asset not found' });
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ---------------------------------------------------- candidate discovery */

// Discover potential brand-related social accounts and app listings.
// Discovery results are candidates, not confirmed impersonation.
app.post('/api/brands/:id/discover', async (req, res) => {
  try {
    const brand = getBrand(req.params.id);

    if (!brand) {
      return res.status(404).json({
        error: 'Brand not found.',
      });
    }

    const requestedSources = Array.isArray(req.body?.sources)
      ? req.body.sources
      : ['bluesky', 'apple'];

    const allowedSources = ['bluesky', 'apple'];

    const sources = [
      ...new Set(
        requestedSources.filter((source) =>
          allowedSources.includes(source)
        )
      ),
    ];

    if (sources.length === 0) {
      return res.status(400).json({
        error: 'Select at least one supported discovery source.',
      });
    }

    const result = await discoverCandidates(brand, { sources });

    return res.json(result);
  } catch (error) {
    console.error('Candidate discovery failed:', error);

    return res.status(500).json({
      error: 'Candidate discovery failed.',
      details: error.message || 'Unknown error.',
    });
  }
});

/* -------------------------------------------------------------- demo queue */

app.get('/api/stats', (_req, res) => {
  const nonOfficial = state.analyses.filter((x) => !x.official);

  res.json({
    monitored: state.analyses.length,
    flagged: nonOfficial.filter((x) => x.score >= 55).length,
    critical: nonOfficial.filter((x) => x.level === 'Critical').length,
    campaigns: state.campaigns.length,
    accounts: state.analyses.filter((x) => x.type === 'account').length,
    apps: state.analyses.filter((x) => x.type === 'app').length,
    confirmed: [...decisions.values()].filter(
      (d) => d === 'confirmed'
    ).length,
  });
});

app.get('/api/entities', (_req, res) => {
  res.json(state.analyses.map(slim));
});

app.get('/api/entities/:id', (req, res) => {
  const analysis = state.byId.get(req.params.id);

  if (!analysis) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json(full(analysis));
});

app.post('/api/entities/:id/decision', (req, res) => {
  const analysis = state.byId.get(req.params.id);

  if (!analysis) {
    return res.status(404).json({ error: 'Not found' });
  }

  const { decision } = req.body || {};

  if (!['confirmed', 'dismissed', null].includes(decision)) {
    return res.status(400).json({
      error: 'decision must be confirmed | dismissed | null',
    });
  }

  if (decision) {
    decisions.set(analysis.id, decision);
  } else {
    decisions.delete(analysis.id);
  }

  res.json({
    id: analysis.id,
    decision: decisions.get(analysis.id) || null,
  });
});

app.get('/api/campaigns', (_req, res) => {
  res.json(
    state.campaigns.map((campaign) => ({
      ...campaign,
      memberDetails: campaign.members.map((id) =>
        slim(state.byId.get(id))
      ),
    }))
  );
});

/* --------------------------------------------------------------- takedowns */

app.get('/api/takedown/entity/:id', (req, res) => {
  const analysis = state.byId.get(req.params.id);

  if (!analysis) {
    return res.status(404).json({ error: 'Not found' });
  }

  const campaign = state.campaigns.find(
    (item) => item.id === analysis.campaignId
  );

  res.json(takedownForEntity(analysis, state.brand, campaign));
});

app.get('/api/takedown/campaign/:id', (req, res) => {
  const campaign = state.campaigns.find(
    (item) => item.id === req.params.id
  );

  if (!campaign) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json(
    takedownForCampaign(campaign, state.byId, state.brand)
  );
});

/* --------------------------------------------------------------- live check */

// Analyze an account or app against the selected brand.
app.post('/api/check', (req, res) => {
  const b = req.body || {};
  const brand = getBrand(b.brandId || DEMO_ID);

  if (!brand) {
    return res.status(404).json({
      error: 'Unknown brand. Add it on the Brands screen first.',
    });
  }

  const type = b.type === 'app' ? 'app' : 'account';
  let entity;

  if (type === 'account') {
    const handle = str(b.handle, 100)
      .replace(/^@/, '')
      .trim();

    if (!handle) {
      return res.status(400).json({
        error: 'Enter the account handle.',
      });
    }

    entity = {
      id: 'adhoc',
      type,
      platform: ACCOUNT_PLATFORMS.includes(b.platform)
        ? b.platform
        : 'instagram',
      handle,
      displayName: str(b.displayName, 100).trim() || handle,
      bio: str(b.bio, 1000),
      verified: !!b.verified,
      createdDaysAgo: num(b.createdDaysAgo),
      followers: num(b.followers),
      following: num(b.following),
      posts: num(b.posts),
      logoHash:
        hex(b.logoHash) ||
        (b.copiesLogo && brand.logoHash
          ? brand.logoHash
          : undefined),
      link: str(b.link, 500).trim(),
      recentPosts: (
        Array.isArray(b.recentPosts) ? b.recentPosts : []
      )
        .slice(0, 20)
        .map((post) => str(post, 2000))
        .filter(Boolean),
      label: 'unknown',
    };
  } else {
    const name = str(b.name, 100).trim();

    if (!name) {
      return res.status(400).json({
        error: 'Enter the app name.',
      });
    }

    entity = {
      id: 'adhoc',
      type,
      platform: 'android',
      name,
      packageName: str(b.packageName, 150).trim(),
      developer: str(b.developer, 100).trim() || 'Unknown',
      store: APP_STORES.includes(b.store)
        ? b.store
        : 'direct-download',
      downloadUrl: str(b.downloadUrl, 500).trim(),
      certSha256: str(b.certSha256, 100).trim(),
      iconHash:
        hex(b.iconHash) ||
        (b.copiesLogo && brand.logoHash
          ? brand.logoHash
          : undefined),
      permissions: (
        Array.isArray(b.permissions) ? b.permissions : []
      )
        .slice(0, 50)
        .map((permission) =>
          str(permission, 60).trim().toUpperCase()
        )
        .filter(Boolean),
      description: str(b.description, 1000),
      label: 'unknown',
    };
  }

  const result = analyze(entity, brand);

  const linkedCampaigns = brand.isDemo
    ? matchCampaigns(result, state.campaigns, state.byId)
    : [];

  // Find earlier checks from this brand that share indicators.
  const selfKey = `${result.type}:${result.title.toLowerCase()}`;

  const earlier = (history.get(brand.id) || []).filter(
    (item) => item.key !== selfKey
  );

  const mine = new Set(result.indicatorKeys);

  const relatedChecks = earlier
    .map((item) => ({
      title: item.title,
      type: item.type,
      score: item.score,
      level: item.level,
      shared: item.keys
        .filter((key) => mine.has(key))
        .map((key) => {
          const [indicatorType, ...rest] = key.split(':');

          return {
            type: indicatorType,
            value: rest.join(':'),
          };
        }),
    }))
    .filter((item) => item.shared.length > 0);

  if (result.score >= 35 && !result.official) {
    earlier.push({
      key: selfKey,
      title: result.title,
      type: result.type,
      score: result.score,
      level: result.level,
      keys: result.indicatorKeys,
    });
  }

  history.set(brand.id, earlier.slice(-200));

  const { indicatorKeys, ...rest } = result;

  res.json({
    ...rest,
    brand: {
      id: brand.id,
      name: brand.name,
    },
    linkedCampaigns,
    relatedChecks,
    takedown:
      result.score >= 55
        ? takedownForEntity(result, brand, null)
        : null,
  });
});

/* ----------------------------------------------------------- URL reputation */

// Check a URL against the existing URL reputation checker.
app.post('/api/check-url', async (req, res) => {
  try {
    const url = str(req.body?.url, 2048).trim();

    if (!url) {
      return res.status(400).json({
        error: 'Please enter a URL.',
      });
    }

    const result = await checkUrl(url);

    res.json({
      url,
      ...result,
    });
  } catch (error) {
    console.error('URL check failed:', error);

    res.status(500).json({
      error: 'Unable to check this URL right now.',
    });
  }
});

/* --------------------------------------------------------------- evaluation */

app.get('/api/eval', (_req, res) => {
  res.json(evaluate(state.analyses, state.campaigns));
});

/* ---------------------------------------------------------- static frontend */

// Serve the built dashboard when present.
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'client', 'dist');

if (fs.existsSync(dist)) {
  app.use(express.static(dist));

  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

/* ------------------------------------------------------------------- start */

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`RiskWatch API on http://localhost:${PORT}`);
});
