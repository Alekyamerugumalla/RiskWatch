// Turn a loosely-typed request body (from the Check form) into a clean entity the engine can score.

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const HASH = /^[0-9a-f]{16}$/i;

export function toEntity(b, brand) {
  const type = b.type === 'app' ? 'app' : 'account';
  const uploaded = HASH.test(b.logoHash || '') ? b.logoHash.toLowerCase() : null;
  // FreshKart's demo logo is simulated, so its examples use a "copies the logo" tick box instead of an upload.
  let image = uploaded;
  if (!image && b.copiesLogo && brand.logoHash) image = brand.logoHash;
  if (!image && brand.demo && b.copiesLogo === false) image = 'ffffffffffffffff';

  if (type === 'account') {
    const handle = String(b.handle || '').trim().replace(/^@/, '');
    if (!handle) throw new Error('handle is required');
    return {
      id: 'adhoc', type, platform: String(b.platform || 'instagram').toLowerCase(), handle,
      displayName: String(b.displayName || handle), bio: String(b.bio || ''), verified: !!b.verified,
      createdDaysAgo: num(b.createdDaysAgo, 365), followers: num(b.followers, 0), following: num(b.following, 0),
      posts: num(b.posts, 0), logoHash: image, link: String(b.link || ''),
      recentPosts: (Array.isArray(b.recentPosts) ? b.recentPosts : []).map(String).filter(Boolean), label: 'unknown',
    };
  }
  const name = String(b.name || '').trim();
  if (!name) throw new Error('name is required');
  const perms = Array.isArray(b.permissions) ? b.permissions : String(b.permissions || '').split(',');
  return {
    id: 'adhoc', type, platform: 'android', name, packageName: String(b.packageName || 'unknown.app'),
    developer: String(b.developer || 'Unknown'), store: String(b.store || 'direct-download'), downloadUrl: String(b.downloadUrl || ''),
    certSha256: String(b.certSha256 || ''), iconHash: image, permissions: perms.map((p) => p.trim()).filter(Boolean),
    description: String(b.description || ''), label: 'unknown',
  };
}
