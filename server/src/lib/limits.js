const { HttpError } = require('./http');

// Allowed ranges for auction rules (same limits the engine enforces when an auction is created).
const LIMITS = {
  purse: [1000, 100000], // lakhs
  minSquad: [0, 40], maxSquad: [1, 40], maxOverseas: [0, 40],
  initialSeconds: [5, 120], resetSeconds: [3, 60], breakSeconds: [1, 20], poolSize: [0, 1000],
};

// Validates a partial settings change (numbers in range, known pool order, min <= max) and returns a cleaned copy.
function checkSettings(patch, current = {}) {
  const out = { ...patch };
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    if (out[k] === undefined) continue;
    const v = Number(out[k]);
    if (!Number.isFinite(v) || v < lo || v > hi) throw new HttpError(400, `${k} must be a number between ${lo} and ${hi}`);
    out[k] = Math.round(v);
  }
  if (out.poolOrder !== undefined && !['random', 'sequential', 'marquee'].includes(out.poolOrder)) throw new HttpError(400, 'poolOrder must be random, sequential or marquee');
  if ((out.minSquad ?? current.minSquad ?? 0) > (out.maxSquad ?? current.maxSquad)) throw new HttpError(400, 'minSquad cannot exceed maxSquad');
  return out;
}

module.exports = { LIMITS, checkSettings };
