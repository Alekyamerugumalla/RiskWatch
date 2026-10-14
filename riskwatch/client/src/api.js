
async function req(path, options) {
  const res = await fetch(`/api${path}`, options);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }

  return res.json();
}

const json = (method, body) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  stats: () => req('/stats'),
  brand: () => req('/brand'),
  brands: () => req('/brands'),
  addBrand: (body) => req('/brands', json('POST', body)),
  deleteBrand: (id) => req(`/brands/${id}`, { method: 'DELETE' }),
  clearHistory: (id) => req(`/brands/${id}/history`, { method: 'DELETE' }),

  // Brand asset management
  brandAssets: (brandId) => req(`/brands/${encodeURIComponent(brandId)}/assets`),

  addBrandAsset: (brandId, body) =>
    req(`/brands/${encodeURIComponent(brandId)}/assets`, json('POST', body)),

  updateBrandAsset: (brandId, assetId, body) =>
    req(
      `/brands/${encodeURIComponent(brandId)}/assets/${encodeURIComponent(assetId)}`,
      json('PATCH', body)
    ),

  deleteBrandAsset: (brandId, assetId) =>
    req(
      `/brands/${encodeURIComponent(brandId)}/assets/${encodeURIComponent(assetId)}`,
      { method: 'DELETE' }
    ),

  entities: () => req('/entities'),
  entity: (id) => req(`/entities/${id}`),
  campaigns: () => req('/campaigns'),
  evaluation: () => req('/eval'),
  takedownEntity: (id) => req(`/takedown/entity/${id}`),
  takedownCampaign: (id) => req(`/takedown/campaign/${id}`),
  decide: (id, decision) => req(`/entities/${id}/decision`, json('POST', { decision })),
  check: (body) => req('/check', json('POST', body)),
  
  discoverCandidates: (brandId, sources = ['bluesky', 'apple']) =>
    req(
      `/brands/${encodeURIComponent(brandId)}/discover`,
      json('POST', { sources })
    ),

  checkUrl: (url) => req('/check-url', json('POST', { url })),
};
