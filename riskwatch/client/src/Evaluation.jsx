import React, { useEffect, useState } from 'react';
import { api } from './api.js';

const pct = (x) => `${(x * 100).toFixed(1)}%`;

export default function Evaluation() {
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.evaluation().then(setR).catch((e) => setError(e.message)); }, []);
  if (error) return <p className="gate" role="alert">{error}</p>;
  if (!r) return <div className="panel empty">Running evaluation…</div>;
  const d = r.detection;

  return (
    <>
      <div className="metrics">
        <div className="metric"><b>{pct(d.precision)}</b><span>Precision: flagged items that were truly fake</span></div>
        <div className="metric"><b>{pct(d.recall)}</b><span>Recall: fake items that were caught</span></div>
        <div className="metric"><b>{pct(r.clustering.pairPrecision)}</b><span>Campaign grouping precision</span></div>
        <div className="metric"><b>{r.clustering.campaignsFound} of {r.clustering.groundTruthCampaigns}</b><span>Campaigns found vs known</span></div>
      </div>
      <div className="panel">
        <div className="panel-head"><h2>Choosing the flag threshold</h2></div>
        <table className="t">
          <thead><tr><th>Flag at score</th><th>Precision</th><th>Recall</th><th>False alarms</th><th>Missed fakes</th></tr></thead>
          <tbody>
            {r.sweep.map((s) => (
              <tr key={s.threshold} style={s.threshold === r.threshold ? { background: '#eaf0ff', fontWeight: 700 } : undefined}>
                <td>{s.threshold}{s.threshold === r.threshold ? ' (used)' : ''}</td>
                <td>{pct(s.precision)}</td><td>{pct(s.recall)}</td><td>{s.fp}</td><td>{s.fn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        Test set: {r.dataset.total} synthetic items ({r.dataset.fake} fake, {r.dataset.legit} legitimate, {r.dataset.borderline} borderline and excluded).
        {' '}{r.note}
      </p>
    </>
  );
}
