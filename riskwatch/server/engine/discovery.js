
const BLUESKY_API =
  'https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors';

const APPLE_SEARCH_API = 'https://itunes.apple.com/search';

// Clean text before using it as a search term.
function cleanText(value) {
  return String(value || '').trim();
}

// Remove duplicate results using a unique identifier.
function uniqueBy(items, keyFn) {
  const seen = new Set();

  return items.filter((item) => {
    const key = String(keyFn(item) || '').toLowerCase();

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

// Get the brand name and aliases to search for.
function getSearchTerms(brand) {
  const terms = [
    brand?.name,
    ...(Array.isArray(brand?.aliases) ? brand.aliases : []),
  ];

  return [
    ...new Set(terms.map(cleanText).filter(Boolean)),
  ].slice(0, 5);
}

// Fetch JSON from a public API with a timeout.
async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(
      `Discovery source returned HTTP ${response.status}`
    );
  }

  return response.json();
}

// Search public Bluesky profiles.
async function searchBluesky(term) {
  const url = new URL(BLUESKY_API);

  url.searchParams.set('q', term);
  url.searchParams.set('limit', '10');

  const data = await fetchJson(url);

  return (data.actors || []).map((actor) => ({
    type: 'account',
    platform: 'bluesky',
    handle: actor.handle || '',
    displayName: actor.displayName || '',
    bio: actor.description || '',
    link: actor.handle
      ? `https://bsky.app/profile/${actor.handle}`
      : '',
    followers: actor.followersCount,
    posts: actor.postsCount,
    source: 'Bluesky public API',
    sourceUrl: 'https://public.api.bsky.app',
    externalId: actor.did || actor.handle || '',
    discoveryStatus: 'candidate',
  }));
}

// Search Apple's public App Store Search API.
async function searchAppleApps(term) {
  const url = new URL(APPLE_SEARCH_API);

  url.searchParams.set('term', term);
  url.searchParams.set('entity', 'software');
  url.searchParams.set('country', 'in');
  url.searchParams.set('limit', '10');

  const data = await fetchJson(url);

  return (data.results || []).map((app) => ({
    type: 'app',
    platform: 'apple-app-store',
    name: app.trackName || '',
    packageName: app.bundleId || '',
    developer: app.sellerName || app.artistName || '',
    store: 'app-store',
    downloadUrl: app.trackViewUrl || '',
    description: app.description || '',
    source: 'Apple App Store Search API',
    sourceUrl: app.trackViewUrl || '',
    externalId: String(app.trackId || app.bundleId || ''),
    discoveryStatus: 'candidate',
  }));
}

/**
 * Discover possible brand-related social profiles and apps.
 * Discovery results are candidates only, not confirmed malicious entities.
 */
export async function discoverCandidates(brand, options = {}) {
  if (!brand?.id || !brand?.name) {
    throw new Error('Select a valid brand before discovery.');
  }

  const terms = getSearchTerms(brand);

  const requestedSources = Array.isArray(options.sources)
    ? options.sources
    : ['bluesky', 'apple'];

  const sources = [];

  if (requestedSources.includes('bluesky')) {
    sources.push({
      name: 'Bluesky',
      run: () => Promise.all(terms.map(searchBluesky)),
    });
  }

  if (requestedSources.includes('apple')) {
    sources.push({
      name: 'Apple App Store',
      run: () => Promise.all(terms.map(searchAppleApps)),
    });
  }

  // Run each source independently so one source can fail
  // without preventing results from the other source.
  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        const groups = await source.run();

        return {
          source: source.name,
          candidates: groups.flat(),
          error: null,
        };
      } catch (error) {
        return {
          source: source.name,
          candidates: [],
          error: error.message || 'Source request failed.',
        };
      }
    })
  );

  // Remove duplicate profiles and apps.
  const candidates = uniqueBy(
    results.flatMap((result) => result.candidates),
    (item) =>
      item.type === 'app'
        ? item.externalId || item.downloadUrl || item.name
        : item.externalId || item.handle
  );

  return {
    brandId: brand.id,
    brandName: brand.name,
    searchedTerms: terms,
    candidates,
    sources: results.map(
      ({ source, candidates: found, error }) => ({
        source,
        count: found.length,
        error,
      })
    ),
    message:
      'Discovered results are candidates and require risk analysis.',
  };
}
