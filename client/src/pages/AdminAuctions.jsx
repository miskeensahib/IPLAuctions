import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../state';
import { Empty, Spinner, TeamBadge } from '../ui';
import { cr } from '../utils';

// Admin "Auctions" tab: every auction with its bids (Read), create a new one (Create), edit its details/rules (Update)
// and delete it with everything recorded for it (Delete). Bids are a read-only log so results and purses stay correct.
const A = (path, opts) => api(`/admin${path}`, { admin: true, ...opts });
const when = (d) => new Date(d).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const STATUS = { lobby: 'Lobby', live: 'Live', paused: 'Paused', completed: 'Completed' };
const Status = ({ s }) => <span className={`st ${s}`}>{STATUS[s] || s}</span>;

export default function AuctionsAdmin() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);     // { code, edit }
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => A('/auctions').then(setList).catch((e) => { toast.err(e.message); setList([]); }), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const remove = async (a) => {
    if (!window.confirm(`Delete auction ${a.code} "${a.name}"?\n\nThis permanently removes its ${a.bids} bids, ${a.sold + a.unsold} results and all squads. It cannot be undone.`)) return;
    try {
      const r = await A(`/auctions/${a.code}`, { method: 'DELETE' });
      toast.ok(`Deleted ${a.code}: ${r.removed.bids} bids, ${r.removed.results} results, ${r.removed.squads} squads`);
      load();
    } catch (e) { toast.err(e.message); }
  };

  if (creating) return <CreateAuction onBack={(code) => { setCreating(false); if (code) setOpen({ code, edit: false }); load(); }} />;
  if (open) return <AuctionDetail key={open.code} code={open.code} startEditing={open.edit} onBack={() => { setOpen(null); load(); }} />;

  return (
    <section className="panel">
      <div className="lobby-head">
        <h3 className="panel-title">AUCTIONS {list && <small className="muted">({list.length})</small>}</h3>
        <div className="row-btns" style={{ margin: 0 }}>
          <button className="btn ghost sm" onClick={load}>Refresh</button>
          <button className="btn primary sm" onClick={() => setCreating(true)}>+ New auction</button>
        </div>
      </div>
      {!list ? <Spinner /> : !list.length ? <Empty>No auctions yet.</Empty> : (
        <ul className="rows">
          {list.map((a) => (
            <li key={a.code} className="admin-row">
              <span className="grow">
                <b>{a.name}</b> <small className="muted">#{a.code}</small> <Status s={a.status} /><br />
                <small className="muted">{a.mode} · {a.play} · host {a.hostName} · {when(a.createdAt)}</small><br />
                <small className="muted">Users: {a.players.length ? a.players.join(', ') : 'none (bots only)'}</small>
              </span>
              <span className="right">
                <b>{a.bids}</b> <small className="muted">bids ({a.bidsByUsers} by users)</small><br />
                <small className="muted">{a.sold} sold · {a.unsold} unsold · {cr(a.totalSpent)}</small>
              </span>
              <span className="row-btns" style={{ margin: 0 }}>
                <button className="btn ghost sm" onClick={() => setOpen({ code: a.code, edit: false })}>View</button>
                <button className="btn ghost sm" onClick={() => setOpen({ code: a.code, edit: true })}>Edit</button>
                <button className="btn ghost sm danger" onClick={() => remove(a)}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CreateAuction({ onBack }) {
  const toast = useToast();
  const [modes, setModes] = useState(null);
  const [f, setF] = useState({ name: '', mode: 'mini', play: 'multi', hostName: 'Admin' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/auctions/modes').then(setModes).catch((e) => toast.err(e.message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const create = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const { code } = await A('/auctions', { method: 'POST', body: { ...f, name: f.name.trim() || undefined } });
      toast.ok(`Auction ${code} created`); onBack(code);
    } catch (er) { toast.err(er.message); setBusy(false); }
  };
  if (!modes) return <Spinner />;
  const m = modes.find((x) => x.key === f.mode);
  return (
    <form className="panel" onSubmit={create}>
      <h3 className="panel-title">NEW AUCTION</h3>
      <div className="adv">
        <label className="field"><span>Name (optional)</span><input value={f.name} onChange={set('name')} maxLength={60} placeholder={m ? `${m.label}` : ''} /></label>
        <label className="field"><span>Mode</span><select value={f.mode} onChange={set('mode')}>{modes.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
        <label className="field"><span>Play style</span><select value={f.play} onChange={set('play')}><option value="multi">Multiplayer room</option><option value="solo">Solo vs bots</option></select></label>
        <label className="field"><span>Host name</span><input required value={f.hostName} onChange={set('hostName')} maxLength={30} /></label>
      </div>
      {m && <p className="muted small">{m.description} Purse {cr(m.purse)}, {m.minSquad ? `${m.minSquad}-` : 'max '}{m.maxSquad} players. You can adjust the rules after creating it, until it starts.</p>}
      <p className="muted small">This browser becomes the host: open the auction from Home with its code, pick a team and start it.</p>
      <div className="row-btns"><button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create auction'}</button><button type="button" className="btn ghost" onClick={() => onBack()}>Cancel</button></div>
    </form>
  );
}

function AuctionDetail({ code, startEditing, onBack }) {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [editing, setEditing] = useState(!!startEditing);
  const load = useCallback(() => A(`/auctions/${code}`).then(setD).catch((e) => { toast.err(e.message); onBack(); }), [code]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  if (!d) return <Spinner />;

  const end = async () => {
    if (!window.confirm('End this auction now? The current player is closed and nobody can bid any more.')) return;
    try { await A(`/auctions/${code}/end`, { method: 'POST' }); toast.ok('Auction ended'); load(); } catch (e) { toast.err(e.message); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete auction ${d.code} "${d.name}" with its ${d.bids} bids, ${d.results.length} results and squads? This cannot be undone.`)) return;
    try { await A(`/auctions/${code}`, { method: 'DELETE' }); toast.ok('Auction deleted'); onBack(); } catch (e) { toast.err(e.message); }
  };
  const s = d.settings;
  return (
    <div className="stack">
      <section className="panel">
        <div className="lobby-head">
          <div>
            <h3 className="panel-title" style={{ marginBottom: 4 }}>{d.name} <small className="muted">#{d.code}</small> <Status s={d.status} /></h3>
            <p className="muted small">{d.mode} · {d.play} · host {d.hostName} · created {when(d.createdAt)} · {d.bids} bids ({d.bidsByUsers} by users) · {d.results.length}/{d.poolTotal ?? '?'} players done</p>
          </div>
          <div className="row-btns" style={{ margin: 0 }}>
            <button className="btn ghost sm" onClick={onBack}>← Back</button>
            <button className="btn ghost sm" onClick={() => setEditing(!editing)}>{editing ? 'Close edit' : 'Edit'}</button>
            {(d.status === 'live' || d.status === 'paused') && <button className="btn ghost sm danger" onClick={end}>End auction</button>}
            <button className="btn ghost sm danger" onClick={remove}>Delete</button>
          </div>
        </div>
        <p className="muted small">Purse {cr(s.purse)} · squad {s.minSquad ? `${s.minSquad}-` : 'max '}{s.maxSquad} · overseas max {s.maxOverseas} · timer {s.initialSeconds}s</p>
      </section>

      {editing && <EditAuction d={d} onSaved={() => { toast.ok('Auction updated'); load(); }} />}

      <section className="panel">
        <h3 className="panel-title">TEAMS</h3>
        <ul className="rows">
          {d.teams.map((t) => (
            <li key={t.team} className="admin-row">
              <TeamBadge short={t.short} color={t.color} size={32} />
              <span className="grow"><b>{t.name}</b><br /><small className="muted">{t.isBot ? 'Bot' : `User: ${t.ownerName}`}</small></span>
              <span className="right"><b className="green">{cr(t.purse)}</b><br /><small className="muted">{t.count}/{s.maxSquad} players · spent {cr(t.spent)}</small></span>
            </li>
          ))}
        </ul>
      </section>

      <BidLog code={code} teams={d.teams} />

      <section className="panel">
        <h3 className="panel-title">RESULTS <small className="muted">({d.results.length})</small></h3>
        {!d.results.length ? <Empty>No players sold or passed yet.</Empty> : (
          <ul className="rows" style={{ maxHeight: 360, overflowY: 'auto' }}>
            {d.results.map((r) => (
              <li key={r._id} className="admin-row"><span className="grow"><b>{r.player?.name || 'Removed player'}</b> <small className="muted">{r.player?.role} · base {cr(r.basePrice)} · {r.bidCount} bids</small></span>
                {r.status === 'sold' ? <span className="right"><b className="blue">{cr(r.price)}</b> <small>{r.teamShort}</small></span> : <span className="st unsold">Unsold</span>}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EditAuction({ d, onSaved }) {
  const toast = useToast();
  const s = d.settings;
  const lobby = d.status === 'lobby';
  const done = d.status === 'completed';
  const [f, setF] = useState({ name: d.name, hostName: d.hostName, purse: s.purse / 100, minSquad: s.minSquad || 0, maxSquad: s.maxSquad, maxOverseas: s.maxOverseas, seconds: s.initialSeconds });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const body = { name: f.name, hostName: f.hostName };
      if (!done && Number(f.seconds) !== s.initialSeconds) { body.initialSeconds = Number(f.seconds); body.resetSeconds = Number(f.seconds); }
      if (lobby) {
        if (Math.round(Number(f.purse) * 100) !== s.purse) body.purse = Math.round(Number(f.purse) * 100);
        for (const k of ['minSquad', 'maxSquad', 'maxOverseas']) if (Number(f[k]) !== (s[k] || 0)) body[k] = Number(f[k]);
      }
      if (body.name === d.name) delete body.name;
      if (body.hostName === d.hostName) delete body.hostName;
      if (!Object.keys(body).length) { toast.info('Nothing changed'); return; }
      await A(`/auctions/${d.code}`, { method: 'PUT', body }); onSaved();
    } catch (er) { toast.err(er.message); } finally { setBusy(false); }
  };
  const num = (k, label, extra = {}) => <label className="field"><span>{label}</span><input type="number" min="0" value={f[k]} onChange={set(k)} disabled={extra.disabled} {...extra} /></label>;
  return (
    <form className="panel" onSubmit={save}>
      <h3 className="panel-title">EDIT AUCTION</h3>
      <div className="adv">
        <label className="field"><span>Name</span><input required value={f.name} onChange={set('name')} maxLength={60} /></label>
        <label className="field"><span>Host name</span><input required value={f.hostName} onChange={set('hostName')} maxLength={30} /></label>
        {num('seconds', 'Bid timer (seconds)', { disabled: done, step: 1 })}
        {num('purse', 'Purse (Cr)', { disabled: !lobby, step: 5 })}
        {num('minSquad', 'Min squad', { disabled: !lobby })}
        {num('maxSquad', 'Max squad', { disabled: !lobby })}
        {num('maxOverseas', 'Max overseas', { disabled: !lobby })}
      </div>
      <p className="muted small">{lobby ? 'Purse and squad rules can be changed until the auction starts.' : 'Purse and squad rules are locked once an auction has started.'} {done && 'This auction is finished, so only its name and host name can change.'}</p>
      <div className="row-btns"><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
    </form>
  );
}

// Read-only audit log of every bid: who (user or bot), which team, which player, how much, when.
function BidLog({ code, teams }) {
  const toast = useToast();
  const [f, setF] = useState({ human: false, team: '', q: '' });
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  useEffect(() => { const t = setTimeout(() => { setQ(f.q); setPage(1); }, 300); return () => clearTimeout(t); }, [f.q]);
  const load = useCallback(() => {
    const qs = new URLSearchParams({ page, limit: 25 });
    if (f.human) qs.set('human', 'true');
    if (f.team) qs.set('team', f.team);
    if (q) qs.set('q', q);
    return A(`/auctions/${code}/bids?${qs}`).then(setData).catch((e) => toast.err(e.message));
  }, [code, page, f.human, f.team, q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  return (
    <section className="panel">
      <div className="lobby-head"><h3 className="panel-title">BID LOG {data && <small className="muted">({data.total})</small>}</h3><button className="btn ghost sm" onClick={load}>Refresh</button></div>
      <div className="filters" style={{ gridTemplateColumns: '2fr 1fr auto' }}>
        <input type="search" placeholder="Search player…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Search player" />
        <select value={f.team} onChange={(e) => { setF({ ...f, team: e.target.value }); setPage(1); }} aria-label="Team"><option value="">All teams</option>{teams.map((t) => <option key={t.short} value={t.short}>{t.short}</option>)}</select>
        <label className="check"><input type="checkbox" checked={f.human} onChange={(e) => { setF({ ...f, human: e.target.checked }); setPage(1); }} /> Users only</label>
      </div>
      {!data ? <Spinner /> : !data.items.length ? <Empty>No bids match.</Empty> : (
        <>
          <ul className="rows">
            {data.items.map((b) => (
              <li key={b._id} className="admin-row">
                <TeamBadge short={b.teamShort} color={teams.find((t) => t.short === b.teamShort)?.color} size={28} />
                <span className="grow"><b>{b.player?.name || 'Removed player'}</b><br /><small className="muted">{when(b.createdAt)} · {b.byBot ? 'Bot' : `User: ${b.bidderName || 'unknown'}`}</small></span>
                <b className="blue">{cr(b.amount)}</b>
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
    </section>
  );
}
