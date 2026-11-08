// Player Strength (0-100): a role-based score built ONLY from a player's real IPL career statistics.
//
// Every statistic is turned into a PERCENTILE against all IPL players who qualify (so "Strike rate 150" means the same
// thing for everyone, and nothing is hand-picked). Components are then weighted by the player's role:
//   Batter          90% batting  + 10% fielding
//   Wicketkeeper    75% batting  + 25% keeping/fielding
//   All-rounder     45% batting  + 45% bowling + 10% fielding
//   Bowler          90% bowling  + 10% fielding
// If a component has too little data it is left out and the remaining weights are rescaled. A player with no usable
// IPL record is NOT given a made-up number: he is "unrated" and is left out of team averages.
// Players with fewer than 30 IPL matches are pulled toward the league average in proportion, because a short record
// is weaker evidence than a long one.

const STAT_THRESHOLDS = {
  battingMinBalls: 100, battingMinDismissals: 3,   // to be rated as a batter
  bowlingMinBalls: 120, bowlingMinWickets: 3,      // to be rated as a bowler (20 overs)
  fieldingMinMatches: 5,                           // fielding is only used once there is a real sample
  fullConfidenceMatches: 30,
};

const BAT_W = { average: 22, strikeRate: 22, runs: 22, milestones: 17, boundaries: 17 };
const BOWL_W = { wickets: 25, economy: 25, average: 20, strikeRate: 15, best: 15 };
const ROLE_W = {
  Batter: { bat: 0.9, field: 0.1 },
  Wicketkeeper: { bat: 0.75, field: 0.25 },
  'All-rounder': { bat: 0.45, bowl: 0.45, field: 0.1 },
  Bowler: { bowl: 0.9, field: 0.1 },
};

const METHOD = [
  'Every figure is computed from IPL ball-by-ball data (Cricsheet.org, 2008 to the latest season).',
  `Batting (qualifies with ${STAT_THRESHOLDS.battingMinBalls}+ balls faced): batting average ${BAT_W.average}%, strike rate ${BAT_W.strikeRate}%, total runs ${BAT_W.runs}%, milestones (100s count double 50s) ${BAT_W.milestones}%, boundaries (fours + 1.5 x sixes) ${BAT_W.boundaries}%.`,
  `Bowling (qualifies with ${STAT_THRESHOLDS.bowlingMinBalls}+ balls bowled): wickets ${BOWL_W.wickets}%, economy ${BOWL_W.economy}%, bowling average ${BOWL_W.average}%, bowling strike rate ${BOWL_W.strikeRate}%, best figures ${BOWL_W.best}%.`,
  'Fielding: catches + 2 x stumpings + run outs, per match.',
  'Each statistic is ranked as a percentile against every qualifying IPL player (lower is better for bowling average, economy and strike rate).',
  'Role weights: Batter 90/10 batting/fielding; Wicketkeeper 75/25 batting/keeping; All-rounder 45/45/10 batting/bowling/fielding; Bowler 90/10 bowling/fielding.',
  `Players with fewer than ${STAT_THRESHOLDS.fullConfidenceMatches} IPL matches are pulled toward 50 in proportion to how short their record is.`,
  'A player with no usable IPL record is "unrated" and is left out of team averages.',
];

// ---- raw metrics from the aggregated career object (s.bat / s.bowl / s.field / s.matches) ----
function batMetrics(s) {
  const b = s.bat;
  if (b.balls < STAT_THRESHOLDS.battingMinBalls || b.outs < STAT_THRESHOLDS.battingMinDismissals) return null;
  return { average: b.runs / b.outs, strikeRate: (b.runs * 100) / b.balls, runs: b.runs, milestones: b.hundreds * 2 + b.fifties, boundaries: b.fours + 1.5 * b.sixes };
}
function bowlMetrics(s) {
  const w = s.bowl;
  if (w.balls < STAT_THRESHOLDS.bowlingMinBalls || w.wkts < STAT_THRESHOLDS.bowlingMinWickets) return null;
  return { wickets: w.wkts, economy: (w.runs * 6) / w.balls, average: w.runs / w.wkts, strikeRate: w.balls / w.wkts, best: w.bestW * 1000 - w.bestR };
}
function fieldMetric(s) {
  if (s.matches < STAT_THRESHOLDS.fieldingMinMatches) return null;
  return (s.field.catches + 2 * s.field.stumpings + s.field.runouts) / s.matches;
}

const LOWER_IS_BETTER = new Set(['economy', 'average@bowl', 'strikeRate@bowl']);

// sorted reference arrays of every metric across the qualifying population
function percentileTable(players, T = STAT_THRESHOLDS) {
  const t = { bat: {}, bowl: {}, field: [] };
  for (const s of players) {
    const b = batMetrics(s); if (b) for (const [k, v] of Object.entries(b)) (t.bat[k] ||= []).push(v);
    const w = bowlMetrics(s); if (w) for (const [k, v] of Object.entries(w)) (t.bowl[k] ||= []).push(v);
    const f = fieldMetric(s); if (f !== null && s.matches >= 15) t.field.push(f);
  }
  for (const g of [t.bat, t.bowl]) for (const k of Object.keys(g)) g[k].sort((a, b) => a - b);
  t.field.sort((a, b) => a - b);
  return t;
}

// percentile (0-100) of v inside the sorted array; ties count half
function pct(v, arr, lowerBetter) {
  if (!arr || !arr.length) return null;
  let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; }
  const less = lo; hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m + 1; else hi = m; }
  const p = ((less + (lo - less) / 2) / arr.length) * 100;
  return lowerBetter ? 100 - p : p;
}
const wavg = (parts) => { let n = 0, d = 0; for (const [v, w] of parts) { if (v === null) continue; n += v * w; d += w; } return d ? n / d : null; };
const r1 = (x) => Math.round(x * 10) / 10;

// s: aggregated career (bat/bowl/field/matches). Returns { strength: number|null, breakdown, note }
function strengthFor(role, s, table) {
  const weights = ROLE_W[role];
  if (!weights) return { strength: null, breakdown: null, note: 'Role unknown' };
  const bm = batMetrics(s), wm = bowlMetrics(s), fm = fieldMetric(s);
  const batScore = bm ? wavg(Object.entries(BAT_W).map(([k, w]) => [pct(bm[k], table.bat[k], false), w])) : null;
  const bowlScore = wm ? wavg(Object.entries(BOWL_W).map(([k, w]) => [pct(wm[k], table.bowl[k], ['economy', 'average', 'strikeRate'].includes(k)), w])) : null;
  const fieldScore = fm !== null ? pct(fm, table.field, false) : null;
  const comp = { bat: batScore, bowl: bowlScore, field: fieldScore };
  // the discipline(s) a role is judged on must have data; fielding alone is never enough
  const primary = ['bat', 'bowl'].filter((k) => weights[k]);
  if (!primary.some((k) => comp[k] !== null)) {
    const why = s.matches === 0 ? 'No IPL appearances' : `Not enough IPL ${primary.includes('bat') && primary.includes('bowl') ? 'batting or bowling' : primary[0] === 'bat' ? 'batting' : 'bowling'} data yet`;
    return { strength: null, breakdown: null, note: why };
  }
  const raw = wavg(Object.keys(weights).map((k) => [comp[k], weights[k]]));
  const confidence = Math.min(1, s.matches / STAT_THRESHOLDS.fullConfidenceMatches);
  const strength = r1(Math.max(0, Math.min(100, 50 + (raw - 50) * confidence)));
  return {
    strength,
    breakdown: { batting: batScore === null ? null : r1(batScore), bowling: bowlScore === null ? null : r1(bowlScore), fielding: fieldScore === null ? null : r1(fieldScore), weights, confidence: r1(confidence * 100) / 100 },
    note: confidence < 1 ? `Short IPL record (${s.matches} matches): score is pulled toward 50` : null,
  };
}

module.exports = { STAT_THRESHOLDS, METHOD, BAT_W, BOWL_W, ROLE_W, percentileTable, strengthFor, LOWER_IS_BETTER };
