# RiskWatch: brand impersonation and scam monitor

Built for HacXLerate Challenge 03 (Digital Risk Protection). RiskWatch checks social accounts and mobile apps against
**any brand you configure**, scores each one with explainable evidence, links scams that share details, and drafts takedown reports.
FreshKart (a fictional grocery-delivery company) is built in as a demo brand with a monitored dataset.

## Run it

```bash
npm run install:all     # once
npm run build           # builds the dashboard
npm start               # http://localhost:4000 (API + dashboard)
npm run eval            # precision / recall on the labelled FreshKart test set
```

For development run `npm start` in `server/` and `npm run dev` in `client/` (http://localhost:5173).

## Using it for any brand

1. **Brands** tab: enter the brand name, short names people use (for example SBI), official handles, official website, support
   phone numbers and (optionally) a logo and official app details. The logo is turned into a 64-bit image fingerprint in the browser.
   Brands are saved to `server/data/custom-brands.json`.
2. **Check now** tab: pick the brand, copy the details from the profile or app listing you want to check, and select **Check risk**.
   Each tab offers sample inputs generated for the selected brand.
3. Optionally upload the profile picture or app icon. It is compared with the brand logo by image fingerprint.
4. Every flagged check is remembered per brand. A later check that shares a link, phone number, UPI ID or file with an earlier one
   is reported as linked to it (probably the same operator). "Forget earlier checks" clears this.

Review queue, Campaigns and Accuracy always show the FreshKart demo data.

## How scoring works

- **Accounts:** handle look-alikes (homoglyphs such as `fr3shkart`, near-miss spellings), display-name cloning, logo similarity,
  impersonation keywords, account behaviour, link risk and a scam-message classifier.
- **Apps:** name/package look-alikes, icon match, distribution source, dangerous permissions and signer mismatch.
- **Missing details are skipped, not guessed.** A blank field removes that check and the score is rescaled over the checks that ran.
- **Score** is out of 100. A brand-resemblance gate caps accounts that do not resemble the brand, and mitigating factors
  (for example "unofficial fan page") lower it. Levels: Low <35, Medium 35-54, High 55-74, Critical 75+.
- **Short brand names** (4 letters or fewer) must match a whole word, so "Ola" does not flag "cola" or "hola".
- **An app is trusted only with proof of origin** (matching signing certificate and developer). A matching package name alone is not
  enough, because repackaged malware reuses it.
- **Campaigns:** flagged assets that share a link, phone number, UPI ID or file hash are grouped.
- **Action:** one-click takedown drafts. A human analyst confirms or dismisses every flag.

## Honest limits

- **No scraping.** RiskWatch does not fetch profiles from platforms (it breaks their terms and is brittle). The analyst pastes the
  details, or a production version would feed the same record shape from platform APIs or partner data.
- **Image comparison is a fingerprint, not a vision model.** It catches the same logo resized, recompressed or lightly edited. A heavily
  redrawn, cropped or recoloured copy can slip past it.
- **The scam classifier is rule-based** (transparent and fast) and tuned for common Indian scam wording (OTP, KYC, UPI, fee requests).
  An LLM classifier is the natural upgrade, behind the same interface in `server/engine/scamText.js`.
- **A scam that does not use the brand is capped at a low score.** This is a brand-impersonation tool, not a general scam detector.
- **The accuracy numbers come from the FreshKart test set**, which was written alongside the detector. It is a sanity check, not a
  real-world claim. Add real labelled cases before quoting it.
- Review decisions and earlier checks are held in memory and reset when the server restarts. Brands are saved to disk.

## Layout

```
server/engine/   similarity, scamText, indicators, analyze (signals + scoring), brands, campaigns, takedown, evaluation
server/data/     demo brand and labelled FreshKart dataset (custom brands are saved here too)
server/index.js  REST API
client/src/      React dashboard (queue, campaigns, check now, brands, accuracy)
```
