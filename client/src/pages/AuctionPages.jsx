import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuction } from '../state';
import { TeamStrip } from '../Layout';
import { Avatar, Empty, TeamBadge } from '../ui';
import { ROLE_KEYS, ROLE_SHORT, ago, cc, cr, roleCounts, teamLabel } from '../utils';
import { BidHistory, CurrentPlayer, TeamPanel, useResults, useSquads } from './Dashboard';
import Lobby from './Lobby';
import SquadActions from '../SquadActions';
import { groupSquad } from '../squadImage';

export function Live() {
  const { auction, myTeam } = useAuction();
  if (auction.status === 'lobby') return <Lobby />;
  return (
    <div className="live-page">
      {myTeam && (
        <div className="mini-team" style={{ '--tc': myTeam.color }}>
          <TeamBadge short={myTeam.short} color={myTeam.color} size={40} />
          <div><b>{myTeam.name}</b><small>Purse {cr(myTeam.purse)} · {myTeam.count}/{auction.settings.maxSquad} · OS {myTeam.overseas}/{auction.settings.maxOverseas}</small></div>
        </div>
      )}
      <CurrentPlayer compact />
      <BidHistory />
    </div>
  );
}

export function Teams() {
  const { auction, myTeamId } = useAuction();
  const squads = useSquads(auction);
  return (
    <section className="panel">
      <h3 className="panel-title">TEAMS</h3>
      <ul className="rows big">
        {auction.teams.map((t) => (
          <li key={t.team} className={t.team === myTeamId ? 'mine' : ''}>
            <TeamBadge short={t.short} color={t.color} size={44} />
            <span className="grow"><b>{t.name}</b><br /><small className="muted">{t.overseas} overseas · {t.isBot ? 'Bot' : t.ownerName}</small></span>
            <span className="right"><b className="green">{cr(t.purse)}</b><br /><small className="muted">{t.count} / {auction.settings.maxSquad}{auction.settings.minSquad ? ` · min ${auction.settings.minSquad}` : ''}</small></span>
            <SquadActions compact team={t} players={squads.find((s) => s.team.short === t.short)?.players || []} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Squad() {
  const { auction, myTeam, myTeamId, isHost } = useAuction();
  const squads = useSquads(auction);
  const [short, setShort] = useState(null);
  const sel = auction.teams.find((t) => t.short === (short || myTeam?.short)) || auction.teams[0];
  const sq = squads.find((s) => s.team.short === sel.short)?.players || [];
  const rc = roleCounts(sq.map((x) => x.player));
  const [role, setRole] = useState('');
  const shown = sq.filter((x) => !role || x.player.role === role);
  return (
    <div className="stack">
      <TeamPanel team={sel} />
      <section className="panel">
        <div className="lobby-head"><h3 className="panel-title">SQUAD</h3>
          <select value={sel.short} onChange={(e) => setShort(e.target.value)} aria-label="Team">{auction.teams.map((t) => <option key={t.short} value={t.short}>{teamLabel(t, { isHost, myTeamId })}</option>)}</select></div>
        <div className="seg wrap">
          <button className={!role ? 'on' : ''} onClick={() => setRole('')}>All ({sq.length})</button>
          {ROLE_KEYS.map((r) => <button key={r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>{ROLE_SHORT[r]} ({rc[r]})</button>)}
        </div>
        {!shown.length ? <Empty>No players yet.</Empty> : (
          <ul className="rows">{shown.map((x) => <li key={x.player._id}><Avatar name={x.player.name} src={x.player.imageThumb} size={40} /><span className="grow"><b>{x.player.name}</b> <span className="code">{cc(x.player.country)}</span><br /><small className="muted">{x.player.role}</small></span><b className="blue">{cr(x.price)}</b></li>)}</ul>
        )}
      </section>

      <section className="panel squad-card" aria-label={`${sel.name} squad card`}>
        <h3 className="panel-title">SQUAD CARD · {sel.short}</h3>
        <div className="sc-stats">
          <span className="sc-os">OS: <b>{sel.overseas}</b></span>
          <span className="sc-purse">Purse: <b>{(sel.purse / 100).toFixed(1)} Cr</b></span>
          <span className="sc-spent">Spent: <b>{(sel.spent / 100).toFixed(1)} Cr</b></span>
        </div>
        <div className="sc-bought">Bought ({sq.length})</div>
        {!sq.length ? <Empty>No players bought yet.</Empty> : groupSquad(sq).map((g) => (
          <div key={g.key}>
            <div className="sc-group">{g.label} ({g.items.length})</div>
            {g.items.map((x) => <div className="sc-row" key={x.player._id}><span>{x.player.name}{x.player.isOverseas && <i className="sc-os-ic" title="Overseas" aria-label="Overseas">◍</i>}</span><b>{(x.price / 100).toFixed(1)} Cr</b></div>)}
          </div>
        ))}
        <SquadActions team={sel} players={sq} />
      </section>
    </div>
  );
}

export function Bids() {
  const { auction } = useAuction();
  const [bids, setBids] = useState(null);
  const n = auction.stats.sold + auction.stats.unsold + (auction.live?.bidCount || 0);
  useEffect(() => { api(`/auctions/${auction.code}/bids`).then(setBids).catch(() => setBids([])); }, [auction.code, n]);
  return (
    <section className="panel">
      <h3 className="panel-title">LATEST BIDS</h3>
      {!bids ? <p className="muted">Loading…</p> : !bids.length ? <Empty>No bids yet.</Empty> : (
        <ul className="rows">{bids.map((b) => <li key={b._id}><TeamBadge short={b.teamShort} color={auction.teams.find((t) => t.team === b.team)?.color} size={26} /><span className="grow">{b.teamShort}{b.byBot ? <small className="muted"> (bot)</small> : ''}</span><b>{cr(b.amount)}</b><small className="muted">{ago(b.createdAt)}</small></li>)}</ul>
      )}
    </section>
  );
}

export function History() {
  const { auction } = useAuction();
  const results = useResults(auction);
  const [tab, setTab] = useState('all');
  const list = results.filter((r) => tab === 'all' || r.status === tab);
  return (
    <section className="panel">
      <h3 className="panel-title">AUCTION HISTORY</h3>
      <div className="seg">{['all', 'sold', 'unsold'].map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>)}</div>
      {!list.length ? <Empty>Nothing here yet.</Empty> : (
        <ul className="rows">
          {list.map((r) => {
            const t = auction.teams.find((x) => x.short === r.teamShort);
            return <li key={r._id}><Avatar name={r.player?.name} src={r.player?.imageThumb} size={40} /><span className="grow"><b>{r.player?.name}</b><br /><small className="muted">{r.player?.role} · {r.bidCount} bids · base {cr(r.basePrice)}</small></span>
              {r.status === 'sold' ? <span className="right"><b className="blue">{cr(r.price)}</b><br /><small>{t && <TeamBadge short={t.short} color={t.color} size={18} />} {r.teamShort}</small></span> : <span className="st unsold">Unsold</span>}</li>;
          })}
        </ul>
      )}
    </section>
  );
}

export function Reports() {
  const { auction } = useAuction();
  const results = useResults(auction);
  const [tab, setTab] = useState('team');
  const max = Math.max(1, ...auction.teams.map((t) => t.spent));
  const sold = results.filter((r) => r.status === 'sold');
  const byRole = ROLE_KEYS.map((r) => { const x = sold.filter((s) => s.player?.role === r); return { r, n: x.length, avg: x.length ? x.reduce((n, s) => n + s.price, 0) / x.length : 0 }; });
  const priciest = [...sold].sort((a, b) => b.price - a.price).slice(0, 5);
  return (
    <div className="stack">
      <TeamStrip />
      <section className="panel">
        <h3 className="panel-title">REPORTS</h3>
        <div className="seg"><button className={tab === 'team' ? 'on' : ''} onClick={() => setTab('team')}>Team spending</button><button className={tab === 'player' ? 'on' : ''} onClick={() => setTab('player')}>Player stats</button></div>
        {tab === 'team' ? (
          <ul className="bars">
            {[...auction.teams].sort((a, b) => b.spent - a.spent).map((t) => (
              <li key={t.team}><span className="bl">{t.short}</span><span className="bt"><i style={{ width: `${(t.spent / max) * 100}%`, background: t.color }} /></span><b>{cr(t.spent)}</b></li>
            ))}
          </ul>
        ) : (
          <>
            <h4 className="sub">AVERAGE PRICE BY ROLE</h4>
            <ul className="rows tight">{byRole.map((x) => <li key={x.r}><span className="grow">{x.r}</span><small className="muted">{x.n} sold</small><b>{cr(x.avg)}</b></li>)}</ul>
            <h4 className="sub">MOST EXPENSIVE</h4>
            {!priciest.length ? <Empty>No sales yet.</Empty> : <ul className="rows tight">{priciest.map((r) => <li key={r._id}><span className="grow">{r.player?.name}</span><small>{r.teamShort}</small><b className="blue">{cr(r.price)}</b></li>)}</ul>}
          </>
        )}
      </section>
    </div>
  );
}
