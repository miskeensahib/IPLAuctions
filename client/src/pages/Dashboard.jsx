import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fetchAllPlayers } from '../api';
import { useAuction, useCountdown, useToast } from '../state';
import { TeamStrip } from '../Layout';
import { Avatar, Donut, Empty, SoundToggle, TeamBadge, VerifyTag } from '../ui';
import { useCountdownWarning } from '../sound';
import { ROLE_KEYS, ROLE_SHORT, ago, cc, cr, minBid, roleCounts } from '../utils';
import Lobby from './Lobby';
import { useWatchlist } from './Watchlist';

const PALETTE = ['#f7b500', '#2563eb', '#ef4444', '#8b5cf6', '#f97316', '#ec4899', '#14b8a6', '#60a5fa', '#22c55e', '#eab308'];

export function useResults(auction) {
  const [results, setResults] = useState([]);
  const n = auction ? auction.stats.sold + auction.stats.unsold : 0;
  useEffect(() => {
    if (!auction) return;
    api(`/auctions/${auction.code}/results`).then(setResults).catch(() => {});
  }, [auction?.code, n]); // eslint-disable-line react-hooks/exhaustive-deps
  return results;
}

export function useSquads(auction) {
  const [squads, setSquads] = useState([]);
  const n = auction ? auction.stats.sold : 0;
  useEffect(() => {
    if (!auction) return;
    api(`/auctions/${auction.code}/squads`).then(setSquads).catch(() => {});
  }, [auction?.code, n]); // eslint-disable-line react-hooks/exhaustive-deps
  return squads;
}

export function Timer({ big }) {
  const s = useCountdown();
  const { auction } = useAuction();
  useCountdownWarning(s, auction.status === 'live' && auction.live?.phase === 'bidding'); // beep in the last 3 s
  const mm = String(Math.floor(s / 60)).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
  return (
    <div className={`timer${s <= 5 && auction.live.phase === 'bidding' ? ' hot' : ''}${big ? ' big' : ''}`}>
      <span className="lbl">TIME LEFT</span>
      <span className="val" aria-live="off">{mm}:{ss}</span>
    </div>
  );
}

export function CurrentPlayer({ compact }) {
  const { auction, myTeam, isHost, now, patchAuction, holdStatus, refresh } = useAuction();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const toggling = useRef(false);
  const [custom, setCustom] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const wl = useWatchlist();
  const live = auction.live;
  const p = live?.player;
  const bidding = auction.status === 'live' && live?.phase === 'bidding';
  const holder = auction.teams.find((t) => t.team === live?.highestTeam);
  const min = p ? minBid(live) : 0;
  const bannerKey = live?.lastResult && live.phase === 'closed' ? live.lastResult.status : null;

  const act = async (path, body, okMsg) => {
    setBusy(true);
    try { await api(`/auctions/${auction.code}/${path}`, { method: 'POST', body }); okMsg && toast.ok(okMsg); }
    catch (e) { toast.err(e.message); }
    finally { setBusy(false); }
  };
  // Pause / Resume react the instant the host clicks: the screen changes first, the server confirms right after
  // (and the screen is put back if the server says no).
  const hostToggle = async (action) => {
    if (toggling.current) return;
    toggling.current = true;
    const pausing = action === 'pause';
    const bidding = auction.live?.phase === 'bidding';
    const live = pausing
      ? { remainingMs: bidding ? Math.max(1000, new Date(auction.live.endsAt).getTime() - now()) : 0 }
      : { remainingMs: 0, ...(bidding ? { endsAt: new Date(now() + (auction.live.remainingMs || 1000)).toISOString() } : {}) };
    const status = pausing ? 'paused' : 'live';
    holdStatus({ status, live });
    patchAuction((a) => (a && a.live ? { ...a, status, live: { ...a.live, ...live } } : a));
    try { await api(`/auctions/${auction.code}/host/${action}`, { method: 'POST' }); }
    catch (e) { holdStatus(null); toast.err(e.message); refresh().catch(() => {}); }
    finally { holdStatus(null); toggling.current = false; }
  };
  // Bid: the screen shows your team, the new amount and the reset clock the instant you click; the server confirms
  // right after (and the screen is corrected if it says no, e.g. someone bid a moment earlier).
  const bid = async (amount) => {
    const base = auction.live;
    const amt = amount == null ? minBid(base) : Math.round(Number(amount));
    const s = auction.settings;
    const impossible = !Number.isFinite(amt) || amt < minBid(base) || amt > myTeam.purse || myTeam.count >= s.maxSquad || (base.player?.isOverseas && myTeam.overseas >= s.maxOverseas);
    if (impossible) return act('bid', { teamId: myTeam.team, amount }); // let the server explain, nothing to show first
    const t = now();
    const extend = t + s.resetSeconds * 1000 > new Date(base.endsAt).getTime();
    const row = { _id: `opt-${base.rev}-${base.bidCount + 1}`, team: myTeam.team, teamShort: myTeam.short, amount: amt, byBot: false, bidderName: myTeam.ownerName, createdAt: new Date(t).toISOString() };
    patchAuction((a) => (a && a.live ? { ...a, live: { ...a.live, currentBid: amt, highestTeam: myTeam.team, bidCount: a.live.bidCount + 1, ...(extend ? { endsAt: new Date(t + s.resetSeconds * 1000).toISOString(), clockSeconds: s.resetSeconds } : {}) }, bids: [row, ...(a.bids || [])].slice(0, 8) } : a));
    try { await api(`/auctions/${auction.code}/bid`, { method: 'POST', body: { teamId: myTeam.team, amount } }); }
    catch (e) { toast.err(e.message); refresh().catch(() => {}); }
  };
  const reason = !myTeam ? 'Pick a team first' : !bidding ? 'Bidding is closed' : live.highestTeam === myTeam.team ? 'You lead the bidding' : (live.passed || []).includes(myTeam.team) ? 'You passed' : '';
  const canBid = !reason && !busy;

  if (!p) return <section className="panel current"><Empty>{auction.status === 'completed' ? 'Auction complete' : 'Waiting for the first player…'}</Empty></section>;

  return (
    <section className={`panel current${compact ? ' compact' : ''}`}>
      <div className="cp-head"><h3 className="panel-title">CURRENT PLAYER</h3><SoundToggle /></div>
      <div className="cp-top">
        <Avatar name={p.name} src={p.imageThumb} color={holder?.color || '#3b4a7a'} size={compact ? 96 : 130} square />
        <div className="cp-info">
          <div className="cp-name">{p.name} <span className="code">{cc(p.country)}</span></div>
          <div className="chips"><span className="chip">{p.role}</span>{p.isOverseas && <span className="chip gold">Overseas</span>}</div>
          <dl className="cp-facts">
            <div><dt>Base Price{p.basePriceVerified ? '' : ' (est.)'}</dt><dd>{cr(live.basePrice)}</dd></div>
            <div><dt>Country</dt><dd>{p.country}</dd></div>
            <div><dt>IPL team</dt><dd>{p.team || '—'}</dd></div>
            <div><dt>Lot</dt><dd>{auction.poolIndex + 1} / {auction.poolTotal}</dd></div>
          </dl>
          <div className="tags"><VerifyTag ok={p.profileVerified} label="Profile" /><VerifyTag ok={p.basePriceVerified} label="Base price" /></div>
          <button className="link-btn" onClick={() => wl.toggle(p._id)}>{wl.has(p._id) ? '★ In watchlist' : '☆ Add to watchlist'}</button>
        </div>
      </div>

      <div className="bidbar">
        <div className="bb-cell"><span className="lbl">CURRENT BID</span><span className="amt">{live.currentBid ? cr(live.currentBid) : '—'}</span></div>
        <div className="bb-cell hb"><span className="lbl">HIGHEST BIDDER</span>
          {holder ? <span className="hb-team"><TeamBadge short={holder.short} color={holder.color} size={28} />{holder.name}</span> : <span className="muted">No bids yet</span>}
        </div>
        <Timer />
        {bannerKey && (
          <div className={`result-banner ${bannerKey}`}>
            {bannerKey === 'sold' ? <>SOLD to {live.lastResult.teamName} for {cr(live.lastResult.price)}</> : <>UNSOLD</>}
            {p.soldTo && <small>Real IPL 2026 result: {cr(p.soldPrice)} → {p.soldTo}</small>}
          </div>
        )}
      </div>

      <div className="actions">
        <button className="btn bid" disabled={!canBid} onClick={() => bid()}>
          <b>BID</b><small>{cr(min)}</small>
        </button>
      </div>
      {reason && myTeam && <p className="hint" role="status">{reason}</p>}
      {myTeam && bidding && (
        <form className="custom-bid" onSubmit={(e) => { e.preventDefault(); const v = Math.round(parseFloat(custom) * 100); if (!v) return toast.err('Enter an amount in Cr'); bid(v); setCustom(''); }}>
          <label htmlFor="cb">Custom bid (Cr)</label>
          <input id="cb" inputMode="decimal" placeholder={(min / 100).toFixed(2)} value={custom} onChange={(e) => setCustom(e.target.value)} />
          <button className="btn ghost sm" disabled={!canBid || !custom}>Bid</button>
        </form>
      )}
      {isHost && (
        <div className="host-row">
          {auction.status === 'live' && <button className="btn ghost sm" onClick={() => hostToggle('pause')}>Pause</button>}
          {auction.status === 'paused' && <button className="btn ghost sm" onClick={() => hostToggle('resume')}>Resume</button>}
          <button className="btn ghost sm danger" onClick={() => window.confirm('End the auction now?') && act('host/end')}>End auction</button>
          <button className="btn ghost sm" onClick={() => setShowSettings(true)}>Settings</button>
        </div>
      )}
      {auction.status === 'paused' && <div className="banner warn">Auction paused by host</div>}
      {showSettings && <TimerSettings onClose={() => setShowSettings(false)} />}
    </section>
  );
}

const TIMER_CHOICES = [5, 10, 15, 20, 25, 30, 45, 60];

// Host-only dialog (the server enforces this too). Applies to the next bid and the next player; the running clock is not touched.
function TimerSettings({ onClose }) {
  const { auction } = useAuction();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const current = auction.settings.initialSeconds;
  const pick = async (seconds) => {
    if (seconds === current) return onClose();
    setBusy(true);
    try { await api(`/auctions/${auction.code}/timer`, { method: 'PUT', body: { seconds } }); toast.ok(`Bid timer set to ${seconds}s for everyone`); onClose(); }
    catch (e) { toast.err(e.message); setBusy(false); }
  };
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ts-title" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn x" onClick={onClose} aria-label="Close">✕</button>
        <h3 id="ts-title" className="panel-title">AUCTION SETTINGS</h3>
        <p className="lbl">Bid timer</p>
        <p className="muted small">Current: <b className="gold-text">{current} seconds</b>. Each new player starts at this time and every valid bid resets the clock to it. The player on the block keeps its running clock; the change applies from the next bid.</p>
        <div className="timer-opts" role="radiogroup" aria-label="Bid timer">
          {TIMER_CHOICES.map((s) => (
            <button key={s} role="radio" aria-checked={s === current} disabled={busy} className={`opt${s === current ? ' on' : ''}`} onClick={() => pick(s)}>{s}s</button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BidHistory() {
  const { auction } = useAuction();
  const bids = auction.bids || [];
  return (
    <section className="panel bidhist">
      <h3 className="panel-title">BID HISTORY</h3>
      {!bids.length ? <Empty>No bids on this player yet.</Empty> : (
        <ul className="rows">
          {bids.map((b) => {
            const t = auction.teams.find((x) => x.team === b.team);
            return <li key={b._id}><span className="r-team"><TeamBadge short={b.teamShort} color={t?.color} size={24} />{t?.name || b.teamShort}</span><b>{cr(b.amount)}</b><span className="muted">{ago(b.createdAt)}</span></li>;
          })}
        </ul>
      )}
    </section>
  );
}

function PlayersPanel() {
  const { auction, code } = useAuction();
  const results = useResults(auction);
  const [all, setAll] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetchAllPlayers().then(setAll).catch(() => {}).finally(() => setLoading(false)); }, []);
  const status = useMemo(() => Object.fromEntries(results.map((r) => [r.player?._id, r])), [results]);
  const list = all.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  return (
    <section className="panel players-panel">
      <h3 className="panel-title">PLAYERS</h3>
      <input className="search" type="search" placeholder="Search players…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" />
      <ul className="plist">
        {loading && <li className="muted pad">Loading…</li>}
        {list.map((p) => {
          const r = status[p._id];
          const cur = auction.live?.player?._id === p._id;
          return (
            <li key={p._id} className={cur ? 'cur' : ''}>
              <Avatar name={p.name} src={p.imageThumb} size={40} />
              <div className="pl-main"><b>{p.name} <span className="code">{cc(p.country)}</span></b><small>{p.role}{p.team ? ` · ${p.team}` : ''}</small></div>
              <div className="pl-side">{r ? (r.status === 'sold' ? <span className="st sold">{r.teamShort} {cr(r.price)}</span> : <span className="st unsold">Unsold</span>) : cur ? <span className="st live">LIVE</span> : <small className="muted">Pool</small>}</div>
            </li>
          );
        })}
        {!loading && !list.length && <li className="muted pad">No match</li>}
      </ul>
      <Link className="btn ghost sm block" to={`/a/${code}/players`}>View All Players</Link>
    </section>
  );
}

export function SquadRule({ team }) {
  const { auction } = useAuction();
  const { minSquad = 0, maxSquad } = auction.settings;
  const need = Math.max(0, minSquad - team.count);
  const short = auction.status === 'completed' && need > 0;
  return (
    <p className={`rule${short ? ' bad' : ''}`}>
      {maxSquad - team.count} slot{maxSquad - team.count === 1 ? '' : 's'} left of {maxSquad}
      {minSquad > 0 && (short ? ` · Squad incomplete: ${team.count}/${minSquad} minimum` : need ? ` · ${need} more needed for minimum ${minSquad}` : ` · minimum ${minSquad} reached ✓`)}
    </p>
  );
}

export function TeamPanel({ team }) {
  const { auction, code } = useAuction();
  const squads = useSquads(auction);
  if (!team) return <section className="panel team-panel"><h3 className="panel-title">YOUR TEAM</h3><Empty>You are spectating. Pick a team in the lobby to bid.</Empty></section>;
  const sq = squads.find((s) => s.team.short === team.short)?.players || [];
  const rc = roleCounts(sq.map((x) => x.player));
  const pct = Math.min(100, (team.purse / auction.settings.purse) * 100);
  return (
    <section className="panel team-panel">
      <div className="tp-head"><TeamBadge short={team.short} color={team.color} size={38} /><h3>{team.name.toUpperCase()}</h3></div>
      <div className="stat3">
        <div><span className="lbl">PURSE REMAINING</span><b className="green">{cr(team.purse)}</b></div>
        <div><span className="lbl">PLAYERS</span><b>{team.count} / {auction.settings.maxSquad}</b></div>
        <div><span className="lbl">OVERSEAS</span><b>{team.overseas} / {auction.settings.maxOverseas}</b></div>
      </div>
      <div className="bar"><i style={{ width: `${pct}%` }} /></div>
      <SquadRule team={team} />
      <h4 className="sub">SQUAD OVERVIEW</h4>
      <div className="roles4">
        {ROLE_KEYS.map((r) => <div key={r}><span className="lbl">{r === 'Wicketkeeper' ? 'WICKET KEEPERS' : r.toUpperCase() + 'S'}</span><span className="ring">{rc[r]}</span></div>)}
      </div>
      <h4 className="sub">RECENT BUYS</h4>
      {!sq.length ? <Empty>No players bought yet.</Empty> : (
        <ul className="rows tight">
          {[...sq].reverse().slice(0, 4).map((x) => <li key={x.player._id}><Avatar name={x.player.name} src={x.player.imageThumb} size={32} /><span className="grow">{x.player.name}</span><b className="blue">{cr(x.price)}</b></li>)}
        </ul>
      )}
      <Link className="btn ghost sm block" to={`/a/${code}/squad`}>View Full Squad</Link>
    </section>
  );
}

export function SpendingOverview() {
  const { auction } = useAuction();
  const data = auction.teams.map((t, i) => ({ label: t.short, value: t.spent, color: t.color || PALETTE[i % 10] }));
  const top = [...data].sort((a, b) => b.value - a.value);
  return (
    <section className="panel spend">
      <h3 className="panel-title">SPENDING OVERVIEW</h3>
      <div className="spend-body">
        <Donut data={data} />
        <ul className="legend">
          {top.slice(0, 6).map((d) => <li key={d.label}><i style={{ background: d.color }} />{d.label}<b>{cr(d.value)}</b></li>)}
        </ul>
      </div>
    </section>
  );
}

export function TopBuys() {
  const { auction } = useAuction();
  const results = useResults(auction);
  const top = results.filter((r) => r.status === 'sold').sort((a, b) => b.price - a.price).slice(0, 3);
  return (
    <section className="panel topbuys">
      <h3 className="panel-title">TOP BUYS</h3>
      {!top.length ? <Empty>Top buys appear as players sell.</Empty> : (
        <div className="tb-grid">
          {top.map((r) => {
            const t = auction.teams.find((x) => x.short === r.teamShort);
            return (
              <div key={r._id} className="tb-card" style={{ '--tc': t?.color }}>
                <Avatar name={r.player.name} src={r.player.imageThumb} color={t?.color} size={64} square />
                <b className="amt">{cr(r.price)}</b><span>{r.player.name}</span><small>{t?.name}</small>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function AuctionStats() {
  const { auction } = useAuction();
  const { stats } = auction;
  const avg = stats.sold ? stats.totalSpent / stats.sold : 0;
  return (
    <section className="panel stats">
      <h3 className="panel-title">AUCTION STATS</h3>
      <div className="stats-grid">
        <div><span className="lbl">TOTAL PLAYERS</span><b>{stats.total}</b></div>
        <div><span className="lbl">SOLD PLAYERS</span><b className="green">{stats.sold}</b></div>
        <div><span className="lbl">TOTAL SPENT</span><b>{cr(stats.totalSpent)}</b></div>
        <div><span className="lbl">AVERAGE PRICE</span><b>{cr(avg)}</b></div>
      </div>
    </section>
  );
}

export default function Dashboard() {
  const { auction, myTeam } = useAuction();
  if (auction.status === 'lobby') return <Lobby />;
  return (
    <div className="dash">
      <TeamStrip />
      {auction.status === 'completed' && (
        <div className="banner ok">Auction completed. <Link to={`/a/${auction.code}/reports`}>View reports</Link> · <Link to={`/a/${auction.code}/history`}>Full history</Link></div>
      )}
      <div className="grid3">
        <div className="col-players"><PlayersPanel /></div>
        <div className="col-main"><CurrentPlayer /><BidHistory /></div>
        <div className="col-team"><TeamPanel team={myTeam} /></div>
      </div>
      <div className="grid-bottom"><SpendingOverview /><TopBuys /><AuctionStats /></div>
    </div>
  );
}
