// Builds server/src/scripts/playerStats.json: real IPL career statistics + a role-based Strength score (0-100) for
// every player in squads.json. Run: node src/scripts/buildStats.js [path-to-ipl_json.zip]   (downloads it if not given)
//
// DATA SOURCE: Cricsheet.org ball-by-ball IPL data (https://cricsheet.org/downloads/ipl_json.zip), published for public
// use under the Open Data Commons Attribution License (credit Cricsheet). Every figure below is computed from those
// deliveries, so it can be re-checked. (Cricbuzz forbids automated access in its robots.txt, so it is not used.)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { STAT_THRESHOLDS, METHOD, strengthFor, estimateStrength, percentileTable, performanceSignal } = require('../lib/strength');

const ZIP_URL = 'https://cricsheet.org/downloads/ipl_json.zip';
const squads = require('./squads.json').players;
const { slugify, results: AUCTION_RESULTS } = require('./seedData');

// ---------- minimal zip reader (no dependency) ----------
function* zipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Bad zip directory');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const ls = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const raw = buf.subarray(ls, ls + csize);
    yield { name, data: () => (method === 8 ? zlib.inflateRawSync(raw) : raw) };
    p += 46 + nlen + elen + clen;
  }
}

// ---------- aggregate ball-by-ball into career stats ----------
const BOWLER_WICKET = new Set(['bowled', 'caught', 'lbw', 'stumped', 'caught and bowled', 'hit wicket']);
const NOT_OUT = new Set(['retired hurt', 'retired not out']);
const blank = (name) => ({
  name, matches: 0, seasons: new Set(), teams: new Set(), lastSeason: 0, lastTeams: new Set(),
  bat: { inns: 0, runs: 0, balls: 0, outs: 0, fours: 0, sixes: 0, fifties: 0, hundreds: 0, hs: 0 },
  bowl: { inns: 0, balls: 0, runs: 0, wkts: 0, bestW: 0, bestR: 0, fourW: 0, fiveW: 0 },
  field: { catches: 0, stumpings: 0, runouts: 0 },
});

function aggregate(files) {
  const P = new Map(); // cricsheet id -> stats
  const get = (id, name) => { let x = P.get(id); if (!x) { x = blank(name); P.set(id, x); } return x; };
  let matches = 0;
  for (const m of files) {
    if (m.info.gender !== 'male') continue;
    matches++;
    const reg = m.info.registry.people;
    const season = parseInt(String(m.info.season).slice(0, 4), 10) || 0;
    const idOf = (n) => reg[n];
    for (const [team, names] of Object.entries(m.info.players || {})) for (const n of names) {
      const id = idOf(n); if (!id) continue;
      const s = get(id, n); s.matches++; s.seasons.add(season); s.teams.add(team);
      if (season > s.lastSeason) { s.lastSeason = season; s.lastTeams = new Set(); }
      if (season === s.lastSeason) s.lastTeams.add(team);
    }
    for (const inn of m.innings || []) {
      if (inn.super_over) continue; // super overs are not part of career figures
      const bat = new Map(), bowl = new Map();
      for (const ov of inn.overs || []) for (const d of ov.deliveries || []) {
        const bId = idOf(d.batter), boId = idOf(d.bowler); if (!bId || !boId) continue;
        const ex = d.extras || {}, wide = ex.wides > 0, nb = ex.noballs > 0;
        const b = bat.get(bId) || bat.set(bId, { runs: 0, balls: 0, out: false }).get(bId);
        const bo = bowl.get(boId) || bowl.set(boId, { balls: 0, runs: 0, wk: 0 }).get(boId);
        const bs = get(bId, d.batter), bws = get(boId, d.bowler);
        b.runs += d.runs.batter;
        if (!wide) b.balls++;
        if (!d.runs.non_boundary) { if (d.runs.batter === 4) bs.bat.fours++; else if (d.runs.batter === 6) bs.bat.sixes++; }
        if (!wide && !nb) bo.balls++;
        bo.runs += d.runs.total - (ex.byes || 0) - (ex.legbyes || 0) - (ex.penalty || 0);
        const nsId = idOf(d.non_striker); if (nsId && !bat.has(nsId)) bat.set(nsId, { runs: 0, balls: 0, out: false, nonFacing: true });
        for (const w of d.wickets || []) {
          const outId = idOf(w.player_out);
          if (outId) { const o = bat.get(outId) || bat.set(outId, { runs: 0, balls: 0, out: false }).get(outId); if (!NOT_OUT.has(w.kind)) o.out = true; }
          if (BOWLER_WICKET.has(w.kind)) bo.wk++;
          const fielders = (w.fielders || []).filter((f) => !f.substitute && f.name);
          if (w.kind === 'caught') for (const f of fielders) { const fid = idOf(f.name); if (fid) get(fid, f.name).field.catches++; }
          else if (w.kind === 'caught and bowled') get(boId, d.bowler).field.catches++;
          else if (w.kind === 'stumped') for (const f of fielders) { const fid = idOf(f.name); if (fid) get(fid, f.name).field.stumpings++; }
          else if (w.kind === 'run out') for (const f of fielders) { const fid = idOf(f.name); if (fid) get(fid, f.name).field.runouts++; }
        }
      }
      for (const [id, b] of bat) {
        if (b.nonFacing && !b.out && b.balls === 0) continue; // never came to the crease
        if (b.balls === 0 && !b.out) continue;
        const s = P.get(id).bat;
        s.inns++; s.runs += b.runs; s.balls += b.balls; if (b.out) s.outs++;
        if (b.runs >= 100) s.hundreds++; else if (b.runs >= 50) s.fifties++;
        s.hs = Math.max(s.hs, b.runs);
      }
      for (const [id, bo] of bowl) {
        const s = P.get(id).bowl;
        s.inns++; s.balls += bo.balls; s.runs += bo.runs; s.wkts += bo.wk;
        if (bo.wk > s.bestW || (bo.wk === s.bestW && bo.runs < s.bestR)) { s.bestW = bo.wk; s.bestR = bo.runs; }
        if (bo.wk >= 5) s.fiveW++; else if (bo.wk === 4) s.fourW++;
      }
    }
  }
  return { P, matches };
}

// ---------- name matching: squad name ("Virat Kohli") <-> Cricsheet name ("V Kohli") ----------
const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
const PARTICLES = new Set(['de', 'van', 'der', 'du', 'le', 'la', 'da', 'di', 'al', 'bin', 'ul', 'von', 'dos']);
function split(name) {
  const t = strip(name).split(' ').filter(Boolean);
  let i = t.length - 1; const sur = [t[i]];
  while (i > 1 && PARTICLES.has(t[i - 1])) { sur.unshift(t[--i]); }
  return { given: t.slice(0, i), sur: sur.join(' ') };
}
const initialsOf = (given) => given.map((g) => g[0]).join('');
// 0 = identical name, 1 = same initials ("Rahul Chahar" ~ "R Chahar"), 2 = our given name appears in theirs
// ("Sai Sudharsan" ~ "B Sai Sudharsan"), 3 = our initials are only a prefix of theirs ("Rohit Sharma" ~ "RG Sharma").
function compat(ours, theirs) {
  if (strip(ours.name) === strip(theirs.name)) return 0;
  const a = split(ours.name), b = split(theirs.name);
  if (a.sur !== b.sur) return null;
  const ai = initialsOf(a.given);
  const bi = b.given.length === 1 && b.given[0].length <= 4 ? b.given[0] : null; // initials only, e.g. "ms"
  if (bi) { if (ai === bi) return 1; if (bi.startsWith(ai) || ai.startsWith(bi)) return 3; return null; }
  const first = a.given[0];
  if (first && b.given.some((g) => g.length > 2 && (g.startsWith(first) || first.startsWith(g)))) return 2;
  return null;
}

const OVERRIDES = fs.existsSync(path.join(__dirname, 'statsOverrides.json')) ? require('./statsOverrides.json') : { match: {}, none: [] };

function matchPlayers(P) {
  const out = {}; const report = { exact: 0, initials: 0, fullname: 0, prefix: 0, override: 0, ambiguous: [], none: [], teamRejected: [] };
  const all = [...P.entries()].map(([id, s]) => ({ id, name: s.name, s }));
  const bySur = new Map();
  for (const c of all) { const k = split(c.name).sur; (bySur.get(k) || bySur.set(k, []).get(k)).push(c); }
  const newest = Math.max(...all.map((c) => c.s.lastSeason));
  // In the newest season a player can only have worn his current franchise's colours (squads are post-auction).
  const wrongTeam = (c, p) => c.s.lastSeason === newest && c.s.lastTeams.size && ![...c.s.lastTeams].some((t) => teamMatches(t, p.team));
  for (const p of squads) {
    const slug = slugify(p.name);
    if (OVERRIDES.none.includes(p.name)) { report.none.push(p.name + ' (override)'); continue; }
    if (OVERRIDES.match[p.name]) { const c = all.find((x) => x.id === OVERRIDES.match[p.name]); if (c) { out[slug] = c; report.override++; continue; } }
    let cands = (bySur.get(split(p.name).sur) || []).map((c) => ({ c, r: compat(p, { name: c.name }) })).filter((x) => x.r !== null);
    cands = cands.filter((x) => x.r <= 2 || x.c.s.lastSeason >= 2024); // a weak (initials-prefix) match must be a recent player
    if (!cands.length) { report.none.push(p.name); continue; }
    const exact = cands.filter((x) => x.r === 0);
    let pool = exact.length ? exact : cands;
    pool = pool.filter((x) => !wrongTeam(x.c, p));
    if (!pool.length) { report.teamRejected.push(`${p.name} (${p.team}) not ${cands.map((x) => x.c.name + ' [' + [...x.c.s.lastTeams].join('/') + ' ' + x.c.s.lastSeason + ']').join(' | ')}`); report.none.push(p.name + ' (namesake played for another team)'); continue; }
    if (pool.length > 1) { const active = pool.filter((x) => x.c.s.lastSeason >= newest - 1); if (active.length) pool = active; }
    if (pool.length > 1) { const best = Math.min(...pool.map((x) => x.r)); pool = pool.filter((x) => x.r === best); }
    if (pool.length > 1) { const onTeam = pool.filter((x) => x.c.s.lastSeason === newest && [...x.c.s.lastTeams].some((t) => teamMatches(t, p.team))); if (onTeam.length) pool = onTeam; }
    if (pool.length !== 1) { report.ambiguous.push(`${p.name} (${p.team}): ${pool.map((x) => x.c.name + ' [' + x.c.s.matches + 'm, last ' + x.c.s.lastSeason + ']').join(' | ')}`); continue; }
    out[slug] = pool[0].c; report[['exact', 'initials', 'fullname', 'prefix'][pool[0].r]]++;
  }
  return { out, report };
}
const TEAM_WORDS = { CSK: ['chennai'], MI: ['mumbai'], RCB: ['royal challengers', 'bengaluru', 'bangalore'], KKR: ['kolkata'], SRH: ['sunrisers', 'deccan'], RR: ['rajasthan'], PBKS: ['punjab', 'kings xi'], DC: ['delhi'], LSG: ['lucknow'], GT: ['gujarat titans'] };
const teamMatches = (full, short) => (TEAM_WORDS[short] || []).some((w) => full.toLowerCase().includes(w));

// ---------- main ----------
const findArg = process.argv.find((a) => a.startsWith('--find='));
(async () => {
  const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const zipBuf = arg ? fs.readFileSync(arg) : Buffer.from(await (await fetch(ZIP_URL, { headers: { 'user-agent': 'ipl-auction-stats-builder' } })).arrayBuffer());
  const files = [];
  for (const e of zipEntries(zipBuf)) if (e.name.endsWith('.json')) files.push(JSON.parse(e.data().toString('utf8')));
  console.log('matches in file:', files.length);
  const { P, matches } = aggregate(files);
  const seasons = [...new Set(files.map((f) => String(f.info.season)))].sort();
  console.log('male matches:', matches, '| players with any appearance:', P.size, '| seasons', seasons[0], '...', seasons[seasons.length - 1]);

  if (findArg) { // dev helper: --find=name1,name2 prints who Cricsheet knows under those names
    for (const q of findArg.slice(7).split(',')) {
      const hits = [...P.entries()].filter(([, s]) => strip(s.name).includes(strip(q)));
      console.log(q.padEnd(14), hits.length ? hits.map(([id, s]) => `${s.name} [${id}] ${s.matches}m last ${s.lastSeason} ${[...s.lastTeams].join('/')}`).join('  ||  ') : '-- none');
    }
    return;
  }
  const table = percentileTable([...P.values()], STAT_THRESHOLDS); // reference population = every IPL player who qualifies
  const { out, report } = matchPlayers(P);
  const players = {};
  const draft = [];
  for (const p of squads) {
    const slug = slugify(p.name), c = out[slug];
    if (!c) { players[slug] = { matched: false }; draft.push({ p, slug, s: null }); continue; }
    const s = c.s;
    const stats = {
      matches: s.matches, seasons: s.seasons.size, firstSeason: Math.min(...s.seasons), lastSeason: s.lastSeason,
      batting: { innings: s.bat.inns, runs: s.bat.runs, balls: s.bat.balls, dismissals: s.bat.outs, average: s.bat.outs ? +(s.bat.runs / s.bat.outs).toFixed(2) : null, strikeRate: s.bat.balls ? +(s.bat.runs * 100 / s.bat.balls).toFixed(2) : null, hundreds: s.bat.hundreds, fifties: s.bat.fifties, fours: s.bat.fours, sixes: s.bat.sixes, highScore: s.bat.hs },
      bowling: { innings: s.bowl.inns, balls: s.bowl.balls, overs: `${Math.floor(s.bowl.balls / 6)}.${s.bowl.balls % 6}`, runs: s.bowl.runs, wickets: s.bowl.wkts, average: s.bowl.wkts ? +(s.bowl.runs / s.bowl.wkts).toFixed(2) : null, economy: s.bowl.balls ? +(s.bowl.runs * 6 / s.bowl.balls).toFixed(2) : null, strikeRate: s.bowl.wkts ? +(s.bowl.balls / s.bowl.wkts).toFixed(2) : null, best: s.bowl.bestW || s.bowl.balls ? `${s.bowl.bestW}/${s.bowl.bestR}` : null, fourW: s.bowl.fourW, fiveW: s.bowl.fiveW },
      fielding: { catches: s.field.catches, stumpings: s.field.stumpings, runOuts: s.field.runouts },
    };
    const r = strengthFor(p.role, s, table);
    players[slug] = { matched: true, cricsheetId: c.id, cricsheetName: c.name, stats, strength: r.strength, kind: r.strength === null ? null : 'stats', breakdown: r.breakdown, rated: r.strength !== null, note: r.note };
    draft.push({ p, slug, s });
  }
  // role priors for estimates: median strength of NEWER stats-rated players (30 matches or fewer) in the same role
  const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? (b[b.length >> 1] + b[(b.length - 1) >> 1]) / 2 : null; };
  const pool = draft.filter((d) => d.s && players[d.slug].rated && d.s.matches <= STAT_THRESHOLDS.fullConfidenceMatches);
  const rolePrior = { all: median(pool.map((d) => players[d.slug].strength)) };
  // each role's baseline is blended halfway toward the overall baseline, so a role that merely HAPPENS to have weaker newcomers in the data is not unfairly penalised
  for (const r of ['Batter', 'Bowler', 'All-rounder', 'Wicketkeeper']) { const m = median(pool.filter((d) => d.p.role === r).map((d) => players[d.slug].strength)); rolePrior[r] = m == null ? rolePrior.all : (m + rolePrior.all) / 2; }
  console.log('role priors for estimates:', JSON.stringify(rolePrior));
  let estimated = 0;
  for (const d of draft) {
    const x = players[d.slug];
    if (x.rated) continue;
    const price = AUCTION_RESULTS.get(d.p.name.toLowerCase());
    const e = estimateStrength(d.p.role, { matches: d.s ? d.s.matches : 0, priceCr: price ? price.price / 100 : null, perf: performanceSignal(d.p.role, d.s, table) }, rolePrior);
    Object.assign(x, { strength: e.strength, kind: 'estimated', breakdown: e.breakdown, note: e.note, estimated: true });
    estimated++;
  }
  console.log('estimated players:', estimated);
  const rated = Object.values(players).filter((x) => x.rated).length;
  console.log(`strength for every player: ${Object.values(players).filter((x) => typeof x.strength === 'number').length} of ${squads.length} (${rated} from stats, ${estimated} estimated)`);
  const doc = {
    source: { name: 'Cricsheet.org ball-by-ball IPL data', url: ZIP_URL, license: 'Open Data Commons Attribution License (ODC-By)', licenseUrl: 'https://opendatacommons.org/licenses/by/1-0/', matches, seasons: [seasons[0], seasons[seasons.length - 1]], generatedAt: new Date().toISOString() },
    method: METHOD, thresholds: STAT_THRESHOLDS, players,
  };
  fs.writeFileSync(path.join(__dirname, 'playerStats.json'), JSON.stringify(doc, null, 1));
  console.log(`\nmatching: ${report.exact} exact, ${report.initials} same-initials, ${report.fullname} full-given-name, ${report.prefix} initials-prefix, ${report.override} override | ambiguous ${report.ambiguous.length} | no IPL record ${report.none.length}`);
  if (report.ambiguous.length) console.log('AMBIGUOUS:\n  ' + report.ambiguous.join('\n  '));
  if (report.teamRejected.length) console.log('REJECTED (same name, different 2026 team):\n  ' + report.teamRejected.join('\n  '));
  console.log(`rated players: ${rated} of ${squads.length}`);
  if (process.argv.includes('--report')) fs.writeFileSync(path.join(__dirname, '_match-report.json'), JSON.stringify({ report, matched: Object.fromEntries(squads.filter((p) => out[slugify(p.name)]).map((p) => [p.name, `${out[slugify(p.name)].name} [${out[slugify(p.name)].s.matches}m, last ${out[slugify(p.name)].s.lastSeason}]`])) }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
