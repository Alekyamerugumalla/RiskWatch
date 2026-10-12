import { buildState } from './engine/store.js';
import { evaluate } from './engine/evaluation.js';

const { analyses, campaigns } = buildState();
const r = evaluate(analyses, campaigns);
const pct = (x) => (x * 100).toFixed(1) + '%';

console.log('\nRiskWatch evaluation (flag threshold >= %d)', r.threshold);
console.log('Dataset:', r.dataset);
console.log('\nDetection  precision %s  recall %s  F1 %s', pct(r.detection.precision), pct(r.detection.recall), pct(r.detection.f1));
console.log('           TP %d  FP %d  FN %d  TN %d', r.detection.tp, r.detection.fp, r.detection.fn, r.detection.tn);
if (r.detection.falsePositives.length) console.log('False positives:', r.detection.falsePositives);
if (r.detection.falseNegatives.length) console.log('False negatives:', r.detection.falseNegatives);
console.log('\nThreshold sweep');
console.table(r.sweep.map((s) => ({ threshold: s.threshold, precision: pct(s.precision), recall: pct(s.recall), f1: pct(s.f1), FP: s.fp, FN: s.fn })));
console.log('Clustering  pair precision %s  pair recall %s  (%d campaigns found vs %d true)',
  pct(r.clustering.pairPrecision), pct(r.clustering.pairRecall), r.clustering.campaignsFound, r.clustering.groundTruthCampaigns);

console.log('\nAll entities by score:');
console.table(analyses.map((a) => ({ id: a.id, title: a.title.slice(0, 32), score: a.score, level: a.level, label: a.label, campaign: a.campaignId || '' })));
console.log('\n' + r.note);
