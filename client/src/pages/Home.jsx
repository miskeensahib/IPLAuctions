import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useToast, useUserName } from '../state';
import { Spinner, ErrorBox } from '../ui';
import { cr } from '../utils';

export function Welcome() {
  const [name, setName] = useUserName();
  const [v, setV] = useState(name);
  const nav = useNavigate();
  if (name) return <Navigate to="/home" replace />;
  return (
    <div className="welcome">
      <form className="login-card" onSubmit={(e) => { e.preventDefault(); if (v.trim().length < 2) return; setName(v.trim().slice(0, 30)); nav('/home'); }}>
        <div className="brand big"><span className="brand-mark">IPL</span><span className="brand-text"><b>AUCTION</b><i>2026</i></span></div>
        <div className="trophy xl" aria-hidden="true">🏆</div>
        <h2>Welcome</h2>
        <p className="muted">Choose a display name to start bidding. No account or password is needed.</p>
        <label htmlFor="nm">Display name</label>
        <input id="nm" autoFocus maxLength={30} value={v} onChange={(e) => setV(e.target.value)} placeholder="e.g. Rohan" />
        <button className="btn primary block" disabled={v.trim().length < 2}>CONTINUE</button>
      </form>
    </div>
  );
}

export default function Home() {
  const [name, setName] = useUserName();
  const [modes, setModes] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('mini');
  const [play, setPlay] = useState('solo');
  const [adv, setAdv] = useState(false);
  const [ov, setOv] = useState({});
  const [join, setJoin] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const nav = useNavigate();

  const load = () => {
    setError(null);
    Promise.all([api('/auctions/modes'), api('/auctions')]).then(([m, r]) => { setModes(m); setRecent(r); }).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  if (!name) return <Navigate to="/" replace />;
  if (error) return <ErrorBox onRetry={load}>{error}</ErrorBox>;
  if (!modes) return <Spinner />;
  const preset = modes.find((m) => m.key === mode) || modes[0];

  const create = async () => {
    setBusy(true);
    try {
      const settings = Object.fromEntries(Object.entries(ov).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, k === 'poolOrder' ? v : Number(v)]));
      if (settings.purse) settings.purse = Math.round(settings.purse * 100); // Cr -> lakh
      const { code } = await api('/auctions', { method: 'POST', body: { mode, play, hostName: name, settings } });
      nav(`/a/${code}`);
    } catch (e) { toast.err(e.message); } finally { setBusy(false); }
  };
  const joinCode = (e) => { e.preventDefault(); const c = join.trim().toUpperCase(); if (c.length >= 4) nav(`/a/${c}`); };
  const num = (k, label, ph, step) => (
    <label className="field"><span>{label}</span><input type="number" min="0" step={step || 1} placeholder={ph} value={ov[k] ?? ''} onChange={(e) => setOv({ ...ov, [k]: e.target.value })} /></label>
  );

  return (
    <div className="home">
      <section className="panel">
        <h3 className="panel-title">AUCTION MODE</h3>
        <div className="mode-grid">
          {modes.map((m) => (
            <button key={m.key} className={`mode${mode === m.key ? ' on' : ''}`} onClick={() => { setMode(m.key); setOv({}); }}>
              <b>{m.label}</b><span>{m.description}</span>
              <small>Purse {cr(m.purse)} · {m.minSquad ? `${m.minSquad}-` : 'max '}{m.maxSquad} players · {m.maxOverseas} overseas · {m.initialSeconds}s timer</small>
            </button>
          ))}
        </div>
        <h3 className="panel-title">PLAY STYLE</h3>
        <div className="seg">
          <button className={play === 'solo' ? 'on' : ''} onClick={() => setPlay('solo')}>Solo vs bots</button>
          <button className={play === 'multi' ? 'on' : ''} onClick={() => setPlay('multi')}>Multiplayer room</button>
        </div>
        <p className="muted small">{play === 'solo' ? 'You control one franchise; the other nine are bots.' : 'Share the room code. Each friend claims a team; unclaimed teams are bots.'}</p>
        <button className="link-btn" onClick={() => setAdv(!adv)}>{adv ? '▾' : '▸'} Customize rules</button>
        {adv && (
          <div className="adv">
            {num('purse', 'Purse (Cr)', preset.purse / 100)}{num('minSquad', 'Min squad', preset.minSquad)}{num('maxSquad', 'Max squad', preset.maxSquad)}{num('maxOverseas', 'Max overseas', preset.maxOverseas)}
            {num('initialSeconds', 'Timer (s)', preset.initialSeconds)}{num('resetSeconds', 'Bid reset (s)', preset.resetSeconds)}{num('poolSize', 'Players in pool (0 = all)', preset.poolSize)}
            <label className="field"><span>Order</span><select value={ov.poolOrder || preset.poolOrder} onChange={(e) => setOv({ ...ov, poolOrder: e.target.value })}><option value="random">Random</option><option value="marquee">Prominent first</option><option value="sequential">Sequential</option></select></label>
          </div>
        )}
        <button className="btn primary block" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'CREATE AUCTION'}</button>
      </section>

      <section className="panel">
        <h3 className="panel-title">JOIN WITH CODE</h3>
        <form className="join" onSubmit={joinCode}>
          <input value={join} onChange={(e) => setJoin(e.target.value)} placeholder="Room code" maxLength={8} aria-label="Room code" />
          <button className="btn gold">JOIN</button>
        </form>
        <h3 className="panel-title">RECENT AUCTIONS</h3>
        {!recent.length ? <p className="muted">None yet. Create the first one.</p> : (
          <ul className="rows">
            {recent.map((a) => (
              <li key={a.code}><Link to={`/a/${a.code}`} className="grow"><b>{a.name}</b><br /><small className="muted">#{a.code} · {a.hostName} · {a.play}</small></Link><span className={`st ${a.status}`}>{a.status}</span></li>
            ))}
          </ul>
        )}
        <button className="link-btn" onClick={() => setName('')}>Change name ({name})</button>
      </section>
    </div>
  );
}
