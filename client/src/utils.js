// Money is integer lakhs everywhere (100 lakh = 1 Cr), same as the server.
export const cr = (lakh) => `₹ ${((lakh || 0) / 100).toFixed(2)} Cr`;
export const crShort = (lakh) => ((lakh || 0) / 100).toFixed(2);
export const increment = (c) => (c < 100 ? 5 : c < 200 ? 10 : c < 500 ? 20 : 25);
export const minBid = (live) => (live.currentBid > 0 ? live.currentBid + increment(live.currentBid) : live.basePrice);

export const ROLE_SHORT = { Batter: 'BAT', Bowler: 'BOWL', 'All-rounder': 'AR', Wicketkeeper: 'WK', Unassigned: '—' };
export const ROLE_KEYS = ['Batter', 'Bowler', 'All-rounder', 'Wicketkeeper'];
export const COUNTRY_CODE = {
  India: 'IND', Australia: 'AUS', England: 'ENG', 'New Zealand': 'NZ', 'South Africa': 'SA', 'Sri Lanka': 'SL',
  'West Indies': 'WI', Bangladesh: 'BAN', Afghanistan: 'AFG', Pakistan: 'PAK', Zimbabwe: 'ZIM', Ireland: 'IRE', Nepal: 'NEP',
};
export const cc = (c) => COUNTRY_CODE[c] || (c || '?').slice(0, 3).toUpperCase();

export const initials = (n = '') => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const ago = (d) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  return s < 60 ? `${s} sec ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} hr ago`;
};
export const teamColor = (teams, short) => teams?.find((t) => t.short === short)?.color || '#475569';

export function roleCounts(players) {
  const c = { Batter: 0, Bowler: 0, 'All-rounder': 0, Wicketkeeper: 0, Unassigned: 0 };
  players.forEach((p) => { c[p.role] = (c[p.role] || 0) + 1; });
  return c;
}

// Franchise city shown on the SOLD! popup
export const CITY = { CSK: 'Chennai', MI: 'Mumbai', RCB: 'Bengaluru', KKR: 'Kolkata', SRH: 'Hyderabad', RR: 'Rajasthan', PBKS: 'Punjab', DC: 'Delhi', LSG: 'Lucknow', GT: 'Gujarat' };

// "Team name (user)" label for the Squad section. The host sees their own team as "(You (Host))"; anyone else sees the
// host's team as "(<their name> (Host))" and every other human team as "(<name they entered>)". Bot teams show just the name.
export function teamLabel(t, { isHost, myTeamId }) {
  if (!t.claimed || !t.ownerName) return t.name;
  if (t.host) return `${t.name} (${isHost && t.team === myTeamId ? 'You' : t.ownerName} (Host))`;
  return `${t.name} (${t.ownerName})`;
}
