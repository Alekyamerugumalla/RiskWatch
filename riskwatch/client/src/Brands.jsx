import React, { useState } from 'react';
import { api } from './api.js';
import { imageHash } from './hash.js';

const BLANK = { name: '', aliases: '', handles: '', domains: '', phones: '', appPackage: '', appDeveloper: '', appCert: '' };

export default function Brands({ brands, activeId, onSelect, onAdded, onRemoved }) {
  const [f, setF] = useState(BLANK);
  const [logo, setLogo] = useState(null); // { hash, preview, name }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function pickLogo(e) {
    const file = e.target.files?.[0];
    setError('');
    if (!file) return setLogo(null);
    try {
      const hash = await imageHash(file);
      setLogo({ hash, preview: URL.createObjectURL(file), name: file.name });
    } catch (err) {
      setLogo(null);
      setError(err.message);
      e.target.value = '';
    }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await api.addBrand({
        name: f.name, aliases: f.aliases, officialHandles: f.handles, officialDomains: f.domains, officialPhones: f.phones,
        logoHash: logo?.hash || '', app: { package: f.appPackage, developer: f.appDeveloper, certSha256: f.appCert },
      });
      setF(BLANK);
      setLogo(null);
      onAdded(created);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(b) {
    if (!window.confirm(`Remove ${b.name}? Its saved details and earlier checks will be deleted.`)) return;
    try {
      await api.deleteBrand(b.id);
      onRemoved(b.id);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="check">
      <section className="panel">
        <div className="panel-head"><h2>Add a brand to protect</h2></div>
        <form className="f" onSubmit={submit}>
          <label>Brand name
            <input required value={f.name} onChange={set('name')} placeholder="For example: Swiggy" />
          </label>
          <label>Other names people use
            <input value={f.aliases} onChange={set('aliases')} placeholder="Short names, separated by commas: SBI, Instamart" />
            <span className="hint">Add short or common names. Impersonators often use them instead of the full name.</span>
          </label>
          <label>Official handles
            <textarea value={f.handles} onChange={set('handles')} placeholder={'swiggy_in\nswiggy_care'} />
            <span className="hint">One per line, or paste profile links. Official handles are never flagged.</span>
          </label>
          <label>Official website
            <input value={f.domains} onChange={set('domains')} placeholder="swiggy.com" />
            <span className="hint">Links to this site and its subdomains are treated as safe.</span>
          </label>
          <label>Official support phone numbers
            <input value={f.phones} onChange={set('phones')} placeholder="1800 123 4567" />
          </label>
          <label>Brand logo
            <input type="file" accept="image/*" onChange={pickLogo} />
            <span className="hint">Used to spot profile pictures and app icons that copy it. It is turned into a short fingerprint in your browser. The image is not uploaded.</span>
          </label>
          {logo && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <img className="logo-preview" src={logo.preview} alt="Selected brand logo" />
              <span className="hint">{logo.name}</span>
            </div>
          )}
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Official mobile app (optional)</summary>
            <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
              <label>Package name<input value={f.appPackage} onChange={set('appPackage')} placeholder="in.swiggy.android" /></label>
              <label>Developer name on Google Play<input value={f.appDeveloper} onChange={set('appDeveloper')} placeholder="Bundl Technologies" /></label>
              <label>Signing certificate fingerprint (SHA-256)<input value={f.appCert} onChange={set('appCert')} /></label>
            </div>
          </details>
          <button className="btn primary" disabled={busy} style={{ justifySelf: 'start' }}>{busy ? 'Saving…' : 'Save brand and start checking'}</button>
          {error && <p className="gate" role="alert">{error}</p>}
        </form>
      </section>

      <section className="panel" aria-label="Brands">
        <div className="panel-head"><h2>Your brands</h2></div>
        {brands.map((b) => (
          <div className="brand-card" key={b.id}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <h3>{b.name}</h3>
              <span className="tag">{b.isDemo ? 'demo brand' : 'your brand'}</span>
              {b.id === activeId && <span className="tag in-camp">selected</span>}
            </div>
            <p className="hint">
              {b.officialHandles.length ? `${b.officialHandles.length} official handle${b.officialHandles.length === 1 ? '' : 's'}` : 'No official handles'}
              {' · '}{b.officialDomains.length ? b.officialDomains.join(', ') : 'no website'}
              {' · '}{b.hasLogo ? 'logo on file' : 'no logo'}
              {b.aliases.length ? ` · also known as ${b.aliases.join(', ')}` : ''}
            </p>
            <div className="row-actions">
              {b.id !== activeId && <button className="btn" onClick={() => onSelect(b.id)}>Use for checks</button>}
              {!b.isDemo && <button className="btn" onClick={() => remove(b)}>Remove</button>}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
