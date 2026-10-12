import React, { useEffect, useState } from 'react';
import { api } from './api.js';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function Highlight({ text, phrases }) {
  const list = (phrases || []).filter(Boolean);
  if (!list.length) return <>{text}</>;
  const re = new RegExp(`(${list.map(escapeRe).join('|')})`, 'gi');
  return (
    <>
      {String(text).split(re).map((part, i) =>
        list.some((p) => p.toLowerCase() === part.toLowerCase()) ? <mark key={i}>{part}</mark> : <React.Fragment key={i}>{part}</React.Fragment>
      )}
    </>
  );
}

export function ScoreMeter({ score }) {
  return (
    <div className="meter" role="img" aria-label={`Risk score ${score} out of 100`}>
      <i style={{ width: `${score}%` }} />
      {[35, 55, 75].map((t) => (
        <React.Fragment key={t}>
          <u style={{ left: `${t}%` }} />
          <em style={{ left: `${t}%` }}>{t}</em>
        </React.Fragment>
      ))}
    </div>
  );
}

export default function Detail({ data, adhoc = false, onDecision, onOpenCampaign }) {
  const [draft, setDraft] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(null);
    setCopied(false);
    setError('');
  }, [data?.id, data?.title]);

  if (!data) return <div className="panel detail empty">Select an account or app from the queue to see why it was flagged.</div>;

  const raw = data.raw || {};
  const scamSig = data.signals.find((s) => s.matches?.length);
  const phrases = scamSig?.matches || [];
  const texts = data.type === 'account' ? [raw.bio, ...(raw.recentPosts || [])] : [raw.description];
  const sourceTexts = texts.filter(Boolean);
  const ind = data.indicators || { links: [], phones: [], upi: [], hashes: [] };
  const allInd = [...ind.links.map((v) => ['link', v]), ...ind.upi.map((v) => ['UPI', v]), ...ind.phones.map((v) => ['phone', v]), ...(ind.hashes || []).map((v) => ['file hash', v])];

  async function makeDraft() {
    setError('');
    try {
      setDraft(adhoc ? data.takedown : await api.takedownEntity(data.id));
    } catch (e) {
      setError(e.message);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Copy failed. Select the text and copy it manually.');
    }
  }

  return (
    <article className="panel detail" aria-label={`Evidence for ${data.title}`}>
      <div className="detail-top">
        <h2>{data.title}</h2>
        <p className="sub">
          {data.subtitle} · {data.type === 'app' ? 'Android app' : data.platform}
        </p>
        <div className="verdict">
          <span className={`num tx-${data.level}`}>{data.score}</span>
          <span className={`lvl tx-${data.level}`}>{data.official ? 'Official asset' : `${data.level} risk`}</span>
        </div>
        <p className="summary">{data.summary}</p>
        <ScoreMeter score={data.score} />
      </div>

      {sourceTexts.length > 0 && (
        <div className="section">
          <h3>What it says</h3>
          {sourceTexts.map((t, i) => (
            <p className="src-text" key={i}>
              <Highlight text={t} phrases={phrases} />
            </p>
          ))}
        </div>
      )}

      <div className="section">
        <h3>Evidence behind the score</h3>
        {data.gate?.applied && <p className="gate">{data.gate.reason}</p>}
        {data.skipped?.length > 0 && (
          <p className="gate">Not checked because the details were not provided: {data.skipped.join(', ')}. The score uses only the checks that ran.</p>
        )}
        {data.signals.filter((s) => s.weight > 0).map((s) => (
          <div className={`sig ${s.na || s.points < 1 ? 'off' : ''}`} key={s.id}>
            <span className="sig-name">{s.label}</span>
            <span className="sig-pts">
              {s.na ? <small>not checked</small> : <>+{s.points} <small>/ {s.weight}</small></>}
            </span>
            <div className="sig-bar" aria-hidden="true">
              <i style={{ width: `${s.score * 100}%` }} />
            </div>
            <p className="sig-ev">{s.evidence}</p>
          </div>
        ))}
        {data.mitigations?.map((m, i) => (
          <p className="mit" key={i}>
            {m.points} · {m.label}
          </p>
        ))}
      </div>

      {allInd.length > 0 && (
        <div className="section">
          <h3>Links, payment IDs and phone numbers it uses</h3>
          <div className="chips">
            {allInd.map(([k, v]) => (
              <span className="chip" key={k + v}>
                {k}: {v}
              </span>
            ))}
          </div>
        </div>
      )}

      {!adhoc && data.campaignId && (
        <div className="section">
          <h3>Part of a campaign</h3>
          <button className="btn" onClick={() => onOpenCampaign?.(data.campaignId)}>
            See linked accounts and apps
          </button>
        </div>
      )}

      {!data.official && (
        <div className="actions">
          {!adhoc && (
            <>
              <button className="btn danger" aria-pressed={data.decision === 'confirmed'} onClick={() => onDecision(data.id, data.decision === 'confirmed' ? null : 'confirmed')}>
                {data.decision === 'confirmed' ? 'Confirmed as fake' : 'Confirm as fake'}
              </button>
              <button className="btn" aria-pressed={data.decision === 'dismissed'} onClick={() => onDecision(data.id, data.decision === 'dismissed' ? null : 'dismissed')}>
                {data.decision === 'dismissed' ? 'Dismissed' : 'Dismiss'}
              </button>
            </>
          )}
          {(adhoc ? !!data.takedown : true) && (
            <button className="btn primary" onClick={makeDraft}>
              Draft takedown report
            </button>
          )}
        </div>
      )}
      {error && <p className="gate" role="alert" style={{ margin: '0 20px 14px' }}>{error}</p>}
      {draft && (
        <div className="draft">
          <div className="draft-head">
            <b>{draft.subject}</b>
            <button className="btn" onClick={copy}>
              {copied ? 'Copied' : 'Copy draft'}
            </button>
          </div>
          <pre>{draft.body}</pre>
        </div>
      )}
    </article>
  );
}
