// Multi-brand workspace. FreshKart is the built-in demo brand; any number of custom brands can be added.
// Each brand has its own watchlist (accounts and apps the analyst chose to monitor). Custom brands are
// saved to data/custom-brands.json so they survive a restart.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brand as freshkart } from '../data/brand.js';
import { entities as freshkartEntities } from '../data/dataset.js';
import { buildState } from './store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(here, '..', 'data', 'custom-brands.json');
const HASH = /^[0-9a-f]{16}$/i;

const workspaces = new Map(); // id -> { id, builtin, brand, entities, state }

const list = (v) =>
  (Array.isArray(v) ? v : String(v || '').split(/[,\n]/)).map((s) => String(s).trim()).filter(Boolean);

export function normalizeBrand(input) {
  const name = String(input.name || '').trim();
  const token = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (name.length < 3 || token.length < 3) throw new Error('Brand name must have at least 3 letters or digits.');

  const officialHandles = list(input.officialHandles).map((h) => h.toLowerCase().replace(/^@/, '').replace(/^.*\//, ''));
  const domains = list(input.officialDomains).map((d) => d.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]);
  const officialDomains = [...new Set(domains.flatMap((d) => [d, `www.${d}`]))];
  const logoHash = HASH.test(input.logoHash || '') ? input.logoHash.toLowerCase() : null;
  const app = input.officialApp || {};

  return {
    name,
    token,
    officialHandles,
    officialDisplayNames: [name, ...list(input.officialDisplayNames)],
    officialDomains,
    officialPhones: list(input.officialPhones).map((p) => p.replace(/\D/g, '').slice(-10)).filter(Boolean),
    logoHash,
    officialApp: {
      package: String(app.package || '').trim(),
      name: String(app.name || name).trim(),
      developer: String(app.developer || '').trim(),
      certSha256: '',
      iconHash: logoHash,
      store: 'Google Play',
      permissions: ['INTERNET'],
    },
  };
}

function rebuild(w) {
  w.state = buildState(w.brand, w.entities);
  return w;
}

function persist() {
  const custom = [...workspaces.values()].filter((w) => !w.builtin).map((w) => ({ id: w.id, brand: w.brand, entities: w.entities }));
  try {
    fs.writeFileSync(FILE, JSON.stringify({ brands: custom }, null, 2));
  } catch (err) {
    console.warn('Could not save custom brands:', err.message);
  }
}

export function loadWorkspaces() {
  workspaces.set('freshkart', rebuild({ id: 'freshkart', builtin: true, brand: { ...freshkart, demo: true }, entities: freshkartEntities }));
  try {
    const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    for (const b of saved.brands || []) workspaces.set(b.id, rebuild({ id: b.id, builtin: false, brand: b.brand, entities: b.entities || [] }));
  } catch {
    /* no saved brands yet */
  }
}

export const getWorkspace = (id) => workspaces.get(id || 'freshkart');

export function listBrands() {
  return [...workspaces.values()].map((w) => ({
    id: w.id,
    name: w.brand.name,
    builtin: w.builtin,
    watched: w.entities.length,
    hasLogo: !!w.brand.logoHash,
  }));
}

export function createBrand(input) {
  const brand = normalizeBrand(input);
  let id = brand.token;
  for (let n = 2; workspaces.has(id); n++) id = `${brand.token}-${n}`;
  const w = rebuild({ id, builtin: false, brand, entities: [] });
  workspaces.set(id, w);
  persist();
  return w;
}

export function deleteBrand(id) {
  const w = workspaces.get(id);
  if (!w || w.builtin) return false;
  workspaces.delete(id);
  persist();
  return true;
}

/** Add a checked account/app to a brand's watchlist and refresh its analyses and campaigns. */
export function addEntity(id, entity) {
  const w = workspaces.get(id);
  const next = w.entities.reduce((m, e) => Math.max(m, Number(String(e.id).split('-').pop()) || 0), 0) + 1;
  const saved = { ...entity, id: `${id}-w${next}`, label: 'unknown' };
  w.entities.push(saved);
  rebuild(w);
  if (!w.builtin) persist();
  return saved;
}
