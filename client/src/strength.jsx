import { useEffect, useState } from 'react';
import { api } from './api';
import { Avatar, Empty, Presence, Spinner, TeamBadge } from './ui';
import { cc, cr } from './utils';

// Live player strength + team ranking. The data comes from GET /api/auctions/:code/strength, which only ever contains
// players SOLD in this auction, and it is re-fetched after every sale so averages and ranks update by themselves.
// Every player has a score: kind 'stats' (real IPL career statistics) or 'estimated' (role + price based, labelled "est.").
const inflight = new Map();
const fetchStrength = (code, sold) => {
  const key = `${code}:${sold}`;
  if (!inflight.has(key)) inflight.set(key, api(`/auctions/${code}/strength`).finally(() => setTimeout(() => inflight.delete(key), 1500)));
  return inflight.get(key);
};
export function useStrength(auction) {
  const [data, setData] = useState(null);
  const sold = auction ? auction.stats.sold : 0;
  useEffect(() => {
    if (!auction) return undefined;
    let alive = true;
    fetchStrength(auction.code, sold).then((d) => alive && setData(d)).catch(() => {});
    return () => { alive = false; };
  }, [auction?.code, sold]); // eslint-disable-line react-hooks/exhaustive-deps
  return data;
}

export const tier = (v) => (v == null ? 'none' : v >= 80 ? 'elite' : v >= 65 ? 'high' : v >= 50 ? 'mid' : 'low');

// kind: 'stats' | 'estimated'. An estimate has a dashed ring and an "est." label so it is never mistaken for a stat-based score.
export function StrengthBadge({ value, note, kind }) {
  const est = kind === 'estimated';
  const label = value == null ? (note || 'No strength available') : `${est ? 'Estimated strength' : 'Strength'} ${value.toFixed(1)} out of 100${est && note ? `. ${note}` : ''}`;
  return (
    <span className={`sb-wrap${est ? ' est' : ''}`}>
      <span className={`sbadge ${tier(value)}${est ? ' est' : ''}`} title={label} aria-label={label}>{value == null ? '–' : Math.round(value)}</span>
      {est && <i className="est-tag">est.</i>}
    </span>
  );
}

export function TeamRanking({ data, selected, onSelect, labelOf, onlineOf }) {
  if (!data) return <section className="panel"><h3 className="panel-title">TEAM RANKING · AVERAGE STRENGTH</h3><Spinner /></section>;
  const any = data.teams.some((t) => t.rank);
  return (
    <section className="panel rank-panel" aria-label="Team ranking by average strength">
      <h3 className="panel-title">TEAM RANKING · AVERAGE STRENGTH</h3>
      <ol className="rank-list">
        {data.teams.map((t) => (
          <li key={t.short}>
            <button type="button" className={`rank-row${selected === t.short ? ' on' : ''}`} onClick={() => onSelect && onSelect(t.short)} aria-pressed={selected === t.short}>
              <span className={`rank-no${t.rank && t.rank <= 3 ? ` r${t.rank}` : ''}`}>{t.rank ? `#${t.rank}` : '–'}</span>
              <TeamBadge short={t.short} color={t.color} size={34} />
              <span className="grow rank-name">
                <b>{(() => { const o = onlineOf && onlineOf(t.short); return o ? <Presence online={o.online} name={o.name} /> : null; })()}{labelOf ? labelOf(t.short) : t.name}</b>
                <small className="muted">{t.count} bought{t.count ? ` · ${t.rated} from stats${t.estimated ? ` · ${t.estimated} est.` : ''}` : ''}{t.best ? ` · best: ${t.best.name} (${Math.round(t.best.strength)})` : ''}</small>
              </span>
              <span className="rank-avg">
                <b className={tier(t.avg)}>{t.avg == null ? '—' : t.avg.toFixed(1)}</b>
                <i className={`bar ${tier(t.avg)}`} style={{ width: `${t.avg || 0}%` }} />
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="muted small">
        {any ? 'A team’s strength is the average of the strength (0–100) of every player it has bought. Scores marked "est." are estimates for players with no usable IPL statistics (based on role and price); all others come from real IPL career stats.' : 'Rankings appear as soon as teams buy players.'}
      </p>
    </section>
  );
}

const fmt = (v, d = 2) => (v === null || v === undefined ? '—' : typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(d) : v);
const Row = ({ k, v }) => <div><dt>{k}</dt><dd>{v}</dd></div>;

function StatsDetail({ p }) {
  const s = p.stats, est = p.breakdown?.estimate, pr = p.profile || {};
  const bars = p.breakdown && !est ? [['Batting', p.breakdown.batting], ['Bowling', p.breakdown.bowling], ['Fielding', p.breakdown.fielding]].filter(([, v]) => v != null) : [];
  const facts = [['Born', pr.born], ['Batting style', pr.battingStyle], ['Bowling style', pr.bowlingStyle], ['IPL debut', pr.iplDebut], ['Jersey', pr.jersey]].filter(([, v]) => v);
  const b = s?.batting, w = s?.bowling, f = s?.fielding;
  return (
    <div className="pp-detail">
      {p.kind === 'estimated' && (
        <div className="est-note">
          <b>Estimated strength.</b> {p.note}.
          {est && <> Starting point {est.rolePrior}{est.priceBonus ? `, +${est.priceBonus} price` : ''}{est.experienceBonus ? `, +${est.experienceBonus} IPL matches` : ''}; estimates stay between {est.min} and {est.max}.</>}
          {' '}It becomes a stats-based score once the player has enough IPL data.
        </div>
      )}
      {facts.length > 0 && <dl className="facts">{facts.map(([k, v]) => <Row key={k} k={k} v={v} />)}</dl>}
      {s && <p className="muted small">{s.matches} IPL matches · {s.firstSeason}–{s.lastSeason}{p.kind === 'stats' && p.note ? ` · ${p.note}` : ''}</p>}
      {bars.length > 0 && (
        <div className="bk" aria-label="How the strength is made up">
          {bars.map(([k, v]) => <div key={k}><span>{k}</span><span className="bk-bar"><i className={tier(v)} style={{ width: `${v}%` }} /></span><b>{Math.round(v)}</b></div>)}
        </div>
      )}
      {s ? (
        <div className="stat-groups">
          {b.innings > 0 && <dl><h4>Batting</h4><Row k="Runs" v={fmt(b.runs)} /><Row k="Average" v={fmt(b.average)} /><Row k="Strike rate" v={fmt(b.strikeRate)} /><Row k="100s / 50s" v={`${b.hundreds} / ${b.fifties}`} /><Row k="4s / 6s" v={`${b.fours} / ${b.sixes}`} /><Row k="High score" v={fmt(b.highScore)} /></dl>}
          {w.balls > 0 && <dl><h4>Bowling</h4><Row k="Wickets" v={fmt(w.wickets)} /><Row k="Average" v={fmt(w.average)} /><Row k="Economy" v={fmt(w.economy)} /><Row k="Strike rate" v={fmt(w.strikeRate)} /><Row k="Best" v={fmt(w.best)} /><Row k="Overs" v={fmt(w.overs)} /></dl>}
          <dl><h4>Fielding</h4><Row k="Catches" v={fmt(f.catches)} /><Row k="Run outs" v={fmt(f.runOuts)} /><Row k="Stumpings" v={fmt(f.stumpings)} /></dl>
        </div>
      ) : <p className="muted small">No IPL career statistics are available for this player.</p>}
    </div>
  );
}

export function PurchasedPlayers({ data, teams, labelOf }) {
  const [team, setTeam] = useState('');
  const [sort, setSort] = useState('latest');
  const [open, setOpen] = useState(null);
  if (!data) return <section className="panel"><h3 className="panel-title">PURCHASED PLAYERS · STRENGTH</h3><Spinner /></section>;
  const list = data.players.filter((p) => !team || p.team === team)
    .sort(sort === 'strength' ? (a, b) => (b.strength ?? -1) - (a.strength ?? -1) || b.order - a.order : (a, b) => b.order - a.order);
  const teamOf = (short) => teams.find((t) => t.short === short);
  return (
    <section className="panel purchased" aria-label="All purchased players with strength">
      <div className="lobby-head">
        <h3 className="panel-title">PURCHASED PLAYERS · STRENGTH <small className="muted">({data.players.length})</small></h3>
        <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Filter by team"><option value="">All teams</option>{teams.map((t) => <option key={t.short} value={t.short}>{labelOf ? labelOf(t.short) : t.name}</option>)}</select>
      </div>
      <div className="seg"><button className={sort === 'latest' ? 'on' : ''} onClick={() => setSort('latest')}>Latest sold</button><button className={sort === 'strength' ? 'on' : ''} onClick={() => setSort('strength')}>Highest strength</button></div>
      {!list.length ? <Empty>{data.players.length ? 'No purchases for this team yet.' : 'No player has been sold yet. Strength shows here the moment a player is bought.'}</Empty> : (
        <ul className="rows pp-list">
          {list.map((p) => (
            <li key={p.id} className={`pp${open === p.id ? ' open' : ''}`}>
              <button type="button" className="pp-main" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>
                <Avatar name={p.name} src={p.imageThumb} size={44} />
                <span className="grow pp-name">
                  <b>{p.name}</b> <span className="code">{cc(p.country)}</span>
                  <small className="muted">{p.role}</small>
                </span>
                <span className="pp-team"><TeamBadge short={p.team} color={teamOf(p.team)?.color} size={26} /><small>{p.team}</small></span>
                <span className="pp-price"><b className="blue">{cr(p.price)}</b><small className="muted">sold</small></span>
                <StrengthBadge value={p.strength} note={p.note} kind={p.kind} />
                <span className="pp-caret" aria-hidden="true">{open === p.id ? '▴' : '▾'}</span>
              </button>
              {open === p.id && <StatsDetail p={p} />}
            </li>
          ))}
        </ul>
      )}
      <details className="how">
        <summary>How strength is calculated</summary>
        <ul>{(data.method || []).map((m, i) => <li key={i}>{m}</li>)}</ul>
        {data.source && <p className="muted small">Statistics: <a href="https://cricsheet.org" target="_blank" rel="noreferrer">{data.source.name}</a> ({data.source.license}), {data.source.matches} matches, seasons {data.source.seasons.join(' to ')}. Squads and profile details: iplt20.com.</p>}
      </details>
    </section>
  );
}
