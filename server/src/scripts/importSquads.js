// Fetches current squads (name, role, country, image URLs) from iplt20.com, via the JSON endpoint the site squad tab calls,
// and writes server/src/scripts/squads.json, which the seed script loads into MongoDB.
// Run: node src/scripts/importSquads.js      (needs network; robots.txt allows /teams/)
const fs = require('fs');
const path = require('path');

const SLUGS = {
  CSK: 'chennai-super-kings', MI: 'mumbai-indians', RCB: 'royal-challengers-bengaluru', KKR: 'kolkata-knight-riders',
  SRH: 'sunrisers-hyderabad', RR: 'rajasthan-royals', PBKS: 'punjab-kings', DC: 'delhi-capitals', LSG: 'lucknow-super-giants', GT: 'gujarat-titans',
};
const ROLE = { batsman: 'Batter', batter: 'Batter', bowler: 'Bowler', allrounder: 'All-rounder', 'all-rounder': 'All-rounder', wicketkeeper: 'Wicketkeeper', 'wicket-keeper': 'Wicketkeeper' };

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
        image: p.imageUrl || null, imageThumb: p.imageUrlSet?.small || p.imageUrl || null, externalId: p.externalId, isCaptain: !!p.isCaptain,
        source: `https://www.iplt20.com/teams/${slug}/squad`,
      });
    }
    console.log(short, players.length);
    await new Promise((r) => setTimeout(r, 400));
  }
  fs.writeFileSync(path.join(__dirname, 'squads.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), players: out }, null, 1));
  console.log('total', out.length, 'with image', out.filter((p) => p.image).length);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
