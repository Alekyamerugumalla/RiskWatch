// Group flagged entities into scam campaigns using shared indicators
// (same APK link, same UPI id, same phone number, same file hash...) via union-find.
// This turns "15 separate fake accounts" into "3 operations", which is what a brand analyst needs.

const MIN_SCORE = 35; // only Medium+ entities can form campaigns

export function buildCampaigns(analyses) {
  const items = analyses.filter((a) => a.score >= MIN_SCORE && !a.official);
  const parent = new Map(items.map((a) => [a.id, a.id]));
  const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
  const union = (a, b) => parent.set(find(a), find(b));

  const byKey = new Map();
  for (const a of items) {
    for (const k of a.indicatorKeys) {
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(a.id);
    }
  }
  for (const ids of byKey.values()) for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);

  const groups = new Map();
  for (const a of items) {
    const r = find(a.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(a);
  }

  const campaigns = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue; // a campaign needs at least two linked assets
    const ids = new Set(members.map((m) => m.id));
    const shared = [];
    for (const [key, who] of byKey) {
      const inGroup = who.filter((id) => ids.has(id));
      if (inGroup.length >= 2) {
        const [type, ...rest] = key.split(':');
        shared.push({ type, value: rest.join(':'), entityIds: inGroup });
      }
    }
    campaigns.push({
      members: members.sort((a, b) => b.score - a.score).map((m) => m.id),
      sharedIndicators: shared,
      platforms: [...new Set(members.map((m) => (m.type === 'app' ? 'android app' : m.platform)))],
      riskScore: Math.max(...members.map((m) => m.score)),
      accounts: members.filter((m) => m.type === 'account').length,
      apps: members.filter((m) => m.type === 'app').length,
      theme: themeOf(members, shared),
    });
  }

  campaigns.sort((a, b) => b.riskScore - a.riskScore || b.members.length - a.members.length);
  campaigns.forEach((c, i) => {
    c.id = `camp-${i + 1}`;
    c.name = `Campaign ${i + 1} · ${c.theme}`;
  });
  return campaigns;
}

function themeOf(members, shared) {
  const text = members.map((m) => JSON.stringify(m.raw.recentPosts || m.raw.description || '') + (m.raw.bio || '')).join(' ').toLowerCase();
  const has = (k) => shared.some((s) => s.type === k);
  const apkLink = shared.some((s) => s.type === 'link' && s.value.endsWith('.apk'));
  if (apkLink || (has('hash') && /refund/.test(text))) return 'Fake refund + malicious APK';
  if (/kyc|wallet/.test(text) && has('upi')) return 'KYC / wallet UPI scam';
  if (/lucky|reward|work from home|registration fee/.test(text)) return 'Rewards & job-fee scam';
  if (has('upi')) return 'UPI collection scam';
  return 'Coordinated impersonation';
}

/** Which existing campaigns would this (ad-hoc checked) entity join? */
export function matchCampaigns(analysis, campaigns, byId) {
  const mine = new Set(analysis.indicatorKeys);
  return campaigns
    .map((c) => {
      // Compare against every member's indicators, not only the ones several members already share.
      const seen = new Map();
      for (const id of c.members) {
        for (const key of byId.get(id).indicatorKeys) {
          if (mine.has(key) && !seen.has(key)) {
            const [type, ...rest] = key.split(':');
            seen.set(key, { type, value: rest.join(':'), seenOn: byId.get(id).title });
          }
        }
      }
      return { id: c.id, name: c.name, shared: [...seen.values()] };
    })
    .filter((m) => m.shared.length);
}
