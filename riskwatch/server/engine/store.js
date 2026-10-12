import { entities } from '../data/dataset.js';
import { analyze } from './analyze.js';
import { buildCampaigns } from './campaigns.js';
import { DEMO_ID, getBrand } from './brands.js';

// The built-in review queue, campaigns and accuracy screens always use the FreshKart demo data.
export function buildState() {
  const brand = getBrand(DEMO_ID);
  const analyses = entities.map((e) => analyze(e, brand)).sort((a, b) => b.score - a.score);
  const campaigns = buildCampaigns(analyses);
  const byId = new Map(analyses.map((a) => [a.id, a]));
  for (const c of campaigns) c.members.forEach((id) => (byId.get(id).campaignId = c.id));
  return { brand, analyses, campaigns, byId };
}
