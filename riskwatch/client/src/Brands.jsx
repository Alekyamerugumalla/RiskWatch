
import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { imageHash } from './hash.js';

const BLANK = {
  name: '',
  aliases: '',
  handles: '',
  domains: '',
  phones: '',
  appPackage: '',
  appDeveloper: '',
  appCert: '',
};

const ASSET_BLANK = {
  type: 'social',
  platform: 'instagram',
  identifier: '',
  sourceUrl: '',
  evidenceNote: '',
};

const SOCIAL_PLATFORMS = [
  'instagram',
  'facebook',
  'x',
  'telegram',
  'other',
];

const APP_PLATFORMS = [
  'Google Play',
  'Apple App Store',
  'third-party-store',
  'direct-download',
  'other',
];

export default function Brands({
  brands,
  activeId,
  onSelect,
  onAdded,
  onRemoved,
}) {
  const [f, setF] = useState(BLANK);
  const [logo, setLogo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [assetBrandId, setAssetBrandId] = useState(activeId || '');
  const [assetForm, setAssetForm] = useState(ASSET_BLANK);
  const [assets, setAssets] = useState([]);
  const [assetsBusy, setAssetsBusy] = useState(false);
  const [assetSaving, setAssetSaving] = useState(false);
  const [assetError, setAssetError] = useState('');
  const [assetMessage, setAssetMessage] = useState('');

  const set = (key) => (e) =>
    setF((old) => ({ ...old, [key]: e.target.value }));

  const setAsset = (key) => (e) =>
    setAssetForm((old) => ({ ...old, [key]: e.target.value }));

  const assetBrand = brands.find((b) => b.id === assetBrandId);
  const isSocial = assetForm.type === 'social';

  useEffect(() => {
    if (activeId && brands.some((b) => b.id === activeId)) {
      setAssetBrandId(activeId);
    } else if (!brands.some((b) => b.id === assetBrandId)) {
      setAssetBrandId(brands[0]?.id || '');
    }
  }, [activeId, brands, assetBrandId]);

  async function loadAssets(brandId) {
    if (!brandId) {
      setAssets([]);
      return;
    }

    setAssetsBusy(true);
    setAssetError('');

    try {
      const result = await api.brandAssets(brandId);
      setAssets(Array.isArray(result) ? result : result.assets || []);
    } catch (err) {
      setAssets([]);
      setAssetError(err.message);
    } finally {
      setAssetsBusy(false);
    }
  }

  useEffect(() => {
    loadAssets(assetBrandId);
  }, [assetBrandId]);

  async function pickLogo(e) {
    const file = e.target.files?.[0];
    setError('');

    if (!file) {
      setLogo(null);
      return;
    }

    try {
      const hash = await imageHash(file);
      setLogo({
        hash,
        preview: URL.createObjectURL(file),
        name: file.name,
      });
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
        name: f.name,
        aliases: f.aliases,
        officialHandles: f.handles,
        officialDomains: f.domains,
        officialPhones: f.phones,
        logoHash: logo?.hash || '',
        app: {
          package: f.appPackage,
          developer: f.appDeveloper,
          certSha256: f.appCert,
        },
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
    if (
      !window.confirm(
        `Remove ${b.name}? Its saved details and earlier checks will be deleted.`
      )
    ) {
      return;
    }

    try {
      await api.deleteBrand(b.id);
      onRemoved(b.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitAsset(e) {
    e.preventDefault();

    if (!assetBrandId) {
      setAssetError('Select a brand first.');
      return;
    }

    setAssetSaving(true);
    setAssetError('');
    setAssetMessage('');

    try {
      await api.addBrandAsset(assetBrandId, {
        type: assetForm.type,
        platform: assetForm.platform,
        identifier: assetForm.identifier.trim(),
        sourceUrl: assetForm.sourceUrl.trim(),
        evidenceNote: assetForm.evidenceNote.trim(),
        verificationStatus: 'unverified',
      });

      setAssetForm(ASSET_BLANK);
      setAssetMessage('Asset added with Unverified status.');
      await loadAssets(assetBrandId);
    } catch (err) {
      setAssetError(err.message);
    } finally {
      setAssetSaving(false);
    }
  }

  async function changeStatus(asset, verificationStatus) {
    setAssetError('');
    setAssetMessage('');

    try {
      await api.updateBrandAsset(assetBrandId, asset.id, {
        verificationStatus,
      });

      setAssetMessage('Verification status updated.');
      await loadAssets(assetBrandId);
    } catch (err) {
      setAssetError(err.message);
    }
  }

  async function removeAsset(asset) {
    if (!window.confirm(`Remove asset "${asset.identifier}"?`)) {
      return;
    }

    setAssetError('');
    setAssetMessage('');

    try {
      await api.deleteBrandAsset(assetBrandId, asset.id);
      setAssetMessage('Asset removed.');
      await loadAssets(assetBrandId);
    } catch (err) {
      setAssetError(err.message);
    }
  }

  return (
    <div className="check">
      <section className="panel">
        <div className="panel-head">
          <h2>Add a brand to protect</h2>
        </div>

        <form className="f" onSubmit={submit}>
          <label>
            Brand name
            <input
              required
              value={f.name}
              onChange={set('name')}
              placeholder="For example: Swiggy"
            />
          </label>

          <label>
            Other names people use
            <input
              value={f.aliases}
              onChange={set('aliases')}
              placeholder="SBI, Instamart"
            />
            <span className="hint">
              Add short or common names used by your brand.
            </span>
          </label>

          <label>
            Official handles
            <textarea
              value={f.handles}
              onChange={set('handles')}
              placeholder={'swiggy_in\nswiggy_care'}
            />
            <span className="hint">
              One per line, or paste profile links.
            </span>
          </label>

          <label>
            Official website
            <input
              value={f.domains}
              onChange={set('domains')}
              placeholder="swiggy.com"
            />
          </label>

          <label>
            Official support phone numbers
            <input
              value={f.phones}
              onChange={set('phones')}
              placeholder="1800 123 4567"
            />
          </label>

          <label>
            Brand logo
            <input type="file" accept="image/*" onChange={pickLogo} />
            <span className="hint">
              A fingerprint is calculated in your browser. The image itself
              is not uploaded.
            </span>
          </label>

          {logo && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <img
                className="logo-preview"
                src={logo.preview}
                alt="Selected brand logo"
              />
              <span className="hint">{logo.name}</span>
            </div>
          )}

          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
              Official mobile app (optional)
            </summary>
            <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
              <label>
                Package name
                <input
                  value={f.appPackage}
                  onChange={set('appPackage')}
                  placeholder="in.swiggy.android"
                />
              </label>
              <label>
                Developer name
                <input
                  value={f.appDeveloper}
                  onChange={set('appDeveloper')}
                  placeholder="Official developer name"
                />
              </label>
              <label>
                Signing certificate fingerprint (SHA-256)
                <input
                  value={f.appCert}
                  onChange={set('appCert')}
                />
              </label>
            </div>
          </details>

          <button
            className="btn primary"
            disabled={busy}
            style={{ justifySelf: 'start' }}
          >
            {busy ? 'Saving…' : 'Save brand and start checking'}
          </button>

          {error && <p className="gate" role="alert">{error}</p>}
        </form>
      </section>

      <section className="panel" aria-label="Official asset management">
        <div className="panel-head">
          <h2>Official Assets</h2>
        </div>

        <p className="hint">
          Register official social profiles and mobile apps, record their
          source evidence, and track verification status. New assets start
          as unverified and are not automatically trusted by detection.
        </p>

        <label>
          Brand to manage
          <select
            value={assetBrandId}
            onChange={(e) => {
              setAssetBrandId(e.target.value);
              setAssetMessage('');
              setAssetError('');
            }}
          >
            <option value="">Select a brand</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        <form className="f" onSubmit={submitAsset}>
          <label>
            Asset type
            <select
              value={assetForm.type}
              onChange={(e) => {
                const type = e.target.value;
                setAssetForm({
                  ...ASSET_BLANK,
                  type,
                  platform: type === 'social' ? 'instagram' : 'Google Play',
                });
              }}
            >
              <option value="social">Social account</option>
              <option value="app">Mobile app</option>
            </select>
          </label>

          <label>
            {isSocial ? 'Social platform' : 'App store / distribution'}
            <select
              value={assetForm.platform}
              onChange={setAsset('platform')}
            >
              {(isSocial ? SOCIAL_PLATFORMS : APP_PLATFORMS).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>

          <label>
            {isSocial ? 'Official handle or profile URL' : 'App name or package identifier'}
            <input
              required
              value={assetForm.identifier}
              onChange={setAsset('identifier')}
              placeholder={
                isSocial
                  ? '@brand_support or https://instagram.com/brand'
                  : 'com.example.brand'
              }
            />
          </label>

          <label>
            Source URL
            <input
              type="url"
              value={assetForm.sourceUrl}
              onChange={setAsset('sourceUrl')}
              placeholder="https://..."
            />
            <span className="hint">
              Link to an official website, verified profile, or app-store
              listing that supports this asset.
            </span>
          </label>

          <label>
            Evidence notes
            <textarea
              value={assetForm.evidenceNote}
              onChange={setAsset('evidenceNote')}
              placeholder="How was this asset confirmed to belong to the brand?"
            />
          </label>

          <button
            className="btn primary"
            disabled={assetSaving || !assetBrandId}
            style={{ justifySelf: 'start' }}
          >
            {assetSaving ? 'Saving…' : 'Register official asset'}
          </button>
        </form>

        {assetError && <p className="gate" role="alert">{assetError}</p>}
        {assetMessage && <p className="hint" role="status">{assetMessage}</p>}

        <div style={{ marginTop: 20 }}>
          <h3>
            Registered assets {assetBrand ? `— ${assetBrand.name}` : ''}
          </h3>

          {assetsBusy && <p className="hint">Loading assets…</p>}

          {!assetsBusy && !assetError && assets.length === 0 && (
            <p className="hint">No assets registered for this brand yet.</p>
          )}

          {assets.map((asset) => (
            <div className="brand-card" key={asset.id}>
              <div style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}>
                <h3>{asset.identifier}</h3>
                <span className="tag">{asset.type}</span>
                <span className="tag">{asset.platform}</span>
              </div>

              <p className="hint">
                Status: {asset.verificationStatus || 'unverified'}
              </p>

              {asset.sourceUrl && (
                <p>
                  <a
                    href={asset.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View source evidence
                  </a>
                </p>
              )}

              {asset.evidenceNote && (
                <p className="hint">{asset.evidenceNote}</p>
              )}

              <div className="row-actions">
                <label>
                  Verification status
                  <select
                    value={asset.verificationStatus || 'unverified'}
                    onChange={(e) => changeStatus(asset, e.target.value)}
                  >
                    <option value="unverified">Unverified</option>
                    <option value="pending">Pending</option>
                    <option value="verified">Verified</option>
                  </select>
                </label>

                <button
                  className="btn"
                  type="button"
                  onClick={() => removeAsset(asset)}
                >
                  Remove asset
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel" aria-label="Brands">
        <div className="panel-head">
          <h2>Your brands</h2>
        </div>

        {brands.map((b) => (
          <div className="brand-card" key={b.id}>
            <div style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}>
              <h3>{b.name}</h3>
              <span className="tag">
                {b.isDemo ? 'demo brand' : 'your brand'}
              </span>
              {b.id === activeId && (
                <span className="tag in-camp">selected</span>
              )}
            </div>

            <p className="hint">
              {b.officialHandles.length
                ? `${b.officialHandles.length} official handle${b.officialHandles.length === 1 ? '' : 's'}`
                : 'No official handles'}
              {' · '}
              {b.officialDomains.length
                ? b.officialDomains.join(', ')
                : 'no website'}
              {' · '}
              {b.hasLogo ? 'logo on file' : 'no logo'}
              {b.aliases.length
                ? ` · also known as ${b.aliases.join(', ')}`
                : ''}
            </p>

            <div className="row-actions">
              {b.id !== activeId && (
                <button className="btn" onClick={() => onSelect(b.id)}>
                  Use for checks
                </button>
              )}
              {!b.isDemo && (
                <button className="btn" onClick={() => remove(b)}>
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
