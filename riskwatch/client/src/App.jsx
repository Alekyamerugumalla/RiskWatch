import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import Detail from './Detail.jsx';
import Campaigns from './Campaigns.jsx';
import Check from './Check.jsx';
import Brands from './Brands.jsx';
import Evaluation from './Evaluation.jsx';

const TABS = [
  ['queue', 'Review queue'],
  ['campaigns', 'Campaigns'],
  ['check', 'Check now'],
  ['brands', 'Brands'],
  ['eval', 'Accuracy'],
];
const DEMO_TABS = ['queue', 'campaigns', 'eval'];
const DEMO_ID = 'freshkart';

const remembered = () => { try { return localStorage.getItem('riskwatch.brand') || DEMO_ID; } catch { return DEMO_ID; } };
const remember = (id) => { try { localStorage.setItem('riskwatch.brand', id); } catch { /* storage can be blocked; the choice just won't persist */ } };

export default function App() {
  const [tab, setTab] = useState('queue');
  const [brand, setBrand] = useState(null);
  const [brands, setBrands] = useState([]);
  const [activeId, setActiveId] = useState(remembered);
  const [stats, setStats] = useState(null);
  const [entities, setEntities] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [kind, setKind] = useState('all');
  const [level, setLevel] = useState('flagged');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [b, bs, s, e, c] = await Promise.all([api.brand(), api.brands(), api.stats(), api.entities(), api.campaigns()]);
      setBrand(b); setBrands(bs); setStats(s); setEntities(e); setCampaigns(c);
      setError('');
    } catch (err) {
      setError(`Could not reach the RiskWatch API (${err.message}). Start it with "npm start" in the project folder.`);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // A remembered brand may have been removed; fall back to the demo brand.
  const active = brands.find((b) => b.id === activeId) || brands.find((b) => b.id === DEMO_ID) || null;
  function selectBrand(id) { setActiveId(id); remember(id); }

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    api.entity(selectedId).then(setDetail).catch((e) => setError(e.message));
  }, [selectedId]);

  // Open the top item automatically so the first screen shows evidence, not an empty panel.
  useEffect(() => {
    if (!selectedId && entities.length) setSelectedId(entities.find((x) => !x.official)?.id ?? null);
  }, [entities, selectedId]);

  const visible = useMemo(
    () =>
      entities.filter((x) => (kind === 'all' || x.type === kind) && (level === 'all' || (level === 'flagged' ? x.score >= 55 : true))),
    [entities, kind, level]
  );

  async function decide(id, decision) {
    await api.decide(id, decision);
    setDetail((d) => (d ? { ...d, decision } : d));
    setEntities((list) => list.map((x) => (x.id === id ? { ...x, decision } : x)));
    api.stats().then(setStats).catch(() => {});
  }

  function openEntity(id) { setSelectedId(id); setTab('queue'); setKind('all'); setLevel('all'); }
  function openCampaign() { setTab('campaigns'); }
  async function brandAdded(created) {
    setBrands(await api.brands());
    selectBrand(created.id);
    setTab('check');
  }
  async function brandRemoved(id) {
    setBrands(await api.brands());
    if (activeId === id) selectBrand(DEMO_ID);
  }

  const demoTab = DEMO_TABS.includes(tab);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="logo">Risk<span>Watch</span></span>
          <span className="watching">
            {demoTab
              ? <>Demo data for <b>{brand?.name ?? '…'}</b> · {stats?.monitored ?? '…'} accounts and apps monitored</>
              : <>Checking against <b>{active?.name ?? '…'}</b></>}
          </span>
          <nav className="tabs" aria-label="Sections">
            {TABS.map(([id, label]) => (
              <button key={id} className="tab" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>
            ))}
          </nav>
        </div>
      </header>
      <main>
        {error && <p className="gate" role="alert">{error}</p>}

        {tab === 'queue' && (
          <>
            {stats && (
              <div className="strip">
                <div className="hot"><b>{stats.flagged}</b><span>flagged for review</span></div>
                <div><b>{stats.critical}</b><span>critical</span></div>
                <div><b>{stats.campaigns}</b><span>scam campaigns</span></div>
                <div><b>{stats.accounts}</b><span>accounts watched</span></div>
                <div><b>{stats.apps}</b><span>apps watched</span></div>
                <div><b>{stats.confirmed}</b><span>confirmed fake</span></div>
              </div>
            )}
            <div className="workspace">
              <section className="panel" aria-label="Review queue">
                <div className="panel-head">
                  <h2>Highest risk first</h2>
                  <div className="seg" role="group" aria-label="Show">
                    {[['flagged', 'Flagged'], ['all', 'Everything']].map(([v, l]) => (
                      <button key={v} aria-pressed={level === v} onClick={() => setLevel(v)}>{l}</button>
                    ))}
                  </div>
                  <div className="seg" role="group" aria-label="Type">
                    {[['all', 'All'], ['account', 'Accounts'], ['app', 'Apps']].map(([v, l]) => (
                      <button key={v} aria-pressed={kind === v} onClick={() => setKind(v)}>{l}</button>
                    ))}
                  </div>
                </div>
                {visible.length === 0 ? (
                  <p className="empty">Nothing matches these filters. Switch to Everything to see all monitored items.</p>
                ) : (
                  <ul className="queue">
                    {visible.map((x) => (
                      <li key={x.id}>
                        <button className="row" aria-selected={selectedId === x.id} onClick={() => setSelectedId(x.id)}>
                          <span className={`score-chip lv-${x.level}`} aria-label={`Risk ${x.score}, ${x.level}`}>{x.score}</span>
                          <span>
                            <span className="row-title">{x.title}</span>
                            <span className="row-sub" style={{ display: 'block' }}>
                              <span className="tag">{x.type === 'app' ? 'app' : x.platform}</span>
                              {x.campaignId && <span className="tag in-camp">{x.campaignId.replace('camp-', 'campaign ')}</span>}
                              {x.decision && <span className={`tag dec-${x.decision}`}>{x.decision}</span>}
                              {x.official && <span className="tag">official</span>}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <Detail data={detail} onDecision={decide} onOpenCampaign={openCampaign} />
            </div>
          </>
        )}

        {tab === 'campaigns' && <Campaigns campaigns={campaigns} onSelect={openEntity} />}
        {tab === 'check' && <Check brand={active} brands={brands} onSelectBrand={selectBrand} onAddBrand={() => setTab('brands')} />}
        {tab === 'brands' && <Brands brands={brands} activeId={active?.id} onSelect={(id) => { selectBrand(id); setTab('check'); }} onAdded={brandAdded} onRemoved={brandRemoved} />}
        {tab === 'eval' && <Evaluation />}
      </main>
    </>
  );
}
