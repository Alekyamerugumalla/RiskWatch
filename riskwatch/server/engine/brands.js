// Brand registry: the brand a check is run against. FreshKart is built in as the demo brand;
// analysts add their own, which are saved to data/custom-brands.json so they survive a restart.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brand as demoSource } from '../data/brand.js';
import { normalize } from './similarity.js';

export const DEMO_ID = 'freshkart';
const MAX_BRANDS = 30;
const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'custom-brands.json');

const DEMO = { ...demoSource, id: DEMO_ID, isDemo: true, aliases: [], tokens: [demoSource.token] };

const toList = (v) =>
  (Array.isArray(v) ? v : String(v ?? '').split(/[\n,;]+/)).map((s) => String(s).trim()).filter(Boolean);

function cleanHandle(h) {
  let s = h.trim();
  if (s.includes('/')) s = s.split('?')[0].split('/').filter(Boolean).pop() || '';
  return s.replace(/^@/, '').toLowerCase();
}
const cleanDomain = (d) => d.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0].trim();
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brand';

/** Validate and normalise brand details from the form. Throws an Error with a readable message. */
export function makeBrand(input, extra = {}) {
  const name = String(input?.name ?? '').trim().slice(0, 60);
  if (!name) throw new Error('Brand name is required.');
  const aliases = toList(input.aliases).map((a) => a.slice(0, 40)).slice(0, 10);
  const tokens = [...new Set([name, ...aliases].map((s) => normalize(s)).filter((t) => t.length >= 2))];
  if (!tokens.length) throw new Error('The brand name needs at least two letters.');

  const logoHash = /^[0-9a-f]{16}$/i.test(String(input.logoHash || '')) ? String(input.logoHash).toLowerCase() : '';
  const app = input.app || {};
  return {
    id: extra.id,
    isDemo: false,
    name,
    aliases,
    tokens,
    token: tokens[0],
    officialHandles: [...new Set(toList(input.officialHandles).map(cleanHandle).filter(Boolean))].slice(0, 30),
    officialDisplayNames: [name, ...aliases],
    officialDomains: [...new Set(toList(input.officialDomains).map(cleanDomain).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)))].slice(0, 20),
    officialPhones: [...new Set(toList(input.officialPhones).map((p) => p.replace(/\D/g, '')).filter((p) => p.length >= 8))].slice(0, 10),
    logoHash,
    officialApp: {
      package: String(app.package || '').trim().slice(0, 150),
      name: String(app.name || name).trim().slice(0, 100),
      developer: String(app.developer || '').trim().slice(0, 100),
      certSha256: String(app.certSha256 || '').trim().slice(0, 100),
      iconHash: logoHash,
      store: 'Google Play',
      permissions: toList(app.permissions).map((p) => p.toUpperCase()).slice(0, 40),
    },
  };
}

function load() {
  try {
    const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return saved.map((b) => makeBrand(b, { id: b.id })).slice(0, MAX_BRANDS);
  } catch {
    return []; // no file yet, or it is unreadable: start with the demo brand only
  }
}

let custom = load();

function save() {
  try {
    fs.writeFileSync(FILE, JSON.stringify(custom, null, 2));
  } catch (e) {
    console.warn('Could not save custom brands:', e.message);
  }
}

export const listBrands = () => [DEMO, ...custom];
export const getBrand = (id) => listBrands().find((b) => b.id === id);

export function addBrand(input) {
  if (custom.length >= MAX_BRANDS) throw new Error(`You can add up to ${MAX_BRANDS} brands. Remove one first.`);
  const base = slug(String(input?.name ?? ''));
  let id = base;
  for (let i = 2; getBrand(id); i++) id = `${base}-${i}`;
  const brand = makeBrand(input, { id });
  custom.push(brand);
  save();
  return brand;
}

export function removeBrand(id) {
  if (id === DEMO_ID) throw new Error('The demo brand cannot be removed.');
  const before = custom.length;
  custom = custom.filter((b) => b.id !== id);
  if (custom.length === before) return false;
  save();
  return true;
}

/** What the browser is allowed to see. */
export const publicBrand = (b) => ({
  id: b.id,
  name: b.name,
  isDemo: !!b.isDemo,
  aliases: b.aliases,
  tokens: b.tokens,
  officialHandles: b.officialHandles,
  officialDomains: b.officialDomains,
  officialPhones: b.officialPhones,
  hasLogo: !!b.logoHash,
  logoHash: b.logoHash,
  app: { package: b.officialApp.package, developer: b.officialApp.developer },
});
