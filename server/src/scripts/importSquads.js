// Fetches current squads (name, role, country, image URLs) from iplt20.com, via the JSON endpoint the site squad tab calls,
// and writes server/src/scripts/squads.json, which the seed script loads into MongoDB.
// Run: node src/scripts/importSquads.js      (needs network; robots.txt allows /teams/ and /players/)
// Also reads each player's official profile facts (born, batting style, bowling style, IPL debut) from his profile page.
const fs = require('fs');
const path = require('path');

const SLUGS = {
  CSK: 'chennai-super-kings', MI: 'mumbai-indians', RCB: 'royal-challengers-bengaluru', KKR: 'kolkata-knight-riders',
  SRH: 'sunrisers-hyderabad', RR: 'rajasthan-royals', PBKS: 'punjab-kings', DC: 'delhi-capitals', LSG: 'lucknow-super-giants', GT: 'gujarat-titans',
};
const ROLE = { batsman: 'Batter', batter: 'Batter', bowler: 'Bowler', allrounder: 'All-rounder', 'all-rounder': 'All-rounder', wicketkeeper: 'Wicketkeeper', 'wicket-keeper': 'Wicketkeeper' };

// Profile facts from the official player page (the same data the page itself renders)
const FACT = (txt, key) => {
  const m = txt.match(new RegExp('"div","' + key + '",[\\s\\S]{0,900}?"children":\\[null,"([^"]*)"\\]'));
  return m ? m[1].trim() || null : null;
};
async function profile(p) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`https://www.iplt20.com/players/${p.playerGid}/${p.slug}/biography?_rsc=1`, { headers: { 'user-agent': 'Mozilla/5.0 (ipl-auction-importer)', rsc: '1', accept: 'text/x-component' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const txt = (await res.text()).replace(/\\"/g, '"');
      return { born: FACT(txt, 'Born'), battingStyle: FACT(txt, 'Batting Style'), bowlingStyle: FACT(txt, 'Bowling Style'), iplDebut: parseInt(FACT(txt, 'IPL Debut'), 10) || null };
    } catch (e) { if (attempt === 3) return { born: null, battingStyle: null, bowlingStyle: null, iplDebut: null, error: e.message }; await new Promise((r) => setTimeout(r, 1000 * attempt)); }
  }
}

async function main() {
  const out = [];
  for (const [short, slug] of Object.entries(SLUGS)) {
    const res = await fetch(`https://www.iplt20.com/api/bff/cms/teams/${slug}?tab=squad`, { headers: { 'user-agent': 'Mozilla/5.0 (ipl-auction-importer)' } });
    if (!res.ok) throw new Error(`${short}: HTTP ${res.status}`);
    const players = (await res.json())?.data?.squad?.players;
    if (!players?.length) throw new Error(`${short}: squad not found in page`);
    for (const p of players) {
      out.push({
        name: p.name, team: short, country: p.country, isOverseas: !!p.isInternational,
        role: p.isWicketKeeper ? 'Wicketkeeper' : ROLE[String(p.role).toLowerCase().replace(/[\s_]/g, '')] || 'Unassigned',
        image: p.imageUrl || null, imageThumb: p.imageUrlSet?.small || p.imageUrl || null, externalId: p.externalId, playerGid: p.playerGid, slug: p.slug, jersey: p.jerseyNumber || null, isCaptain: !!p.isCaptain,
        source: `https://www.iplt20.com/teams/${slug}/squad`,
      });
    }
    console.log(short, players.length);
    await new Promise((r) => setTimeout(r, 400));
  }
  let done = 0, failed = 0;
  for (const p of out) {
    const f = await profile(p); Object.assign(p, f); if (f.error) failed++;
    if (++done % 50 === 0) console.log('profiles', done, '/', out.length);
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log('profiles read:', out.length - failed, 'failed:', failed, '| with a born date:', out.filter((p) => p.born).length, '| with an IPL debut year:', out.filter((p) => p.iplDebut).length);
  fs.writeFileSync(path.join(__dirname, 'squads.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), players: out }, null, 1));
  console.log('total', out.length, 'with image', out.filter((p) => p.image).length);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
