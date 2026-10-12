// Precision / recall of the detector and quality of campaign clustering on the labelled dataset.

export const FLAG_THRESHOLD = 55;

function metrics(rows, threshold) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  const falsePositives = [], falseNegatives = [];
  for (const r of rows) {
    const flagged = r.score >= threshold;
    const fake = r.label === 'fake';
    if (flagged && fake) tp++;
    else if (flagged && !fake) { fp++; falsePositives.push(r); }
    else if (!flagged && fake) { fn++; falseNegatives.push(r); }
    else tn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { threshold, tp, fp, fn, tn, precision, recall, f1, falsePositives, falseNegatives };
}

export function evaluate(analyses, campaigns) {
  const rows = analyses.filter((a) => a.label === 'fake' || a.label === 'legit');
  const main = metrics(rows, FLAG_THRESHOLD);
  const sweep = [35, 45, 55, 65, 75].map((t) => {
    const m = metrics(rows, t);
    return { threshold: t, precision: m.precision, recall: m.recall, f1: m.f1, fp: m.fp, fn: m.fn };
  });

  // Pairwise clustering quality: among fakes that share a ground-truth campaign, were they grouped together?
  const truth = analyses.filter((a) => a.truthCampaign);
  const predicted = new Map();
  campaigns.forEach((c) => c.members.forEach((id) => predicted.set(id, c.id)));
  let tpPairs = 0, fpPairs = 0, fnPairs = 0;
  for (let i = 0; i < truth.length; i++) {
    for (let j = i + 1; j < truth.length; j++) {
      const sameTruth = truth[i].truthCampaign === truth[j].truthCampaign;
      const pi = predicted.get(truth[i].id), pj = predicted.get(truth[j].id);
      const samePred = pi && pj && pi === pj;
      if (sameTruth && samePred) tpPairs++;
      else if (!sameTruth && samePred) fpPairs++;
      else if (sameTruth && !samePred) fnPairs++;
    }
  }
  const cp = tpPairs + fpPairs ? tpPairs / (tpPairs + fpPairs) : 1;
  const cr = tpPairs + fnPairs ? tpPairs / (tpPairs + fnPairs) : 1;

  const strip = (r) => ({ id: r.id, title: r.title, score: r.score, level: r.level, label: r.label });
  return {
    dataset: {
      total: analyses.length,
      fake: analyses.filter((a) => a.label === 'fake').length,
      legit: analyses.filter((a) => a.label === 'legit').length,
      borderline: analyses.filter((a) => a.label === 'borderline').length,
    },
    threshold: FLAG_THRESHOLD,
    detection: {
      precision: main.precision, recall: main.recall, f1: main.f1,
      tp: main.tp, fp: main.fp, fn: main.fn, tn: main.tn,
      falsePositives: main.falsePositives.map(strip),
      falseNegatives: main.falseNegatives.map(strip),
    },
    sweep,
    clustering: { pairPrecision: cp, pairRecall: cr, campaignsFound: campaigns.length, groundTruthCampaigns: new Set(truth.map((t) => t.truthCampaign)).size },
    note: 'Synthetic, hand-labelled data written alongside the detector: a sanity check, not a real-world accuracy claim. Add real labelled cases to strengthen it.',
  };
}
