// DATA SOURCES
// 1) Squad (name, role, country, image) -> iplt20.com team squad pages, fetched by importSquads.js into squads.json.
// 2) 2026 auction results (buying franchise + final price for 71 players) -> official IPL site:
//    https://www.ipl.com/cricket/news/ipl-2026-auction-complete-list-of-players-bought-and-prices/
// NOT available from either source (so NOT official here): base prices, previous teams, career stats, unsold list.
//    Base price is ESTIMATED at auction time and flagged basePriceVerified:false.
const SOURCE = 'https://www.ipl.com/cricket/news/ipl-2026-auction-complete-list-of-players-bought-and-prices/';
const SEED_VERSION = 2;

const TEAMS = [
  { short: 'CSK', name: 'Chennai Super Kings', color: '#f7b500', accent: '#1b1b1b' },
  { short: 'MI', name: 'Mumbai Indians', color: '#0b5ed7', accent: '#ffffff' },
  { short: 'RCB', name: 'Royal Challengers Bengaluru', color: '#d32027', accent: '#ffffff' },
  { short: 'KKR', name: 'Kolkata Knight Riders', color: '#5b3a9a', accent: '#f7b500' },
  { short: 'SRH', name: 'Sunrisers Hyderabad', color: '#f26522', accent: '#ffffff' },
  { short: 'RR', name: 'Rajasthan Royals', color: '#e91e8c', accent: '#ffffff' },
  { short: 'PBKS', name: 'Punjab Kings', color: '#d71920', accent: '#ffffff' },
  { short: 'DC', name: 'Delhi Capitals', color: '#1c6fd1', accent: '#ffffff' },
  { short: 'LSG', name: 'Lucknow Super Giants', color: '#2aa7df', accent: '#ffffff' },
  { short: 'GT', name: 'Gujarat Titans', color: '#c8a24a', accent: '#1b2a49' },
];

const PRESETS = [
  { key: 'mini', label: 'Mini Auction', description: '₹90 Cr purse, up to 18 players per team, random order.', purse: 9000, minSquad: 0, maxSquad: 18, maxOverseas: 8, initialSeconds: 20, resetSeconds: 20, breakSeconds: 4, poolSize: 0, poolOrder: 'random' },
  { key: 'mega', label: 'Mega Auction', description: '₹120 Cr purse, 18-25 players per team, marquee players first.', purse: 12000, minSquad: 18, maxSquad: 25, maxOverseas: 8, initialSeconds: 20, resetSeconds: 20, breakSeconds: 4, poolSize: 0, poolOrder: 'marquee' },
  { key: 'rapid', label: 'Rapid Auction', description: 'Short timers and a 30-player pool for a quick game.', purse: 5000, minSquad: 0, maxSquad: 12, maxOverseas: 4, initialSeconds: 10, resetSeconds: 10, breakSeconds: 2, poolSize: 30, poolOrder: 'random' },
];

// name | franchise | price (Cr)   (role/country columns removed: they now come from the official squads)
const RAW = `
Cameron Green|KKR|25.2|A|Australia
Matheesha Pathirana|KKR|18|L|Sri Lanka
Prashant Veer|CSK|14.2|A|India
Kartik Sharma|CSK|14.2|W|India
Liam Livingstone|SRH|13|A|England
Mustafizur Rahman|KKR|9.2|L|Bangladesh
Josh Inglis|LSG|8.6|W|Australia
Auqib Dar|DC|8.4|L|India
Venkatesh Iyer|RCB|7|A|India
Jason Holder|GT|7|A|West Indies
Ravi Bishnoi|RR|7.2|L|India
Rahul Chahar|CSK|5.2|L|India
Mangesh Yadav|RCB|5.2|?|India
Pathum Nissanka|DC|4|B|Sri Lanka
Cooper Connolly|PBKS|3|A|Australia
Tejasvi Singh|KKR|3|?|India
Jack Edwards|SRH|3|A|Australia
Akshat Raghuwanshi|LSG|2.2|B|India
Adam Milne|RR|2.4|L|New Zealand
David Miller|DC|2|B|South Africa
Wanindu Hasaranga|LSG|2|A|Sri Lanka
Ben Duckett|DC|2|B|England
Finn Allen|KKR|2|B|New Zealand
Jacob Duffy|RCB|2|L|New Zealand
Anrich Nortje|LSG|2|L|South Africa
Akeal Hosein|CSK|2|L|West Indies
Matt Henry|CSK|2|L|New Zealand
Lungi Ngidi|DC|2|L|South Africa
Kyle Jamieson|DC|2|L|New Zealand
Tom Banton|GT|2|B|England
Matthew Short|CSK|1.5|A|Australia
Tim Seifert|KKR|1.5|W|New Zealand
Quinton de Kock|MI|1|W|South Africa
Naman Tiwari|LSG|1|L|India
Akash Deep|KKR|1|L|India
Shivang Kumar|SRH|0.3|?|India
Ashok Sharma|GT|0.9|L|India
Kartik Tyagi|KKR|0.3|L|India
Sushant Mishra|RR|0.9|L|India
Yash Raj Punja|RR|0.3|?|India
Prashant Solanki|KKR|0.3|L|India
Vignesh Puthur|RR|0.3|L|India
Danish Malewar|MI|0.3|B|India
Satwik Deswal|RCB|0.3|?|India
Aman Khan|CSK|0.4|A|India
Sakib Hussain|SRH|0.3|L|India
Mohammad Izhar|MI|0.3|L|India
Onkar Tarmale|SRH|0.3|?|India
Atharva Ankolekar|MI|0.3|A|India
Amit Kumar|SRH|0.3|?|India
Praful Hinge|SRH|0.3|L|India
Krains Fultera|SRH|0.3|?|India
Sarthak Ranjan|KKR|0.3|?|India
Daksh Kamra|KKR|0.3|?|India
Aman Rao|RR|0.3|?|India
Mayank Rawat|MI|0.3|A|India
Pravin Dubey|PBKS|0.3|L|India
Sahil Parikh|DC|0.3|?|India
Vishal Nishad|PBKS|0.3|?|India
Brijesh Sharma|RR|0.3|L|India
Vicky Ostwal|RCB|0.3|L|India
Prithvi Raj|GT|0.3|?|India
Kanishk Chouhan|RCB|0.3|?|India
Luke Wood|GT|0.75|L|England
Kuldeep Sen|RR|0.75|L|India
Prithvi Shaw|DC|0.75|B|India
Zak Foulkes|CSK|0.75|L|New Zealand
Rahul Tripathi|KKR|0.75|B|India
Shivam Mavi|SRH|0.75|L|India
Sarfaraz Khan|CSK|0.75|B|India
Jordan Cox|RCB|0.75|W|England
`.trim().split(String.fromCharCode(10));

// Name spellings differ between the two official sources (all verified to be the same franchise).
const ALIAS = { 'Auqib Dar': 'Auqib Nabi', 'Tejasvi Singh': 'Tejasvi Dahiya', 'Matthew Short': 'Matt Short', 'Yash Raj Punja': 'Yash Punja', 'Satwik Deswal': 'Satvik Deswal', 'Mohammad Izhar': 'Mohammed Izhar', 'Krains Fultera': 'Krains Fuletra', 'Pravin Dubey': 'Praveen Dubey', 'Sahil Parikh': 'Sahil Parakh', 'Prithvi Raj': 'Yarra Prithviraj', 'Liam Livingtsone': 'Liam Livingstone' };
// Editorial auction order for the Mega auction (prominent players first). Not an official ranking.
const MARQUEE = ['Virat Kohli', 'Rohit Sharma', 'Mahendra Singh Dhoni', 'Jasprit Bumrah', 'Suryakumar Yadav', 'Hardik Pandya', 'Ravindra Jadeja', 'Rishabh Pant', 'Shubman Gill', 'KL Rahul', 'Yashasvi Jaiswal', 'Sanju Samson', 'Shreyas Iyer', 'Rinku Singh', 'Arshdeep Singh', 'Mohammed Siraj', 'Kuldeep Yadav', 'Yuzvendra Chahal', 'Ruturaj Gaikwad', 'Travis Head', 'Heinrich Klaasen', 'Pat Cummins', 'Rashid Khan', 'Sunil Narine', 'Jos Buttler', 'Nicholas Pooran', 'Mitchell Starc', 'Trent Boult', 'Phil Salt', 'Axar Patel', 'Varun Chakaravarthy', 'Abhishek Sharma', 'Tilak Varma', 'Ishan Kishan', 'Mohammed Shami', 'Bhuvneshwar Kumar', 'Marcus Stoinis', 'Jofra Archer', 'Liam Livingstone', 'Cameron Green', 'Josh Hazlewood', 'Prasidh Krishna', 'Shivam Dube', 'Venkatesh Iyer', 'Washington Sundar', 'Quinton de Kock', 'Tim David', 'Krunal Pandya', 'Dewald Brevis'];

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const squads = require('./squads.json').players;
const results = new Map(RAW.map((line) => {
  const [name, team, cr] = line.split('|');
  return [(ALIAS[name] || name).toLowerCase(), { team, price: Math.round(parseFloat(cr) * 100) }];
}));
const rank = new Map(MARQUEE.map((n, i) => [n.toLowerCase(), i + 1]));

const PLAYERS = squads.map((p) => {
  const r = results.get(p.name.toLowerCase());
  return {
    name: p.name, slug: slugify(p.name), country: p.country, isOverseas: p.isOverseas, role: p.role, team: p.team,
    image: p.image, imageThumb: p.imageThumb, externalId: p.externalId, profileVerified: true,
    marqueeRank: rank.get(p.name.toLowerCase()) || null,
    auctionStatus: r ? 'sold' : 'none', soldTo: r ? r.team : null, soldPrice: r ? r.price : null,
    source: p.source, seedVersion: SEED_VERSION,
  };
});
// Old (v1) records that used the results-page spelling; replaced by the squad spelling above.
const LEGACY_SLUGS = Object.keys(ALIAS).map(slugify);

module.exports = { TEAMS, PRESETS, PLAYERS, slugify, SEED_VERSION, LEGACY_SLUGS, results, MARQUEE };
