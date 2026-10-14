
import React, { useState } from 'react';
import { api } from './api.js';

const MAX_ROWS = 100;

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"' && quoted && text[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some((value) => value !== '')) rows.push(row);

  if (quoted) throw new Error('CSV has an unclosed quotation mark.');
  if (rows.length < 2) {
    throw new Error('Add a header row and at least one candidate.');
  }

  const headers = rows[0].map((h) =>
    h.trim().replace(/^\uFEFF/, '').toLowerCase()
  );

  return rows.slice(1).map((values) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = values[index] || '';
    });
    return item;
  });
}

function numberOrUndefined(value) {
  if (value === undefined || value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function truthy(value) {
  return ['true', 'yes', '1'].includes(
    String(value || '').trim().toLowerCase()
  );
}

function candidateBody(item, brandId) {
  const type = (item.type || 'account').toLowerCase();
  const common = { brandId };

  if (['account', 'social', 'social account'].includes(type)) {
    if (!item.handle) throw new Error('Missing handle.');

    const body = {
      ...common,
      type: 'account',
      platform: item.platform || 'instagram',
      handle: item.handle,
      displayName: item.displayname || '',
      bio: item.bio || '',
      link: item.link || item.linkinbio || '',
      recentPosts: [item.post || item.recentpost || ''],
      verified: truthy(item.verified),
    };

    const age = numberOrUndefined(item.createddaysago);
    const posts = numberOrUndefined(item.posts);
    const followers = numberOrUndefined(item.followers);
    const following = numberOrUndefined(item.following);

    if (age !== undefined) body.createdDaysAgo = age;
    if (posts !== undefined) body.posts = posts;
    if (followers !== undefined) body.followers = followers;
    if (following !== undefined) body.following = following;

    return body;
  }

  if (['app', 'mobile app', 'mobile'].includes(type)) {
    if (!item.name) throw new Error('Missing app name.');

    return {
      ...common,
      type: 'app',
      name: item.name,
      packageName: item.packagename || '',
      developer: item.developer || '',
      store: item.store || 'direct-download',
      downloadUrl: item.downloadurl || '',
      permissions: (item.permissions || '')
        .split(/[;,]/)
        .map((permission) => permission.trim())
        .filter(Boolean),
      description: item.description || '',
    };
  }

  throw new Error('Type must be account or app.');
}

export default function CandidateImport({ brand }) {
  const [file, setFile] = useState(null);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  async function importCandidates(event) {
    event.preventDefault();
    if (!file || !brand?.id) return;

    setBusy(true);
    setError('');
    setResults([]);
    setProgress('Reading CSV...');

    try {
      const candidates = parseCSV(await file.text());

      if (candidates.length > MAX_ROWS) {
        throw new Error(
          `This first version accepts up to ${MAX_ROWS} candidates per file.`
        );
      }

      const completed = [];

      for (let index = 0; index < candidates.length; index++) {
        const item = candidates[index];
        const label =
          item.handle || item.name || `CSV row ${index + 2}`;

        setProgress(
          `Checking candidate ${index + 1} of ${candidates.length}...`
        );

        try {
          const body = candidateBody(item, brand.id);
          const result = await api.check(body);

          completed.push({
            label,
            type: body.type,
            ok: true,
            score:
              result.score ??
              result.riskScore ??
              result.risk?.score ??
              null,
            result,
          });
        } catch (err) {
          completed.push({
            label,
            type: item.type || 'unknown',
            ok: false,
            error: err.message || 'Candidate check failed.',
          });
        }

        setResults([...completed]);
      }

      const failed = completed.filter((item) => !item.ok).length;
      setProgress(
        `Finished: ${completed.length - failed} checked, ${failed} failed.`
      );
    } catch (err) {
      setError(err.message || 'Could not import this CSV.');
      setProgress('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" style={{ marginTop: 20 }}>
      <h2>Import Candidates</h2>
      <p className="hint">
        Import candidate social accounts and mobile apps from a CSV file.
        Each valid row is sent to RiskWatch's existing checker for the
        selected brand: {brand?.name || 'No brand selected'}.
      </p>

      <p className="hint">
        This imports supplied data; it does not automatically search
        social platforms or app stores.
      </p>

      <form className="f" onSubmit={importCandidates}>
        <label>
          Candidate CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setResults([]);
              setError('');
              setProgress('');
            }}
          />
        </label>

        <button
          className="btn primary"
          type="submit"
          disabled={!file || busy || !brand?.id}
          style={{ justifySelf: 'start' }}
        >
          {busy ? 'Importing...' : 'Import and check candidates'}
        </button>
      </form>

      {error && <p className="gate" role="alert">{error}</p>}
      {progress && <p role="status">{progress}</p>}

      {results.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 14 }}>
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Type</th>
                <th>Result</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {results.map((item, index) => (
                <tr key={`${item.label}-${index}`}>
                  <td>{item.label}</td>
                  <td>{item.type}</td>
                  <td>
                    {item.ok ? 'Checked' : `Failed: ${item.error}`}
                  </td>
                  <td>
                    {item.ok
                      ? item.score ?? 'See detection result'
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
