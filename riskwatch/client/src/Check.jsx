import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import Detail from './Detail.jsx';
import { imageHash, invertHash } from './hash.js';

const blankAccount = {
  type: 'account', platform: 'instagram', handle: '', displayName: '', bio: '', post: '', link: '',
  createdDaysAgo: '', followers: '', following: '', posts: '', verified: false, imageMode: 'none',
};
const blankApp = {
  type: 'app', name: '', packageName: '', developer: '', store: 'direct-download', downloadUrl: '',
  permissions: '', description: '', imageMode: 'none',
};
const acct = (o) => ({ ...blankAccount, ...o });
const mobile = (o) => ({ ...blankApp, ...o });

/* Ready-made FreshKart examples, shown only while the demo brand is selected. */
const FRESHKART = {
  account: [
    ['Scam: rewards link', acct({ handle: 'freshkart_offer5_official', displayName: 'FreshKart', bio: 'Win a free voucher today. DM us',
      post: 'You have won a free voucher! Pay ₹99 registration fee and click the link in bio within 24 hours.',
      link: 'https://t.me/freshkart_rewards_official', createdDaysAgo: 2, followers: 20, following: 900, posts: 2, imageMode: 'copy' })],
    ['Scam: UPI wallet', acct({ platform: 'x', handle: 'freshkart_helpdesk_24x7', displayName: 'FreshKart Helpdesk', bio: '24x7 wallet help',
      post: 'Your wallet will be blocked in 24 hours. Complete KYC: send OTP and pay ₹49 to freshkart.kyc@okaxis',
      createdDaysAgo: 4, followers: 30, following: 800, posts: 3, imageMode: 'copy' })],
    ['Scam: fake sale', acct({ handle: 'freshkart.official.offers', displayName: 'FreshKart Offers', bio: 'Flat 80% off. Link in bio',
      post: 'Mega sale! Free voucher, click the link in bio. Offer expires today!', link: 'https://bit.ly/fk-80-off',
      createdDaysAgo: 6, followers: 50, following: 1700, posts: 3, imageMode: 'copy' })],
    ['Safe: fan page', acct({ handle: 'freshkart_recipes_fan', displayName: 'Recipes with FreshKart veggies',
      bio: 'Unofficial fan page. Not affiliated with FreshKart.', post: 'Tonight: palak paneer using veggies from my weekly order.',
      createdDaysAgo: 800, followers: 9000, following: 200, posts: 410, imageMode: 'different' })],
    ['Safe: fraud warning', acct({ platform: 'x', handle: 'cyber_safe_india', displayName: 'Cyber Safe India', bio: 'Fraud awareness for everyone',
      post: 'Beware of fake FreshKart support accounts. FreshKart will never ask you to share your OTP or install apps from links.',
      createdDaysAgo: 1200, followers: 45000, following: 150, posts: 2100, imageMode: 'different' })],
    ['Safe: customer complaint', acct({ platform: 'x', handle: 'rohan_k_mumbai', displayName: 'Rohan K', bio: 'Mumbai | startups | football',
      post: 'Ordered from FreshKart yesterday, the delivery was late and the refund still has not arrived. @freshkart_care please help.',
      createdDaysAgo: 1500, followers: 800, following: 600, posts: 2500, imageMode: 'different' })],
  ],
  app: [
    ['Scam: gift card APK', mobile({ name: 'FreshKart Gift Card', packageName: 'com.freshkart.giftcards', developer: 'Gift Services',
      downloadUrl: 'https://freshkart-gifts.top/giftcard.apk', permissions: 'READ_SMS, BIND_ACCESSIBILITY_SERVICE, SYSTEM_ALERT_WINDOW',
      description: 'Claim your free gift card. Share OTP to verify.', imageMode: 'copy' })],
    ['Scam: Telegram app', mobile({ name: 'FreshKart Refund Pro', packageName: 'com.freshkart.refundpro', developer: 'Refund Services', store: 'telegram',
      downloadUrl: 'https://t.me/freshkart_kyc_update/12', permissions: 'READ_SMS, BIND_ACCESSIBILITY_SERVICE',
      description: 'Get your refund instantly. Share OTP to verify.', imageMode: 'copy' })],
  ],
};

/* Sample inputs built from whatever brand is selected, so the demo works for any brand. */
function samplesFor(brand) {
  const t = [...brand.tokens].sort((a, b) => a.length - b.length)[0];
  const N = brand.name;
  const copy = brand.hasLogo ? 'copy' : 'none';
  const different = brand.hasLogo ? 'different' : 'none';
  return {
    account: [
      ['Sample scam page', acct({ handle: `${t}_support_help`, displayName: `${N} Support`, bio: 'Instant refund for failed orders. DM us',
        post: 'Your payment failed! Pay ₹10 verification fee and share your OTP within 24 hours to get your refund. Click the link in bio.',
        link: `https://${t}-refund-help.xyz/claim`, createdDaysAgo: 4, followers: 35, following: 900, posts: 3, imageMode: copy })],
      ['Sample fan page', acct({ handle: `${t}_fan_page`, displayName: `${N} fan page`, bio: `Unofficial fan page. Not affiliated with ${N}.`,
        post: `Loving the latest update from ${N}. Great service this week!`,
        createdDaysAgo: 800, followers: 9000, following: 200, posts: 410, imageMode: different })],
      ['Sample customer complaint', acct({ platform: 'x', handle: 'ravi_t_blr', displayName: 'Ravi T', bio: 'Bengaluru | cricket | coffee',
        post: `My ${N} refund has not arrived yet. Please help.`, createdDaysAgo: 1400, followers: 700, following: 500, posts: 2600, imageMode: different })],
    ],
    app: [
      ['Sample fake app', mobile({ name: `${N} Rewards`, packageName: `com.${t}.rewards`, developer: 'Rewards Studio',
        downloadUrl: `https://${t}-rewards.top/app.apk`, permissions: 'READ_SMS, BIND_ACCESSIBILITY_SERVICE',
        description: 'Claim your cashback. Share OTP to verify.', imageMode: copy })],
    ],
  };
}

export default function Check({ brand, brands, onSelectBrand, onAddBrand }) {
  const [form, setForm] = useState(blankAccount);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cleared, setCleared] = useState(false);
  const isApp = form.type === 'app';

  // A different brand means a different yardstick: start from a clean form and result.
  useEffect(() => { setForm((f) => (f.type === 'app' ? blankApp : blankAccount)); setFile(null); setResult(null); setError(''); }, [brand?.id]);

  if (!brand) return <div className="panel empty">Loading brands…</div>;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const examples = brand.isDemo ? FRESHKART : samplesFor(brand);
  const load = (data) => { setForm(data); setFile(null); setResult(null); setError(''); };
  const switchType = (type) => load(type === 'app' ? blankApp : blankAccount);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      let hash;
      if (form.imageMode === 'copy') hash = brand.logoHash;
      else if (form.imageMode === 'different') hash = invertHash(brand.logoHash);
      else if (form.imageMode === 'upload') {
        if (!file) throw new Error('Choose an image to compare, or select "Not provided".');
        hash = await imageHash(file);
      }
      const body = isApp
        ? { ...form, brandId: brand.id, iconHash: hash, permissions: form.permissions.split(',').map((s) => s.trim()).filter(Boolean) }
        : { ...form, brandId: brand.id, logoHash: hash, recentPosts: [form.post] };
      setResult(await api.check(body));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function forget() {
    try { await api.clearHistory(brand.id); setCleared(true); setTimeout(() => setCleared(false), 2000); } catch (err) { setError(err.message); }
  }

  const imageLabel = isApp ? 'App icon' : 'Profile image';

  return (
    <div className="check">
      <div className="panel">
        <div className="brand-pick">
          <label>Brand to protect
            <select value={brand.id} onChange={(e) => onSelectBrand(e.target.value)}>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}{b.isDemo ? ' (demo)' : ''}</option>)}
            </select>
          </label>
          <button type="button" className="btn" onClick={onAddBrand}>Add a brand</button>
        </div>
        <div className="panel-head">
          <h2>Check an account or app</h2>
          <div className="seg" role="group" aria-label="What to check">
            <button type="button" aria-pressed={!isApp} onClick={() => switchType('account')}>Account</button>
            <button type="button" aria-pressed={isApp} onClick={() => switchType('app')}>App</button>
          </div>
        </div>
        <form className="f" onSubmit={submit}>
          <p className="hint">Copy the details from the profile or app listing you want to check. RiskWatch does not scrape platforms.</p>
          {!isApp ? (
            <>
              <div className="two">
                <label>Platform
                  <select value={form.platform} onChange={set('platform')}>
                    {['instagram', 'facebook', 'x', 'telegram'].map((p) => <option key={p}>{p}</option>)}
                  </select>
                </label>
                <label>Handle<input required value={form.handle} onChange={set('handle')} placeholder="@name" /></label>
              </div>
              <label>Display name<input value={form.displayName} onChange={set('displayName')} /></label>
              <label>Bio<textarea value={form.bio} onChange={set('bio')} /></label>
              <label>Recent post<textarea value={form.post} onChange={set('post')} /></label>
              <label>Link in bio<input value={form.link} onChange={set('link')} placeholder="https://" /></label>
              <div className="two">
                <label>Account age (days)<input type="number" min="0" value={form.createdDaysAgo} onChange={set('createdDaysAgo')} /></label>
                <label>Posts<input type="number" min="0" value={form.posts} onChange={set('posts')} /></label>
                <label>Followers<input type="number" min="0" value={form.followers} onChange={set('followers')} /></label>
                <label>Following<input type="number" min="0" value={form.following} onChange={set('following')} /></label>
              </div>
              <span className="hint">Leave a number blank if you don't know it. It is left out of the score instead of counted as zero.</span>
              <label className="inline"><input type="checkbox" checked={form.verified} onChange={set('verified')} />The platform shows a verified badge</label>
            </>
          ) : (
            <>
              <label>App name<input required value={form.name} onChange={set('name')} /></label>
              <label>Package name<input value={form.packageName} onChange={set('packageName')} placeholder="com.example.app" /></label>
              <label>Developer<input value={form.developer} onChange={set('developer')} /></label>
              <div className="two">
                <label>Where it is distributed
                  <select value={form.store} onChange={set('store')}>
                    {['Google Play', 'third-party-store', 'direct-download', 'telegram', 'whatsapp'].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <label>Download link<input value={form.downloadUrl} onChange={set('downloadUrl')} placeholder="https://" /></label>
              </div>
              <label>Permissions<input value={form.permissions} onChange={set('permissions')} /><span className="hint">Separate with commas, for example READ_SMS, CAMERA.</span></label>
              <label>Store description<textarea value={form.description} onChange={set('description')} /></label>
            </>
          )}

          {brand.hasLogo ? (
            <label>{imageLabel}
              <select value={form.imageMode} onChange={set('imageMode')}>
                <option value="none">Not provided</option>
                <option value="upload">Upload an image to compare with the brand logo</option>
                <option value="copy">Demo shortcut: looks like the brand logo</option>
                <option value="different">Demo shortcut: different from the brand logo</option>
              </select>
              {form.imageMode === 'upload' && (
                <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              )}
            </label>
          ) : (
            <p className="hint">{brand.name} has no logo on file, so images are not compared. Add one on the Brands screen for a stronger check.</p>
          )}

          <button className="btn primary" disabled={busy} style={{ justifySelf: 'start' }}>{busy ? 'Checking…' : 'Check risk'}</button>

          <div>
            <p className="hint" style={{ marginBottom: 6 }}>
              {brand.isDemo ? 'Or load an example, then select Check risk.' : `Or load a sample built for ${brand.name}, then select Check risk.`}
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {examples[isApp ? 'app' : 'account'].map(([label, data]) => (
                <button type="button" className="btn" style={{ padding: '4px 10px', fontSize: 13 }} key={label} onClick={() => load(data)}>{label}</button>
              ))}
              <button type="button" className="btn" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => load(isApp ? blankApp : blankAccount)}>Clear form</button>
            </div>
          </div>
          {error && <p className="gate" role="alert">{error}</p>}
        </form>
        <div className="actions" style={{ paddingTop: 10 }}>
          <button type="button" className="btn" onClick={forget}>{cleared ? 'Earlier checks cleared' : `Forget earlier ${brand.name} checks`}</button>
        </div>
      </div>

      <div>
        {result ? (
          <>
            <Detail data={result} adhoc />
            {result.linkedCampaigns?.length > 0 && (
              <div className="linked" style={{ margin: '14px 0 0' }}>
                Shares indicators with {result.linkedCampaigns.map((l) => l.name).join(', ')}:{' '}
                {result.linkedCampaigns.flatMap((l) => l.shared.map((s) => `${s.type} ${s.value}`)).join('; ')}.
              </div>
            )}
            {result.relatedChecks?.length > 0 && (
              <div className="linked" style={{ margin: '14px 0 0' }}>
                <b>Linked to earlier checks.</b> It uses the same details as{' '}
                {result.relatedChecks.map((r) => `${r.title} (${r.shared.map((s) => `${s.type} ${s.value}`).join(', ')})`).join('; ')}.
                These are probably run by the same people.
              </div>
            )}
          </>
        ) : (
          <div className="panel empty">
            Fill in the details and select Check risk. You get a score, the evidence behind it, and whether it links to a known campaign or to something you checked earlier.
          </div>
        )}
      </div>
    </div>
  );
}
