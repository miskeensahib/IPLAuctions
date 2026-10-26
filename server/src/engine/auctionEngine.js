const crypto = require('crypto');
const Auction = require('../models/Auction');
const AuctionSetting = require('../models/AuctionSetting');
const Player = require('../models/Player');
const Team = require('../models/Team');
const Bid = require('../models/Bid');
const Squad = require('../models/Squad');
const AuctionResult = require('../models/AuctionResult');
const { HttpError } = require('../lib/http');
const { nextBid, increment, estimateBase } = require('../lib/money');

let io = null;
const timers = new Map(); // code -> { close, advance, bot }

const init = (socketServer) => { io = socketServer; };
// Base prices are not published by the official sources: use the stored one when an admin set it,
// otherwise an estimate (marquee = 2 Cr, known result = nearest IPL slab, everyone else = 30 lakh minimum).
const MIN_SLOT = 30; // lowest IPL base slab (lakh); reserved per still-needed squad slot
const baseOf = (player) =>
  player.basePrice || (player.marqueeRank ? 200 : player.soldPrice ? estimateBase(player.soldPrice) : MIN_SLOT);

function clearTimers(code) {
  const t = timers.get(code);
  if (!t) return;
  Object.values(t).forEach(clearTimeout);
  timers.delete(code);
}
function setTimer(code, kind, ms, fn) {
  const t = timers.get(code) || {};
  clearTimeout(t[kind]);
  t[kind] = setTimeout(() => fn().catch((e) => console.error(`[engine:${kind}]`, e.message)), Math.max(0, ms));
  timers.set(code, t);
}

// ---------- public view ----------
async function view(code) {
  const a = await Auction.findOne({ code }).populate('live.player').lean();
  if (!a) throw new HttpError(404, 'Auction not found');
  const [bids, recent, sold] = await Promise.all([
    Bid.find({ auction: a._id, player: a.live?.player?._id }).sort({ createdAt: -1 }).limit(8).lean(),
    AuctionResult.find({ auction: a._id }).sort({ createdAt: -1 }).limit(12).populate('player', 'name role country slug isOverseas imageThumb team').lean(),
    AuctionResult.aggregate([
      { $match: { auction: a._id } },
      { $group: { _id: '$status', n: { $sum: 1 }, total: { $sum: '$price' } } },
    ]),
  ]);
  const stat = (s) => sold.find((x) => x._id === s) || { n: 0, total: 0 };
  return {
    ...a,
    hostId: undefined,
    teams: a.teams.map(({ ownerId, ...t }) => ({ ...t, claimed: !t.isBot })),
    pool: undefined,
    poolTotal: a.pool.length,
    bids, recent,
    stats: { sold: stat('sold').n, unsold: stat('unsold').n, totalSpent: stat('sold').total, total: a.pool.length },
    serverNow: Date.now(),
  };
}
async function broadcast(code) {
  if (io) io.to(`auction:${code}`).emit('auction:update', await view(code));
}

// ---------- lifecycle ----------
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const newCode = () => crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();

async function createAuction({ name, mode = 'mini', play = 'solo', overrides = {}, clientId, hostName }) {
  const preset = await AuctionSetting.findOne({ key: mode }).lean();
  if (!preset) throw new HttpError(400, `Unknown auction mode "${mode}"`);
  const settings = { ...preset, ...overrides };
  for (const k of ['_id', '__v', 'createdAt', 'updatedAt']) delete settings[k];
  const num = (k, min, max) => {
    const v = Number(settings[k]);
    if (!Number.isFinite(v) || v < min || v > max) throw new HttpError(400, `${k} must be between ${min} and ${max}`);
    settings[k] = Math.round(v);
  };
  num('purse', 1000, 100000); num('minSquad', 0, 40); num('maxSquad', 1, 40); num('maxOverseas', 0, 40);
  num('initialSeconds', 5, 120); num('resetSeconds', 3, 60); num('breakSeconds', 1, 20); num('poolSize', 0, 1000);
  if (settings.minSquad > settings.maxSquad) throw new HttpError(400, 'minSquad cannot exceed maxSquad');
  if (settings.purse < settings.minSquad * MIN_SLOT) throw new HttpError(400, `Purse is too small to fill a squad of ${settings.minSquad}`);
  if (!['random', 'sequential', 'marquee'].includes(settings.poolOrder)) settings.poolOrder = 'random';

  const [teams, players] = await Promise.all([Team.find().sort('short').lean(), Player.find().sort('createdAt').select('_id marqueeRank').lean()]);
  if (!teams.length) throw new HttpError(409, 'No teams in database. Run the seed script.');
  if (!players.length) throw new HttpError(409, 'No players in database. Run the seed script.');
  let pool;
  if (settings.poolOrder === 'marquee') { // prominent players first (editorial rank), everyone else after in random order
    const m = players.filter((p) => p.marqueeRank).sort((x, y) => x.marqueeRank - y.marqueeRank);
    pool = [...m, ...shuffle(players.filter((p) => !p.marqueeRank))];
  } else pool = settings.poolOrder === 'random' ? shuffle(players) : players;
  if (settings.poolSize > 0) pool = pool.slice(0, settings.poolSize);
  if (settings.minSquad && pool.length < teams.length * settings.minSquad)
    throw new HttpError(400, `The player pool has ${pool.length} players, but ${teams.length} teams each need at least ${settings.minSquad} (${teams.length * settings.minSquad} total). Add players or lower the minimum squad.`);

  let code, tries = 0;
  do { code = newCode(); } while (await Auction.exists({ code }) && ++tries < 5);
  const a = await Auction.create({
    code, name: String(name || `${preset.label} ${code}`).slice(0, 60), mode, play, status: 'lobby',
    hostId: clientId, hostName: String(hostName || 'Host').slice(0, 30), settings,
    pool: pool.map((p) => p._id),
    teams: teams.map((t) => ({ team: t._id, short: t.short, name: t.name, color: t.color, purse: settings.purse })),
  });
  return a.code;
}

async function claimTeam(code, { teamId, clientId, name }) {
  const a = await Auction.findOne({ code });
  if (!a) throw new HttpError(404, 'Auction not found');
  if (a.status === 'completed') throw new HttpError(409, 'Auction already finished');
  if (a.play === 'solo' && a.teams.some((t) => t.ownerId === clientId && String(t.team) !== String(teamId)))
    throw new HttpError(409, 'Solo mode allows one team per player');
  const res = await Auction.updateOne(
    { _id: a._id, teams: { $elemMatch: { team: teamId, isBot: true } } },
    { $set: { 'teams.$.isBot': false, 'teams.$.ownerId': clientId, 'teams.$.ownerName': String(name || 'Player').slice(0, 30) } },
  );
  if (!res.modifiedCount) {
    const t = a.teams.find((x) => String(x.team) === String(teamId));
    if (t && t.ownerId === clientId) return; // already mine
    throw new HttpError(409, t ? 'Team already taken' : 'Team not found');
  }
  await broadcast(code);
}

async function releaseTeam(code, { teamId, clientId }) {
  const a = await Auction.findOne({ code });
  if (!a) throw new HttpError(404, 'Auction not found');
  if (a.status !== 'lobby') throw new HttpError(409, 'Teams can only be released in the lobby');
  await Auction.updateOne(
    { _id: a._id, teams: { $elemMatch: { team: teamId, ownerId: clientId } } },
    { $set: { 'teams.$.isBot': true, 'teams.$.ownerId': null, 'teams.$.ownerName': null } },
  );
  await broadcast(code);
}

async function start(code, clientId) {
  const a = await Auction.findOne({ code });
  if (!a) throw new HttpError(404, 'Auction not found');
  if (a.hostId !== clientId) throw new HttpError(403, 'Only the host can start the auction');
  if (a.status !== 'lobby') throw new HttpError(409, 'Auction already started');
  if (!a.teams.some((t) => !t.isBot)) throw new HttpError(409, 'Pick a team before starting');
  await Auction.updateOne({ _id: a._id }, { $set: { status: 'live' } });
  await nextLot(code);
}

async function nextLot(code) {
  const a = await Auction.findOne({ code });
  if (!a || a.status !== 'live') return;
  const idx = a.poolIndex + 1;
  if (idx >= a.pool.length || a.teams.every((t) => t.count >= a.settings.maxSquad)) return complete(code);
  const player = await Player.findById(a.pool[idx]).lean();
  const endsAt = new Date(Date.now() + a.settings.initialSeconds * 1000);
  const rev = (a.live?.rev || 0) + 1;
  await Auction.updateOne({ _id: a._id }, {
    $set: {
      poolIndex: idx,
      live: { player: player._id, basePrice: baseOf(player), currentBid: 0, highestTeam: null, bidCount: 0, endsAt, passed: [], phase: 'bidding', rev, lastResult: null },
    },
  });
  setTimer(code, 'close', endsAt - Date.now(), () => closeLot(code, rev));
  botKick(code);
  await broadcast(code);
}

async function complete(code) {
  clearTimers(code);
  await Auction.updateOne({ code }, { $set: { status: 'completed', 'live.phase': 'closed' } });
  await broadcast(code);
}

async function closeLot(code, rev) {
  const a0 = await Auction.findOneAndUpdate(
    { code, status: 'live', 'live.rev': rev, 'live.phase': 'bidding' },
    { $set: { 'live.phase': 'closed' } },
    { returnDocument: 'after' },
  ).populate('live.player');
  if (!a0) return; // already closed, paused, or superseded
  const { live } = a0;
  const player = live.player;
  let lastResult;
  if (live.highestTeam) {
    const winner = a0.teams.find((t) => String(t.team) === String(live.highestTeam));
    await Auction.updateOne(
      { _id: a0._id, 'teams.team': live.highestTeam },
      { $inc: { 'teams.$.purse': -live.currentBid, 'teams.$.spent': live.currentBid, 'teams.$.count': 1, 'teams.$.overseas': player.isOverseas ? 1 : 0 } },
    );
    await Squad.updateOne(
      { auction: a0._id, team: live.highestTeam },
      { $push: { players: { player: player._id, price: live.currentBid } } },
      { upsert: true },
    );
    await AuctionResult.create({ auction: a0._id, player: player._id, team: live.highestTeam, teamShort: winner.short, status: 'sold', price: live.currentBid, basePrice: live.basePrice, bidCount: live.bidCount });
    lastResult = { status: 'sold', team: winner.short, teamName: winner.name, price: live.currentBid };
  } else {
    await AuctionResult.create({ auction: a0._id, player: player._id, status: 'unsold', price: 0, basePrice: live.basePrice, bidCount: 0 });
    lastResult = { status: 'unsold' };
  }
  await Auction.updateOne({ _id: a0._id }, { $set: { 'live.lastResult': lastResult } });
  await broadcast(code);
  setTimer(code, 'advance', a0.settings.breakSeconds * 1000, () => nextLot(code));
}

// ---------- bidding ----------
function checkEligibility(a, team, player) {
  const { live, settings } = a;
  if (a.status !== 'live') throw new HttpError(409, a.status === 'paused' ? 'Auction is paused' : 'Auction is not live');
  if (live.phase !== 'bidding' || Date.now() >= new Date(live.endsAt).getTime()) throw new HttpError(409, 'Bidding for this player has closed');
  if ((live.passed || []).some((p) => String(p) === String(team.team))) throw new HttpError(409, 'You passed on this player');
  if (live.highestTeam && String(live.highestTeam) === String(team.team)) throw new HttpError(409, 'You already hold the highest bid');
  if (team.count >= settings.maxSquad) throw new HttpError(409, `Squad is full (${settings.maxSquad})`);
  if (player.isOverseas && team.overseas >= settings.maxOverseas) throw new HttpError(409, `Overseas limit reached (${settings.maxOverseas})`);
}

// A team must always keep enough purse to still reach the minimum squad size.
function checkReserve(team, amount, settings) {
  const need = Math.max(0, (settings.minSquad || 0) - (team.count + 1));
  const left = team.purse - amount;
  if (left < need * MIN_SLOT)
    throw new HttpError(409, `This bid would leave ${(left / 100).toFixed(2)} Cr, but you still need ${need} more player(s) to reach the minimum squad of ${settings.minSquad} (at least ${(MIN_SLOT / 100).toFixed(2)} Cr each).`);
}

async function placeBid(code, { teamId, clientId, amount, bot = false }) {
  const a = await Auction.findOne({ code }).populate('live.player');
  if (!a) throw new HttpError(404, 'Auction not found');
  const team = a.teams.find((t) => String(t.team) === String(teamId));
  if (!team) throw new HttpError(404, 'Team not in this auction');
  if (!bot && team.ownerId !== clientId) throw new HttpError(403, 'You do not control this team');
  checkEligibility(a, team, a.live.player);

  const min = nextBid(a.live.currentBid, a.live.basePrice);
  const bidAmt = amount == null ? min : Math.round(Number(amount));
  if (!Number.isFinite(bidAmt)) throw new HttpError(400, 'Invalid bid amount');
  if (bidAmt < min) throw new HttpError(400, `Minimum bid is ${min} lakh`);
  if (bidAmt % 5 !== 0) throw new HttpError(400, 'Bids must be in multiples of 5 lakh');
  if (bidAmt > team.purse) throw new HttpError(400, 'Not enough purse remaining');
  checkReserve(team, bidAmt, a.settings);

  const now = Date.now();
  const endsAt = new Date(Math.max(new Date(a.live.endsAt).getTime(), now + a.settings.resetSeconds * 1000));
  // Optimistic concurrency: only succeeds if nobody bid since we read this lot.
  const res = await Auction.updateOne(
    { _id: a._id, status: 'live', 'live.rev': a.live.rev, 'live.phase': 'bidding', 'live.currentBid': a.live.currentBid, 'live.bidCount': a.live.bidCount },
    { $set: { 'live.currentBid': bidAmt, 'live.highestTeam': team.team, 'live.endsAt': endsAt }, $inc: { 'live.bidCount': 1 } },
  );
  if (!res.modifiedCount) throw new HttpError(409, 'Someone else bid first. Try again.');
  await Bid.create({ auction: a._id, player: a.live.player._id, team: team.team, teamShort: team.short, amount: bidAmt, byBot: bot });
  setTimer(code, 'close', endsAt - now, () => closeLot(code, a.live.rev));
  botKick(code);
  await broadcast(code);
}

async function pass(code, { teamId, clientId }) {
  const a = await Auction.findOne({ code });
  if (!a) throw new HttpError(404, 'Auction not found');
  const team = a.teams.find((t) => String(t.team) === String(teamId));
  if (!team || team.ownerId !== clientId) throw new HttpError(403, 'You do not control this team');
  if (a.status !== 'live' || a.live.phase !== 'bidding') throw new HttpError(409, 'Nothing to pass on right now');
  if (String(a.live.highestTeam) === String(team.team)) throw new HttpError(409, 'You hold the highest bid');
  await Auction.updateOne({ _id: a._id, 'live.rev': a.live.rev }, { $addToSet: { 'live.passed': team.team } });
  // If a bid exists and every other human team has passed or leads, hurry the hammer.
  const fresh = await Auction.findById(a._id);
  const humansIn = fresh.teams.filter((t) => !t.isBot && !fresh.live.passed.some((p) => String(p) === String(t.team)) && String(t.team) !== String(fresh.live.highestTeam));
  if (fresh.live.highestTeam && !humansIn.length) {
    const endsAt = new Date(Math.min(new Date(fresh.live.endsAt).getTime(), Date.now() + 3000));
    await Auction.updateOne({ _id: a._id, 'live.rev': a.live.rev }, { $set: { 'live.endsAt': endsAt } });
    setTimer(code, 'close', endsAt - Date.now(), () => closeLot(code, a.live.rev));
  }
  await broadcast(code);
}

async function hostAction(code, clientId, action) {
  const a = await Auction.findOne({ code });
  if (!a) throw new HttpError(404, 'Auction not found');
  if (a.hostId !== clientId) throw new HttpError(403, 'Only the host can do that');
  if (action === 'sold') { // hammer down now
    if (a.status !== 'live' || a.live.phase !== 'bidding') throw new HttpError(409, 'No active bidding');
    return closeLot(code, a.live.rev);
  }
  if (action === 'next') { // skip: close current lot (sold if there is a bid), go next immediately
    if (a.status !== 'live') throw new HttpError(409, 'Auction is not live');
    if (a.live.phase === 'bidding') await closeLot(code, a.live.rev);
    clearTimeout((timers.get(code) || {}).advance);
    return nextLot(code);
  }
  if (action === 'pause') {
    if (a.status !== 'live') throw new HttpError(409, 'Auction is not live');
    clearTimers(code);
    const remaining = a.live.phase === 'bidding' ? Math.max(1000, new Date(a.live.endsAt).getTime() - Date.now()) : 0;
    await Auction.updateOne({ _id: a._id }, { $set: { status: 'paused', 'live.remainingMs': remaining } });
    return broadcast(code);
  }
  if (action === 'resume') {
    if (a.status !== 'paused') throw new HttpError(409, 'Auction is not paused');
    await Auction.updateOne({ _id: a._id }, { $set: { status: 'live' } });
    await resumeOne(code);
    return broadcast(code);
  }
  if (action === 'end') {
    if (a.status === 'completed' || a.status === 'lobby') throw new HttpError(409, 'Nothing to end');
    if (a.live.phase === 'bidding') await closeLot(code, a.live.rev);
    return complete(code);
  }
  throw new HttpError(400, 'Unknown action');
}

// ---------- settings ----------
const TIMER_OPTIONS = [5, 10, 15, 20, 25, 30, 45, 60];
// Host-only. Sets both the per-lot countdown and the reset-after-bid value. The running lot's clock is left
// alone (no mid-bid jumps); the new value applies from the next bid and the next lot.
async function setBidTimer(code, clientId, seconds) {
  const a = await Auction.findOne({ code });
  if (!a) throw new HttpError(404, 'Auction not found');
  if (a.hostId !== clientId) throw new HttpError(403, 'Only the auction host can change the timer');
  if (a.status === 'completed') throw new HttpError(409, 'Auction already finished');
  seconds = Number(seconds);
  if (!TIMER_OPTIONS.includes(seconds)) throw new HttpError(400, `Timer must be one of: ${TIMER_OPTIONS.join(', ')} seconds`);
  await Auction.updateOne({ _id: a._id }, { $set: { 'settings.initialSeconds': seconds, 'settings.resetSeconds': seconds } });
  await broadcast(code);
}

// A user logging out hands their teams back to the bots (auction data and results are untouched).
async function releaseAllFor(clientId) {
  const q = { status: { $ne: 'completed' }, 'teams.ownerId': clientId };
  const affected = await Auction.find(q).select('code status').lean();
  await Auction.updateMany(q, { $set: { 'teams.$[t].isBot': true, 'teams.$[t].ownerId': null, 'teams.$[t].ownerName': null } }, { arrayFilters: [{ 't.ownerId': clientId }] });
  for (const a of affected) { await broadcast(a.code); if (a.status === 'live') botKick(a.code); }
  return affected.length;
}

// ---------- bots ----------
const hash01 = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; };
// Bot valuation: anchored to the official result when known, otherwise a multiple of base. Varies per team.
const botValue = (team, player, base, settings) => {
  const ref = player.soldPrice || base * (player.marqueeRank ? 4 : 1.5);
  let v = Math.min(ref * (0.75 + hash01(team.short + player.slug) * 0.6), team.purse * 0.5);
  if (settings.minSquad && team.count < settings.minSquad) v = Math.max(v, base); // still filling the minimum squad
  return v;
};

function botKick(code) {
  setTimer(code, 'bot', 1200 + Math.random() * 2200, () => botAct(code));
}
async function botAct(code) {
  const a = await Auction.findOne({ code }).populate('live.player');
  if (!a || a.status !== 'live' || a.live.phase !== 'bidding') return;
  const min = nextBid(a.live.currentBid, a.live.basePrice);
  const p = a.live.player;
  const cands = a.teams.filter((t) => {
    if (!t.isBot || t.purse < min) return false;
    try { checkEligibility(a, t, p); checkReserve(t, min, a.settings); } catch { return false; }
    return botValue(t, p, a.live.basePrice, a.settings) >= min;
  });
  if (!cands.length) return;
  const t = cands[Math.floor(Math.random() * cands.length)];
  let amount = min;
  if (Math.random() < 0.2) { // occasional jump bid
    const jump = min + increment(min) * (1 + Math.floor(Math.random() * 2));
    try { checkReserve(t, jump, a.settings); if (jump <= botValue(t, p, a.live.basePrice, a.settings) && jump <= t.purse) amount = jump; } catch { /* keep min */ }
  }
  try { await placeBid(code, { teamId: t.team, amount, bot: true }); }
  catch (e) { if (e.status === 409) botKick(code); }
}

// ---------- recovery after server restart ----------
async function resumeOne(code) {
  const a = await Auction.findOne({ code });
  if (!a || a.status !== 'live') return;
  if (a.live.phase === 'bidding') {
    let endsAt = new Date(a.live.endsAt);
    if (a.live.remainingMs) { // resuming from pause
      endsAt = new Date(Date.now() + a.live.remainingMs);
      await Auction.updateOne({ _id: a._id }, { $set: { 'live.endsAt': endsAt, 'live.remainingMs': 0 } });
    }
    setTimer(code, 'close', endsAt - Date.now(), () => closeLot(code, a.live.rev));
    botKick(code);
  } else {
    setTimer(code, 'advance', a.settings.breakSeconds * 1000, () => nextLot(code));
  }
}
async function recover() {
  const live = await Auction.find({ status: 'live' }).select('code').lean();
  for (const a of live) await resumeOne(a.code);
  if (live.length) console.log(`[engine] resumed ${live.length} live auction(s)`);
}

module.exports = { init, view, broadcast, createAuction, claimTeam, releaseTeam, start, placeBid, pass, hostAction, recover, baseOf, setBidTimer, releaseAllFor, TIMER_OPTIONS };
