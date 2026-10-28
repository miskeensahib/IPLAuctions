import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuction } from '../state';
import { Avatar, Empty, ErrorBox, Spinner, VerifyTag } from '../ui';
import { cc, cr } from '../utils';
import { useResults } from './Dashboard';
import { useWatchlist } from './Watchlist';

const ROLES = ['Batter', 'Bowler', 'All-rounder', 'Wicketkeeper', 'Unassigned'];

// Auction status shown only for what happened in THIS auction: sold (price + team), unsold, or nothing yet.
function Detail({ p, onClose, wl, inAuction, result }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={p.name} onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn x" onClick={onClose} aria-label="Close">✕</button>
        <div className="cp-top"><Avatar name={p.name} src={p.imageThumb} size={110} square />
          <div className="cp-info"><div className="cp-name">{p.name} <span className="code">{cc(p.country)}</span></div>
            <div className="chips"><span className="chip">{p.role}</span>{p.isOverseas && <span className="chip gold">Overseas</span>}</div>
            <div className="tags"><VerifyTag ok={p.profileVerified} label="Profile" /><VerifyTag ok={p.basePriceVerified} label="Base price" /></div>
          </div>
        </div>
        <dl className="kv">
          <div><dt>Country</dt><dd>{p.country}</dd></div>
          <div><dt>Base price</dt><dd>{p.basePrice ? cr(p.basePrice) : 'Estimated at auction time'}</dd></div>
          <div><dt>IPL team</dt><dd>{p.team || '—'}</dd></div>
          {inAuction && <div><dt>Auction status</dt><dd>{result?.status === 'sold' ? `Sold to ${result.teamShort} for ${cr(result.price)}` : result?.status === 'unsold' ? 'Unsold' : 'Not auctioned yet'}</dd></div>}
          <div><dt>Previous team</dt><dd>{p.previousTeam || 'Not available'}</dd></div>
          <div><dt>Career stats</dt><dd>{p.stats && Object.keys(p.stats).length ? Object.entries(p.stats).map(([k, v]) => `${k}: ${v}`).join(' · ') : 'Not available'}</dd></div>
        </dl>
        {p.source && <p className="muted small">Profile source: <a href={p.source} target="_blank" rel="noreferrer">iplt20.com</a></p>}
        <button className="btn primary block" onClick={() => wl.toggle(p._id)}>{wl.has(p._id) ? '★ Remove from watchlist' : '☆ Add to watchlist'}</button>
      </div>
    </div>
  );
}

export default function Players() {
  const [f, setF] = useState({ q: '', role: '', overseas: '', team: '', sort: 'marquee' });
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState(null);
  const [sel, setSel] = useState(null);
  const wl = useWatchlist();
  const { auction } = useAuction() || {}; // null outside an auction (the plain /players catalogue)
  const results = useResults(auction);
  const byPlayer = useMemo(() => new Map(results.map((r) => [String(r.player?._id), r])), [results]);

  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page, limit: 30 });
      setErr(null);
      api(`/players?${qs}`).then(setData).catch((e) => setErr(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [f, page]);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };

  return (
    <section className="panel">
      <h3 className="panel-title">PLAYERS {data && <small className="muted">({data.total})</small>}</h3>
      <div className="filters">
        <input type="search" placeholder="Search players…" value={f.q} onChange={set('q')} aria-label="Search" />
        <select value={f.role} onChange={set('role')} aria-label="Role"><option value="">All roles</option>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
        <select value={f.overseas} onChange={set('overseas')} aria-label="Nationality"><option value="">All nationalities</option><option value="false">Indian</option><option value="true">Overseas</option></select>
        <select value={f.team} onChange={set('team')} aria-label="IPL team"><option value="">All teams</option>{['CSK', 'MI', 'RCB', 'KKR', 'SRH', 'RR', 'PBKS', 'DC', 'LSG', 'GT'].map((t) => <option key={t}>{t}</option>)}</select>
        <select value={f.sort} onChange={set('sort')} aria-label="Sort"><option value="marquee">Prominent first</option><option value="name">Name</option></select>
      </div>
      {err ? <ErrorBox>{err}</ErrorBox> : !data ? <Spinner /> : !data.items.length ? <Empty>No players match.</Empty> : (
        <>
          <ul className="cards">
            {data.items.map((p) => (
              <li key={p._id}>
                <button className="pcard" onClick={() => setSel(p)}>
                  <Avatar name={p.name} src={p.imageThumb} size={52} />
                  <span className="grow"><b>{p.name}</b> <span className="code">{cc(p.country)}</span><br /><small className="muted">{p.role}</small></span>
                  <span className="pc-price">
                    <small className="muted">{p.team || '—'}</small>
                    {byPlayer.get(p._id)?.status === 'sold' && <><b>{cr(byPlayer.get(p._id).price)}</b><small>Sold · {byPlayer.get(p._id).teamShort}</small></>}
                    {byPlayer.get(p._id)?.status === 'unsold' && <small className="unsold-tag">Unsold</small>}
                  </span>
                </button>
                <button className="star" aria-label="Toggle watchlist" onClick={() => wl.toggle(p._id)}>{wl.has(p._id) ? '★' : '☆'}</button>
              </li>
            ))}
          </ul>
          <div className="pager">
            <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
            <span>Page {data.page} / {data.pages || 1}</span>
            <button className="btn ghost sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </>
      )}
      {sel && <Detail p={sel} wl={wl} inAuction={!!auction} result={byPlayer.get(sel._id)} onClose={() => setSel(null)} />}
    </section>
  );
}
