
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { brand as demoSource } from '../data/brand.js';
import { normalize } from './similarity.js';

export const DEMO_ID = 'freshkart';
const MAX_BRANDS = 30;
const MAX_ASSETS_PER_BRAND = 100;

const FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'custom-brands.json'
);

const DEMO = {
  ...demoSource,
  id: DEMO_ID,
  isDemo: true,
  aliases: [],
  tokens: [demoSource.token],
};

const toList = (value) =>
  (Array.isArray(value) ? value : String(value ?? '').split(/[\n,;]+/))
    .map((item) => String(item).trim())
    .filter(Boolean);

function cleanHandle(handle) {
  let value = String(handle ?? '').trim();

  if (value.includes('/')) {
    value = value.split('?')[0].split('/').filter(Boolean).pop() || '';
  }

  return value.replace(/^@/, '').toLowerCase();
}

const cleanDomain = (domain) =>
  String(domain ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
    .trim();

const slug = (value) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
  'brand';

const ASSET_TYPES = ['social', 'app'];
const VERIFICATION_STATUSES = ['unverified', 'pending', 'verified'];

function normalizeAsset(input = {}, existing = {}) {
  const type = String(input.type ?? existing.type ?? '').toLowerCase();
  if (!ASSET_TYPES.includes(type)) {
    throw new Error('Asset type must be social or app.');
  }

  const platform = String(input.platform ?? existing.platform ?? '')
    .trim()
    .slice(0, 60);

  const identifier = String(input.identifier ?? existing.identifier ?? '')
    .trim()
    .slice(0, 200);

  if (!platform) throw new Error('Asset platform is required.');
  if (!identifier) throw new Error('Asset identifier is required.');

  const verificationStatus = String(
    input.verificationStatus ?? existing.verificationStatus ?? 'unverified'
  ).toLowerCase();

  if (!VERIFICATION_STATUSES.includes(verificationStatus)) {
    throw new Error(
      'Verification status must be unverified, pending, or verified.'
    );
  }

  const sourceUrl = String(input.sourceUrl ?? existing.sourceUrl ?? '').trim();

  if (
    sourceUrl &&
    !/^https?:\/\/\S+$/i.test(sourceUrl)
  ) {
    throw new Error('Source URL must start with http:// or https://.');
  }

  let lastVerifiedAt =
    input.lastVerifiedAt ?? existing.lastVerifiedAt ?? null;

  if (verificationStatus === 'verified' && !lastVerifiedAt) {
    lastVerifiedAt = new Date().toISOString();
  }

  if (verificationStatus !== 'verified') {
    lastVerifiedAt = null;
  }

  return {
    id: existing.id || input.id || randomUUID(),
    type,
    platform,
    identifier,
    sourceUrl: sourceUrl.slice(0, 500),
    verificationStatus,
    evidenceNote: String(
      input.evidenceNote ?? existing.evidenceNote ?? ''
    ).trim().slice(0, 1000),
    lastVerifiedAt,
  };
}

/** Validate and normalize a brand profile. */
export function makeBrand(input, extra = {}) {
  const name = String(input?.name ?? '').trim().slice(0, 60);
  if (!name) throw new Error('Brand name is required.');

  const aliases = toList(input.aliases)
    .map((alias) => alias.slice(0, 40))
    .slice(0, 10);

  const tokens = [
    ...new Set(
      [name, ...aliases]
        .map((value) => normalize(value))
        .filter((token) => token.length >= 2)
    ),
  ];

  if (!tokens.length) {
    throw new Error('The brand name needs at least two letters.');
  }

  const logoHash = /^[0-9a-f]{16}$/i.test(String(input.logoHash || ''))
    ? String(input.logoHash).toLowerCase()
    : '';

  const app = input.app || {};
  const rawAssets = Array.isArray(input.assets) ? input.assets : [];

  const assets = rawAssets
    .slice(0, MAX_ASSETS_PER_BRAND)
    .map((asset) => normalizeAsset(asset));

  return {
    id: extra.id,
    isDemo: false,
    name,
    aliases,
    tokens,
    token: tokens[0],

    // Keep these legacy fields for the existing detection engine.
    officialHandles: [
      ...new Set(toList(input.officialHandles).map(cleanHandle).filter(Boolean)),
    ].slice(0, 30),

    officialDisplayNames: [name, ...aliases],

    officialDomains: [
      ...new Set(
        toList(input.officialDomains)
          .map(cleanDomain)
          .filter((domain) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain))
      ),
    ].slice(0, 20),

    officialPhones: [
      ...new Set(
        toList(input.officialPhones)
          .map((phone) => phone.replace(/\D/g, ''))
          .filter((phone) => phone.length >= 8)
      ),
    ].slice(0, 10),

    logoHash,

    officialApp: {
      package: String(app.package || '').trim().slice(0, 150),
      name: String(app.name || name).trim().slice(0, 100),
      developer: String(app.developer || '').trim().slice(0, 100),
      certSha256: String(app.certSha256 || '').trim().slice(0, 100),
      iconHash: String(app.iconHash || logoHash).trim().slice(0, 100),
      store: String(app.store || 'Google Play').trim().slice(0, 60),
      permissions: toList(app.permissions)
        .map((permission) => permission.toUpperCase())
        .slice(0, 40),
    },

    // New asset records are stored separately from legacy trusted fields.
    assets,
  };
}

function load() {
  try {
    const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));

    if (!Array.isArray(saved)) return [];

    return saved
      .map((savedBrand) => makeBrand(savedBrand, { id: savedBrand.id }))
      .slice(0, MAX_BRANDS);
  } catch {
    // If the file is absent or unreadable, start with no custom brands.
    return [];
  }
}

let custom = load();

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(custom, null, 2));
  } catch (error) {
    console.warn('Could not save custom brands:', error.message);
    throw new Error('Could not save brand data. Check file permissions.');
  }
}

export const listBrands = () => [DEMO, ...custom];

export const getBrand = (id) => listBrands().find((brand) => brand.id === id);

export function addBrand(input) {
  if (custom.length >= MAX_BRANDS) {
    throw new Error(`You can add up to ${MAX_BRANDS} brands. Remove one first.`);
  }

  const base = slug(String(input?.name ?? ''));
  let id = base;

  for (let number = 2; getBrand(id); number++) {
    id = `${base}-${number}`;
  }

  const newBrand = makeBrand(input, { id });
  custom.push(newBrand);

  try {
    save();
  } catch (error) {
    custom = custom.filter((brand) => brand.id !== id);
    throw error;
  }

  return newBrand;
}

export function removeBrand(id) {
  if (id === DEMO_ID) {
    throw new Error('The demo brand cannot be removed.');
  }

  const before = custom;
  custom = custom.filter((brand) => brand.id !== id);

  if (custom.length === before.length) return false;

  try {
    save();
  } catch (error) {
    custom = before;
    throw error;
  }

  return true;
}

export function listBrandAssets(brandId) {
  const brand = getBrand(brandId);
  if (!brand) throw new Error('Brand not found.');

  return brand.assets || [];
}

export function addBrandAsset(brandId, input) {
  const brand = custom.find((item) => item.id === brandId);

  if (!brand) {
    throw new Error('Custom brand not found. The demo brand cannot be edited here.');
  }

  if (brand.assets.length >= MAX_ASSETS_PER_BRAND) {
    throw new Error(`A brand can have up to ${MAX_ASSETS_PER_BRAND} asset records.`);
  }

  const asset = normalizeAsset(input);

  const duplicate = brand.assets.some(
    (item) =>
      item.type === asset.type &&
      item.platform.toLowerCase() === asset.platform.toLowerCase() &&
      item.identifier.toLowerCase() === asset.identifier.toLowerCase()
  );

  if (duplicate) {
    throw new Error('This asset is already registered for the brand.');
  }

  brand.assets.push(asset);

  try {
    save();
  } catch (error) {
    brand.assets = brand.assets.filter((item) => item.id !== asset.id);
    throw error;
  }

  return asset;
}

export function updateBrandAsset(brandId, assetId, input) {
  const brand = custom.find((item) => item.id === brandId);

  if (!brand) {
    throw new Error('Custom brand not found. The demo brand cannot be edited here.');
  }

  const index = brand.assets.findIndex((item) => item.id === assetId);
  if (index === -1) throw new Error('Asset not found.');

  const previous = brand.assets[index];
  const updated = normalizeAsset(input, previous);

  const duplicate = brand.assets.some(
    (item, itemIndex) =>
      itemIndex !== index &&
      item.type === updated.type &&
      item.platform.toLowerCase() === updated.platform.toLowerCase() &&
      item.identifier.toLowerCase() === updated.identifier.toLowerCase()
  );

  if (duplicate) {
    throw new Error('This asset is already registered for the brand.');
  }

  brand.assets[index] = updated;

  try {
    save();
  } catch (error) {
    brand.assets[index] = previous;
    throw error;
  }

  return updated;
}

export function removeBrandAsset(brandId, assetId) {
  const brand = custom.find((item) => item.id === brandId);

  if (!brand) {
    throw new Error('Custom brand not found. The demo brand cannot be edited here.');
  }

  const index = brand.assets.findIndex((item) => item.id === assetId);
  if (index === -1) return false;

  const [removed] = brand.assets.splice(index, 1);

  try {
    save();
  } catch (error) {
    brand.assets.splice(index, 0, removed);
    throw error;
  }

  return true;
}

/** Return only the brand fields needed by the browser. */
export const publicBrand = (brand) => ({
  id: brand.id,
  name: brand.name,
  isDemo: !!brand.isDemo,
  aliases: brand.aliases || [],
  tokens: brand.tokens || [],
  officialHandles: brand.officialHandles || [],
  officialDomains: brand.officialDomains || [],
  officialPhones: brand.officialPhones || [],
  hasLogo: !!brand.logoHash,
  logoHash: brand.logoHash || '',
  app: {
    package: brand.officialApp?.package || '',
    developer: brand.officialApp?.developer || '',
  },
  assets: (brand.assets || []).map((asset) => ({ ...asset })),
});
