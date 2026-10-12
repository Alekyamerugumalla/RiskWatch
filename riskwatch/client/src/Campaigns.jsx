import React, { useState } from 'react';
import { api } from './api.js';

// Hub-and-spoke graph: shared indicators sit in the middle, the assets that use them ring the outside.
function Graph({ campaign }) {
  const W = 480, H = 330, cx = W / 2, cy = H / 2;
  const members = campaign.memberDetails;
  const R = 118, r = campaign.sharedIndicators.length > 1 ? 48 : 0;
  const pos = new Map(
    members.map((m, i) => {
      const a = (i / members.length) * Math.PI * 2 - Math.PI / 2;
      return [m.id, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a }];
    })
  );
  const hubs = campaign.sharedIndicators.map((s, i, arr) => {
    const a = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
    return { ...s, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  const color = { Critical: 'var(--critical)', High: 'var(--high)', Medium: 'var(--medium)', Low: 'var(--low)' };
  const trunc = (s, n = 17) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${campaign.name}: ${members.length} linked assets`} style={{ width: '100%', height: 'auto' }}>
      {hubs.flatMap((h) =>
        h.entityIds.map((id) => {
          const p = pos.get(id);
          return p ? <line key={h.type + h.value + id} x1={h.x} y1={h.y} x2={p.x} y2={p.y} stroke="#9aa6b8" strokeWidth="1.5" /> : null;
        })
      )}
      {hubs.map((h) => (
        <g key={h.type + h.value}>
          <rect x={h.x - 8} y={h.y - 8} width="16" height="16" rx="3" fill="#ffe46b" stroke="#101b2d" strokeWidth="1.5" />
          <title>{`${h.type}: ${h.value}`}</title>
        </g>
      ))}
      {members.map((m) => {
        const p = pos.get(m.id);
        const left = Math.cos(p.a) < -0.3, right = Math.cos(p.a) > 0.3;
        return (
          <g key={m.id}>
            <circle cx={p.x} cy={p.y} r="13" fill={color[m.level]} />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{m.score}</text>
            <text
              x={p.x + (right ? 18 : left ? -18 : 0)}
              y={p.y + (right || left ? 4 : Math.sin(p.a) > 0 ? 28 : -20)}
              textAnchor={right ? 'start' : left ? 'end' : 'middle'}
              fontSize="10.5" fill="#101b2d"
            >
              {trunc(m.title)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Campaign({ c, onSelect }) {
  const [draft, setDraft] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try { setDraft(await api.takedownCampaign(c.id)); } catch (e) { setError(e.message); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(draft.body); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setError('Copy failed. Select the text and copy it manually.'); }
  }

  return (
    <section className="panel camp" aria-labelledby={`h-${c.id}`}>
      <div className="camp-graph"><Graph campaign={c} /></div>
      <div className="camp-body">
        <h2 id={`h-${c.id}`}>{c.name}</h2>
        <p className="meta">
          {c.accounts} account{c.accounts === 1 ? '' : 's'} and {c.apps} app{c.apps === 1 ? '' : 's'} on {c.platforms.join(', ')}. Peak risk {c.riskScore}.
        </p>
        <h3 style={{ fontSize: 14 }}>What links them</h3>
        <div className="chips" style={{ marginTop: 6 }}>
          {c.sharedIndicators.map((s) => (
            <span className="chip" key={s.type + s.value}>
              {s.type}: {s.value} · {s.entityIds.length} assets
            </span>
          ))}
        </div>
        <ul className="members">
          {c.memberDetails.map((m) => (
            <li key={m.id}>
              <span className={`score-chip lv-${m.level}`}>{m.score}</span>
              <button className="btn" style={{ padding: '3px 10px' }} onClick={() => onSelect(m.id)}>{m.title}</button>
              <span className="tag">{m.type === 'app' ? 'app' : m.platform}</span>
            </li>
          ))}
        </ul>
        <button className="btn primary" onClick={load}>Draft campaign report</button>
        {error && <p className="gate" role="alert" style={{ marginTop: 10 }}>{error}</p>}
        {draft && (
          <div className="draft" style={{ margin: '14px 0 0' }}>
            <div className="draft-head"><b>{draft.subject}</b><button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy draft'}</button></div>
            <pre>{draft.body}</pre>
          </div>
        )}
      </div>
    </section>
  );
}

export default function Campaigns({ campaigns, onSelect }) {
  if (!campaigns.length) return <div className="panel empty">No campaigns yet. Campaigns appear when flagged assets share a link, phone number, payment ID or file.</div>;
  return (
    <div className="camp-list">
      {campaigns.map((c) => <Campaign key={c.id} c={c} onSelect={onSelect} />)}
    </div>
  );
}
