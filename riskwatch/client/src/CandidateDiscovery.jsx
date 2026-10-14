
import React, { useMemo, useState } from 'react';
import { api } from './api.js';

const SUSPICIOUS_TERMS = [
  'refund',
  'rewards',
  'reward',
  'support',
  'verify',
  'verification',
  'claim',
  'bonus',
  'wallet',
  'kyc',
  'airdrop',
  'giveaway',
  'customer care',
  'helpdesk',
  'official support',
  'free money',
];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/0/g, 'o')
    .replace(/1/g, 'l')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/[^a-z0-9]/g, '');
}

function editDistance(a, b) {
  const previous = Array.from(
    { length: b.length + 1 },
    (_, index) => index
  );

  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const oldValue = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + cost
      );

      diagonal = oldValue;
    }
  }

  return previous[b.length];
}

function similarity(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);

  if (!left || !right) return 0;
  if (left === right) return 1;

  return (
    1 -
    editDistance(left, right) / Math.max(left.length, right.length)
  );
}

function candidateText(candidate) {
  return [
    candidate.handle,
    candidate.displayName,
    candidate.name,
    candidate.packageName,
    candidate.developer,
    candidate.bio,
    candidate.description,
  ]
    .filter(Boolean)
    .join(' ');
}

function getOfficialStatus(candidate, brand) {
  const isApp = candidate.type === 'app';
  const identifier = isApp
    ? candidate.packageName
    : candidate.handle;

  if (!identifier) return false;

  const normalizedIdentifier = String(identifier)
    .trim()
    .replace(/^@/, '')
    .toLowerCase();

  // Check the brand's registered official social handles.
  if (
    !isApp &&
    (brand.officialHandles || []).some(
      (handle) =>
        String(handle).trim().replace(/^@/, '').toLowerCase() ===
        normalizedIdentifier
    )
  ) {
    return true;
  }

  // Check the registered official application package.
  if (
    isApp &&
    brand.app?.package &&
    String(brand.app.package).trim().toLowerCase() ===
      normalizedIdentifier
  ) {
    return true;
  }

  // Only verified asset records count as verified assets.
  return (brand.assets || []).some((asset) => {
    if (asset.verificationStatus !== 'verified') return false;

    const expectedType = isApp ? 'app' : 'social';

    if (asset.type !== expectedType) return false;

    const registeredIdentifier = String(asset.identifier || '')
      .trim()
      .replace(/^@/, '')
      .toLowerCase();

    if (registeredIdentifier !== normalizedIdentifier) return false;

    const platform = String(asset.platform || '').toLowerCase();

    if (isApp) {
      return (
        platform.includes('apple') ||
        platform.includes('app store') ||
        platform.includes('ios') ||
        platform.includes('google') ||
        platform.includes('play')
      );
    }

    return (
      !platform ||
      platform === String(candidate.platform || '').toLowerCase() ||
      (platform.includes('bluesky') &&
        candidate.platform === 'bluesky')
    );
  });
}


function rankCandidate(candidate, brand) {
  const isApp = candidate.type === 'app';

  const title = isApp
    ? candidate.name || ''
    : candidate.displayName || '';

  const handle = isApp
    ? candidate.packageName || ''
    : candidate.handle || '';

  const brandNames = [
    brand.name,
    ...(brand.aliases || []),
    ...(brand.officialDisplayNames || []),
  ].filter(Boolean);

  const normalizedBrandName = normalizeText(brand.name);
  const normalizedTitle = normalizeText(title);
  const normalizedHandle = normalizeText(handle);

  const namesToCompare = [title, handle].filter(Boolean);

  let bestSimilarity = 0;

  for (const name of namesToCompare) {
    for (const brandName of brandNames) {
      bestSimilarity = Math.max(
        bestSimilarity,
        similarity(name, brandName)
      );
    }
  }

  const exactNormalizedMatch = namesToCompare.some((name) =>
    brandNames.some(
      (brandName) =>
        normalizeText(name) === normalizeText(brandName)
    )
  );

  const combinedText = candidateText(candidate).toLowerCase();

  const matchedTerms = SUSPICIOUS_TERMS.filter((term) =>
    combinedText.includes(term)
  );

  // A package name can contain a brand word without being related.
  // Check whether the brand appears as a distinct token in the title.
  const titleTokens = String(title)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const normalizedBrandTokens = String(brand.name)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const titleContainsBrand =
    normalizedBrandName.length >= 4 &&
    (
      normalizedTitle.includes(normalizedBrandName) ||
      normalizedBrandTokens.every((token) =>
        titleTokens.includes(token)
      )
    );

  const handleContainsBrand =
    normalizedBrandName.length >= 4 &&
    normalizedHandle.includes(normalizedBrandName);

  let score = 0;
  const reasons = [];

  // Strongest signal: the actual display name matches the brand.
  const titleSimilarity = brandNames.reduce(
    (best, brandName) =>
      Math.max(best, similarity(title, brandName)),
    0
  );

  
if (titleSimilarity >= 0.95) {
  score += isApp ? 20 : 40;
  reasons.push('Very close brand-name match');
} else if (titleSimilarity >= 0.8) {
  score += isApp ? 15 : 30;
  reasons.push('Similar brand name');
} else if (titleSimilarity >= 0.6) {
  score += 15;
  reasons.push('Possible brand-name variation');
}


  // Handle/package similarity is supporting evidence, not proof.
  const handleSimilarity = brandNames.reduce(
    (best, brandName) =>
      Math.max(best, similarity(handle, brandName)),
    0
  );

  if (handleSimilarity >= 0.9 && !exactNormalizedMatch) {
    score += 15;
    reasons.push('Handle or package resembles a brand identifier');
  }

  if (
    !exactNormalizedMatch &&
    (handleContainsBrand || titleContainsBrand)
  ) {
    score += 10;
    reasons.push('Brand name appears in the candidate identifier');
  }

  // Keywords are weak signals. Do not let them alone create a
  // high-priority result when the candidate name is unrelated.
  if (matchedTerms.length > 0 && titleSimilarity >= 0.6) {
    score += Math.min(15, matchedTerms.length * 5);
    reasons.push(
      `Review wording: ${matchedTerms.slice(0, 4).join(', ')}`
    );
  }

  // Developer mismatch is only useful when the app name is relevant.
  if (
    isApp &&
    titleSimilarity >= 0.6 &&
    brand.app?.developer &&
    candidate.developer &&
    candidate.developer.trim().toLowerCase() !==
      brand.app.developer.trim().toLowerCase()
  ) {
    score += 10;
    reasons.push(
      'Developer differs from the registered app developer'
    );
  }

  score = Math.min(100, score);

  const official = getOfficialStatus(candidate, brand);

  return {
    score: official ? 0 : score,
    official,
    reasons: official
      ? ['Matches a registered official identifier']
      : reasons.length
        ? reasons
        : ['No strong brand-impersonation signals found'],
    matchedTerms,
    similarity: bestSimilarity,
  };
}


// Keep this function outside rankCandidate.
function classifyCandidate(ranking) {
  if (ranking.official) {
    return {
      label: 'Registered Official',
      color: '#15803d',
    };
  }

  if (ranking.score >= 60) {
    return {
      label: 'High Priority',
      color: '#dc2626',
    };
  }

  if (ranking.score >= 20) {
    return {
      label: 'Needs Review',
      color: '#b45309',
    };
  }

  return {
    label: 'Likely Unrelated',
    color: '#64748b',
  };
}

export default function CandidateDiscovery({ brand }) {
  const [sources, setSources] = useState(['bluesky', 'apple']);
  const [candidates, setCandidates] = useState([]);
  const [sourceResults, setSourceResults] = useState([]);
  const [searchedTerms, setSearchedTerms] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [analysisResults, setAnalysisResults] = useState({});
  const [analyzing, setAnalyzing] = useState({});
  const [priorityOnly, setPriorityOnly] = useState(false);

  function toggleSource(source) {
    setSources((current) =>
      current.includes(source)
        ? current.filter((item) => item !== source)
        : [...current, source]
    );
  }

  async function discover() {
    if (!brand?.id) {
      setError('Select a brand before starting discovery.');
      return;
    }

    if (sources.length === 0) {
      setError('Select at least one discovery source.');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');
    setCandidates([]);
    setSourceResults([]);
    setSearchedTerms([]);
    setAnalysisResults({});
    setAnalyzing({});

    try {
      const result = await api.discoverCandidates(
        brand.id,
        sources
      );

      setCandidates(result.candidates || []);
      setSourceResults(result.sources || []);
      setSearchedTerms(result.searchedTerms || []);

      setMessage(
        result.candidates?.length
          ? `Discovery completed. Found ${result.candidates.length} candidates to review.`
          : 'Discovery completed, but no candidates were returned.'
      );
    } catch (err) {
      setError(err.message || 'Unable to discover candidates.');
    } finally {
      setBusy(false);
    }
  }

  function candidateKey(candidate) {
    return [
      candidate.type,
      candidate.platform,
      candidate.externalId ||
        candidate.handle ||
        candidate.packageName ||
        candidate.name ||
        '',
    ].join(':');
  }

  async function analyzeCandidate(candidate) {
    const key = candidateKey(candidate);

    setAnalyzing((current) => ({
      ...current,
      [key]: true,
    }));

    setError('');

    try {
      let body;

      if (candidate.type === 'account') {
        body = {
          brandId: brand.id,
          type: 'account',
          platform: candidate.platform || 'bluesky',
          handle: candidate.handle || '',
          displayName:
            candidate.displayName || candidate.handle || '',
          bio: candidate.bio || '',
          link: candidate.link || '',
          followers: candidate.followers,
          posts: candidate.posts,
          recentPosts: candidate.bio ? [candidate.bio] : [],
          verified: false,
        };
      } else {
        body = {
          brandId: brand.id,
          type: 'app',
          name: candidate.name || '',
          packageName: candidate.packageName || '',
          developer: candidate.developer || '',
          store:
            candidate.platform === 'apple-app-store'
              ? 'app-store'
              : 'direct-download',
          downloadUrl: candidate.downloadUrl || '',
          description: candidate.description || '',
          permissions: [],
        };
      }

      const result = await api.check(body);

      setAnalysisResults((current) => ({
        ...current,
        [key]: result,
      }));
    } catch (err) {
      setError(
        `Analysis failed for ${
          candidate.displayName ||
          candidate.name ||
          candidate.handle ||
          'candidate'
        }: ${err.message || 'Unknown error.'}`
      );
    } finally {
      setAnalyzing((current) => ({
        ...current,
        [key]: false,
      }));
    }
  }

  const rankedCandidates = useMemo(() => {
    return candidates
      .map((candidate, originalIndex) => ({
        candidate,
        originalIndex,
        ranking: rankCandidate(candidate, brand),
      }))
      .sort((a, b) => {
        if (a.ranking.official !== b.ranking.official) {
          return a.ranking.official ? 1 : -1;
        }

        return (
          b.ranking.score - a.ranking.score ||
          a.originalIndex - b.originalIndex
        );
      });
  }, [candidates, brand]);

  // The filter includes High Priority and Needs Review candidates.
  const visibleCandidates = priorityOnly
    ? rankedCandidates.filter(
        ({ ranking }) =>
          !ranking.official && ranking.score >= 20
      )
    : rankedCandidates;

  if (!brand) return null;

  const highPriorityCount = rankedCandidates.filter(
    ({ ranking }) => !ranking.official && ranking.score >= 60
  ).length;

  const needsReviewCount = rankedCandidates.filter(
    ({ ranking }) =>
      !ranking.official &&
      ranking.score >= 20 &&
      ranking.score < 60
  ).length;

  const unrelatedCount = rankedCandidates.filter(
    ({ ranking }) =>
      !ranking.official && ranking.score < 20
  ).length;

  const officialCount = rankedCandidates.filter(
    ({ ranking }) => ranking.official
  ).length;

  return (
    <section className="panel" style={{ marginTop: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, marginBottom: 6 }}>
          Automated Discovery
        </h2>

        <p
          style={{
            margin: 0,
            color: 'var(--muted, #64748b)',
          }}
        >
          Search public sources for accounts and apps related to{' '}
          <strong>{brand.name}</strong>, then review and analyze
          candidates.
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <input
            type="checkbox"
            checked={sources.includes('bluesky')}
            onChange={() => toggleSource('bluesky')}
          />
          Bluesky accounts
        </label>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <input
            type="checkbox"
            checked={sources.includes('apple')}
            onChange={() => toggleSource('apple')}
          />
          Apple App Store
        </label>
      </div>

      <button
        type="button"
        onClick={discover}
        disabled={busy || sources.length === 0}
      >
        {busy ? 'Discovering candidates…' : 'Discover Candidates'}
      </button>

      {error && (
        <p
          role="alert"
          style={{ color: '#dc2626', marginTop: 12 }}
        >
          {error}
        </p>
      )}

      {message && (
        <p role="status" style={{ marginTop: 12 }}>
          {message}
        </p>
      )}

      {searchedTerms.length > 0 && (
        <p
          style={{
            fontSize: 13,
            color: 'var(--muted, #64748b)',
          }}
        >
          Search terms: {searchedTerms.join(', ')}
        </p>
      )}

      {sourceResults.length > 0 && (
        <div style={{ marginTop: 12, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15 }}>Source status</h3>

          {sourceResults.map((source, index) => (
            <div
              key={`${source.source}-${index}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 6,
              }}
            >
              <span>{source.source}</span>

              <span>
                {source.error
                  ? `Unavailable: ${source.error}`
                  : `${source.count} candidates`}
              </span>
            </div>
          ))}
        </div>
      )}

      {candidates.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3>Ranked candidates ({candidates.length})</h3>

          <p
            style={{
              fontSize: 13,
              color: 'var(--muted, #64748b)',
            }}
          >
            These categories help prioritize reviews. They are not
            the backend risk score and do not prove impersonation.
          </p>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 16,
            }}
          >
            <span style={{ color: '#dc2626', fontSize: 13 }}>
              High Priority: {highPriorityCount}
            </span>

            <span style={{ color: '#b45309', fontSize: 13 }}>
              Needs Review: {needsReviewCount}
            </span>

            <span style={{ color: '#64748b', fontSize: 13 }}>
              Likely Unrelated: {unrelatedCount}
            </span>

            <span style={{ color: '#15803d', fontSize: 13 }}>
              Registered Official: {officialCount}
            </span>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 16,
            }}
          >
            <input
              type="checkbox"
              checked={priorityOnly}
              onChange={(event) =>
                setPriorityOnly(event.target.checked)
              }
            />
            Show only higher-priority candidates
          </label>

          <div style={{ display: 'grid', gap: 12 }}>
            {visibleCandidates.map(({ candidate, ranking }) => {
              const key = candidateKey(candidate);
              const result = analysisResults[key];
              const isApp = candidate.type === 'app';

              // Correctly finish the title expression before declaring
              // the classification variable.
              const title = isApp
                ? candidate.name || 'Unnamed app'
                : candidate.displayName ||
                  candidate.handle ||
                  'Unnamed account';

              const classification = classifyCandidate(ranking);

              const sourceUrl = isApp
                ? candidate.downloadUrl
                : candidate.link;

              return (
                <article
                  key={key}
                  style={{
                    border: '1px solid var(--border, #e2e8f0)',
                    borderRadius: 10,
                    padding: 14,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                        flex: '1 1 220px',
                      }}
                    >
                      <strong>{title}</strong>

                      <div
                        style={{
                          fontSize: 13,
                          color: 'var(--muted, #64748b)',
                          marginTop: 5,
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {isApp
                          ? `App · ${
                              candidate.developer ||
                              'Developer unknown'
                            }`
                          : `@${
                              candidate.handle || 'unknown handle'
                            } · ${
                              candidate.platform || 'social platform'
                            }`}
                      </div>

                      {isApp && candidate.packageName && (
                        <div
                          style={{
                            fontSize: 13,
                            marginTop: 4,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          Package: {candidate.packageName}
                        </div>
                      )}

                      {(candidate.bio || candidate.description) && (
                        <p
                          style={{
                            fontSize: 13,
                            marginTop: 8,
                            marginBottom: 8,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {candidate.bio || candidate.description}
                        </p>
                      )}

                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--muted, #64748b)',
                        }}
                      >
                        Source:{' '}
                        {candidate.source || candidate.platform}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: 8,
                          marginTop: 10,
                        }}
                      >
                        <strong>
                          Relevance: {ranking.score}/100
                        </strong>

                        <span
                          style={{
                            color: classification.color,
                            fontWeight: 600,
                            fontSize: 13,
                          }}
                        >
                          {classification.label}
                        </span>
                      </div>

                      <ul
                        style={{
                          fontSize: 13,
                          paddingLeft: 20,
                        }}
                      >
                        {ranking.reasons.map((reason, index) => (
                          <li key={`${key}-ranking-${index}`}>
                            {reason}
                          </li>
                        ))}
                      </ul>

                      {sourceUrl && (
                        <p
                          style={{
                            marginBottom: 0,
                            marginTop: 8,
                          }}
                        >
                          <a
                            href={sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open original listing
                          </a>
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={
                        !!analyzing[key] || ranking.official
                      }
                      onClick={() => analyzeCandidate(candidate)}
                      title={
                        ranking.official
                          ? 'This identifier matches a registered official asset.'
                          : 'Run the existing RiskWatch analysis.'
                      }
                    >
                      {ranking.official
                        ? 'Registered official'
                        : analyzing[key]
                          ? 'Analyzing…'
                          : result
                            ? 'Analyze Again'
                            : 'Analyze'}
                    </button>
                  </div>

                  {result && (
                    <div
                      style={{
                        borderTop:
                          '1px solid var(--border, #e2e8f0)',
                        marginTop: 12,
                        paddingTop: 12,
                      }}
                    >
                      <strong>
                        Risk score: {result.score ?? 'Unavailable'}
                        {result.level ? ` · ${result.level}` : ''}
                      </strong>

                      {result.official && (
                        <p style={{ marginBottom: 0 }}>
                          The existing risk engine marked this result
                          as official.
                        </p>
                      )}

                      {result.summary && (
                        <p style={{ marginBottom: 0 }}>
                          {result.summary}
                        </p>
                      )}

                      {result.reasons?.length > 0 && (
                        <ul>
                          {result.reasons.map((reason, index) => (
                            <li key={`${key}-result-${index}`}>
                              {typeof reason === 'string'
                                ? reason
                                : reason.description ||
                                  reason.label ||
                                  JSON.stringify(reason)}
                            </li>
                          ))}
                        </ul>
                      )}

                      <p
                        style={{
                          fontSize: 12,
                          color: 'var(--muted, #64748b)',
                          marginBottom: 0,
                        }}
                      >
                        Review the evidence before classifying this
                        account or app as impersonation.
                      </p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {visibleCandidates.length === 0 && (
            <p>
              No candidates meet the current relevance threshold.
              Turn off the filter to review all discovered results.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
