import { useEffect, useState } from 'react';
import { adminKey, api } from '../api';
import { useToast } from '../state';
import { Spinner, VerifyTag } from '../ui';
import { cr } from '../utils';

const ROLES = ['Batter', 'Bowler', 'All-rounder', 'Wicketkeeper', 'Unassigned'];
const blank = { name: '', country: 'India', role: 'Unassigned', basePrice: '', soldTo: '', soldPrice: '', auctionStatus: 'upcoming', profileVerified: false, basePriceVerified: false };

// Admin Panel: reached only by typing /admin. Everything inside (Players and Settings) needs the ADMIN_KEY,
// which the server checks (GET /api/admin/check); the server also re-checks it on every admin action.
export default function Admin() {
  const toast = useToast();
  const [key, setKey] = useState('');
  const [state, setState] = useState(adminKey.get() ? 'checking' : 'locked'); // locked | checking | open
  const [tab, setTab] = useState('players');

  const verify = async (k) => {
    adminKey.set(k);
    try { await api('/admin/check', { admin: true }); setState('open'); }
    catch (er) { adminKey.set(''); setState('locked'); throw er; } // fails closed: any error keeps it locked
  };
  useEffect(() => { if (state === 'checking') verify(adminKey.get()).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const unlock = async (e) => {
    e.preventDefault();
    try { await verify(key.trim()); setKey(''); } catch (er) { toast.err(er.message); }
  };
  const lock = () => { adminKey.set(''); setState('locked'); };

  if (state === 'checking') return <Spinner label="Checking admin session…" />;
  if (state === 'locked') {
    return (
      <form className="panel narrow" onSubmit={unlock}>
        <h3 className="panel-title">ADMIN LOGIN</h3>
        <p className="muted">Enter the admin key to manage players and auction settings.</p>
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Admin key" aria-label="Admin key" autoComplete="off" />
        <button className="btn primary block" disabled={!key.trim()}>LOGIN</button>
      </form>
    );
  }
  return (
    <div className="stack">
      <div className="panel admin-bar">
        <div className="seg" role="tablist" aria-label="Admin sections">
          <button role="tab" aria-selected={tab === 'players'} className={tab === 'players' ? 'on' : ''} onClick={() => setTab('players')}>Players</button>
          <button role="tab" aria-selected={tab === 'settings'} className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>Settings</button>
        </div>
        <button className="btn ghost sm" onClick={lock}>Log out of Admin</button>
      </div>
      {tab === 'players' ? <PlayersAdmin /> : <Settings />}
    </div>
  );
}

function PlayersAdmin() {
  const toast = useToast();
  const [players, setPlayers] = useState(null);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [bulk, setBulk] = useState('');
  const [q, setQ] = useState('');

  const load = () => api(`/players?limit=200&q=${encodeURIComponent(q)}`).then((r) => setPlayers(r.items)).catch((e) => toast.err(e.message));
  useEffect(() => { load(); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const payload = (f) => ({ ...f, basePrice: f.basePrice === '' || f.basePrice == null ? null : Math.round(Number(f.basePrice) * 100), soldPrice: f.soldPrice === '' || f.soldPrice == null ? null : Math.round(Number(f.soldPrice) * 100), soldTo: f.soldTo || null });
  const save = async (e) => {
    e.preventDefault();
    try {
      if (editing) await api(`/players/${editing}`, { method: 'PUT', admin: true, body: payload(form) });
      else await api('/players', { method: 'POST', admin: true, body: payload(form) });
      toast.ok(editing ? 'Player updated' : 'Player added'); setForm(blank); setEditing(null); load();
    } catch (er) { toast.err(er.message); }
  };
  const edit = (p) => { setEditing(p._id); setForm({ ...p, basePrice: p.basePrice ? p.basePrice / 100 : '', soldPrice: p.soldPrice ? p.soldPrice / 100 : '', soldTo: p.soldTo || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const del = async (p) => { if (!window.confirm(`Delete ${p.name}?`)) return; try { await api(`/players/${p._id}`, { method: 'DELETE', admin: true }); toast.ok('Deleted'); load(); } catch (er) { toast.err(er.message); } };
  const importBulk = async () => {
    try {
      const list = JSON.parse(bulk);
      const r = await api('/players/bulk', { method: 'POST', admin: true, body: { players: list } });
      toast.ok(`Imported: ${r.inserted} new, ${r.updated} updated`); setBulk(''); load();
    } catch (er) { toast.err(er instanceof SyntaxError ? 'Invalid JSON' : er.message); }
  };
  const f = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <>
      <form className="panel" onSubmit={save}>
        <h3 className="panel-title">{editing ? 'EDIT PLAYER' : 'ADD PLAYER'}</h3>
        <div className="adv">
          <label className="field"><span>Name</span><input required value={form.name} onChange={f('name')} disabled={!!editing} /></label>
          <label className="field"><span>Country</span><input value={form.country} onChange={f('country')} /></label>
          <label className="field"><span>Role</span><select value={form.role} onChange={f('role')}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
          <label className="field"><span>Base price (Cr)</span><input type="number" step="0.05" min="0" value={form.basePrice ?? ''} onChange={f('basePrice')} /></label>
          <label className="field"><span>Status</span><select value={form.auctionStatus} onChange={f('auctionStatus')}><option>upcoming</option><option>sold</option><option>unsold</option></select></label>
          <label className="field"><span>Sold to (code)</span><input value={form.soldTo} onChange={f('soldTo')} placeholder="CSK" /></label>
          <label className="field"><span>Final price (Cr)</span><input type="number" step="0.05" min="0" value={form.soldPrice ?? ''} onChange={f('soldPrice')} /></label>
          <label className="check"><input type="checkbox" checked={!!form.profileVerified} onChange={f('profileVerified')} /> Profile verified</label>
          <label className="check"><input type="checkbox" checked={!!form.basePriceVerified} onChange={f('basePriceVerified')} /> Base price verified</label>
        </div>
        <div className="row-btns"><button className="btn primary">{editing ? 'Save changes' : 'Add player'}</button>{editing && <button type="button" className="btn ghost" onClick={() => { setEditing(null); setForm(blank); }}>Cancel</button>}</div>
      </form>

      <section className="panel">
        <h3 className="panel-title">BULK IMPORT (JSON)</h3>
        <p className="muted small">Array of players; amounts in lakhs. Existing names are updated. Example: <code>[{`{"name":"A B","country":"India","role":"Batter","basePrice":200}`}]</code></p>
        <textarea rows={4} value={bulk} onChange={(e) => setBulk(e.target.value)} aria-label="JSON" />
        <button className="btn ghost" disabled={!bulk.trim()} onClick={importBulk}>Import</button>
      </section>

      <section className="panel">
        <h3 className="panel-title">PLAYERS</h3>
        <input type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        {!players ? <Spinner /> : (
          <ul className="rows">
            {players.map((p) => (
              <li key={p._id}><span className="grow"><b>{p.name}</b><br /><small className="muted">{p.role} · {p.country} · {p.soldTo ? `${p.soldTo} ${cr(p.soldPrice)}` : p.auctionStatus}</small></span>
                <VerifyTag ok={p.profileVerified} label="Profile" />
                <button className="btn ghost sm" onClick={() => edit(p)}>Edit</button><button className="btn ghost sm danger" onClick={() => del(p)}>Delete</button></li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// Default rules for each auction mode (stored in MongoDB). Only rendered inside the unlocked Admin Panel.
function Settings() {
  const toast = useToast();
  const [modes, setModes] = useState(null);
  const [draft, setDraft] = useState({});
  useEffect(() => { api('/auctions/modes').then(setModes).catch((e) => toast.err(e.message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!modes) return <Spinner />;
  const save = async (m) => {
    const d = draft[m.key] || {};
    try {
      const body = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, k === 'purse' ? Math.round(v * 100) : Number(v)]));
      const r = await api(`/auctions/modes/${m.key}`, { method: 'PUT', admin: true, body });
      setModes(modes.map((x) => (x.key === m.key ? r : x))); setDraft({ ...draft, [m.key]: {} }); toast.ok('Preset saved');
    } catch (e) { toast.err(e.message); }
  };
  const fld = (m, k, label, scale = 1) => (
    <label className="field"><span>{label}</span><input type="number" min="0" step={scale === 100 ? 5 : 1} value={draft[m.key]?.[k] ?? (m[k] ?? 0) / scale} onChange={(e) => setDraft({ ...draft, [m.key]: { ...draft[m.key], [k]: e.target.value } })} /></label>
  );
  return (
    <>
      <p className="muted">Default rules for each auction mode. Existing auctions keep their own rules.</p>
      {modes.map((m) => (
        <section className="panel" key={m.key}>
          <h3 className="panel-title">{m.label.toUpperCase()}</h3>
          <div className="adv">{fld(m, 'purse', 'Purse (Cr)', 100)}{fld(m, 'minSquad', 'Min squad')}{fld(m, 'maxSquad', 'Max squad')}{fld(m, 'maxOverseas', 'Max overseas')}{fld(m, 'initialSeconds', 'Timer (s)')}{fld(m, 'resetSeconds', 'Bid reset (s)')}{fld(m, 'poolSize', 'Pool size')}</div>
          <button className="btn ghost" onClick={() => save(m)}>Save preset</button>
        </section>
      ))}
    </>
  );
}
