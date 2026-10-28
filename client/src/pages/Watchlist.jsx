import { useEffect, useState } from 'react';
import { api, fetchAllPlayers, store } from '../api';
import { Avatar, Empty } from '../ui';
import { cc } from '../utils';

// The watchlist is stored in MongoDB (collection "watchlists") through /api/watchlist.
// One shared in-memory copy keeps every star button on the page in sync.
let ids = null;
let loading = null;
const subs = new Set();
const publish = (next) => { ids = next; subs.forEach((f) => f(next)); };

function load() {
  if (!loading) {
    loading = api('/watchlist')
      .then(async (list) => {
        // one-time move of an old browser-only watchlist into the database
        const old = (() => { try { return JSON.parse(store.get('ipl.watch') || '[]'); } catch { return []; } })();
        const missing = old.filter((x) => !list.includes(x));
        if (missing.length) await Promise.all(missing.map((x) => api(`/watchlist/${x}`, { method: 'PUT' }).catch(() => {})));
        store.del('ipl.watch');
        publish([...list, ...missing]);
      })
      .catch(() => { loading = null; publish([]); });
  }
  return loading;
}

export function useWatchlist() {
  const [list, setList] = useState(ids || []);
  useEffect(() => {
    subs.add(setList);
    if (ids) setList(ids); else load();
    return () => { subs.delete(setList); };
  }, []);
  const has = (id) => list.includes(id);
  const toggle = async (id) => {
    const adding = !has(id);
    publish(adding ? [...(ids || []), id] : (ids || []).filter((x) => x !== id)); // optimistic
    try { await api(`/watchlist/${id}`, { method: adding ? 'PUT' : 'DELETE' }); }
    catch (e) { publish(adding ? (ids || []).filter((x) => x !== id) : [...(ids || []), id]); throw e; } // roll back: not saved
  };
  return { ids: list, toggle: (id) => toggle(id).catch(() => {}), has };
}

export default function Watchlist() {
  const wl = useWatchlist();
  const [players, setPlayers] = useState(null);
  useEffect(() => { fetchAllPlayers().then(setPlayers).catch(() => setPlayers([])); }, []);
  const list = (players || []).filter((p) => wl.has(p._id));
  return (
    <section className="panel">
      <h3 className="panel-title">WATCHLIST</h3>
      {!players ? <p className="muted">Loading…</p> : !list.length ? <Empty>Star players from the Players page or the live card to track them here. Saved in the database.</Empty> : (
        <ul className="rows">
          {list.map((p) => (
            <li key={p._id}><Avatar name={p.name} src={p.imageThumb} size={40} /><span className="grow"><b>{p.name}</b> <span className="code">{cc(p.country)}</span><br /><small className="muted">{p.role}</small></span><small className="muted">{p.team || ''}</small><button className="btn ghost sm" onClick={() => wl.toggle(p._id)}>Remove</button></li>
          ))}
        </ul>
      )}
    </section>
  );
}
