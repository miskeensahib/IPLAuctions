import { useState } from 'react';
import { NavLink, Navigate, Outlet, useMatch, Link } from 'react-router-dom';
import { logout } from './api';
import { AuctionProvider, useAuction, useUserName } from './state';
import { cr } from './utils';
import { TeamBadge, Spinner, ErrorBox } from './ui';

const I = ({ d }) => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const ICONS = {
  dash: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10',
  live: 'M13 2L4 14h7l-1 8 9-12h-7z',
  players: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',
  teams: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  bids: 'M14 4l6 6-3 3-6-6zM3 21l8-8M4 20h9',
  history: 'M3 12a9 9 0 109-9M3 4v5h5M12 7v5l3 2',
  watch: 'M12 17l-5.5 3 1-6L3 9.5l6-.9L12 3l3 5.6 6 .9-4.5 4.5 1 6z',
  reports: 'M5 21V10M12 21V4M19 21v-7',
  admin: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2l-1-2-3 1 .5 2L6.5 8.5 4.5 8l-1 3 2 1v2l-2 1 1 3 2-.5L8 19l-.5 2 3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1z',
  home: 'M3 12l9-9 9 9M5 10v10h14V10',
  menu: 'M4 6h16M4 12h16M4 18h16',
  out: 'M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 17l5-5-5-5M15 12H3',
  bell: 'M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8M10 21h4',
};

function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-mark">IPL</span>
      <span className="brand-text"><b>AUCTION</b><i>2026</i></span>
    </Link>
  );
}

const MODE_NAMES = { mega: 'MEGA AUCTION', mini: 'MINI AUCTION', rapid: 'RAPID AUCTION' };
// Always shows which mode is running and its core rules.
function ModeChip() {
  const { auction } = useAuction();
  if (!auction) return null;
  const s = auction.settings;
  return <span className="mode-chip">{MODE_NAMES[auction.mode] || String(auction.mode).toUpperCase()} · {cr(s.purse)} · {s.minSquad ? `${s.minSquad}-` : 'max '}{s.maxSquad} players</span>;
}

export function TeamStrip() {
  const { auction, myTeamId } = useAuction();
  if (!auction) return null;
  return (
    <div className="strip" aria-label="Team purses">
      {auction.teams.map((t) => (
        <div key={t.team} className={`strip-card${t.team === myTeamId ? ' mine' : ''}`} style={{ '--tc': t.color }}>
          <div className="strip-top"><TeamBadge short={t.short} color={t.color} size={26} /><b>{t.short}</b></div>
          <div className="strip-purse">{cr(t.purse)}</div>
          <div className="strip-sub">{t.count} / {auction.settings.maxSquad}{auction.settings.minSquad ? ` (min ${auction.settings.minSquad})` : ''}{!t.isBot && <em title={t.ownerName}> · {t.ownerName}</em>}</div>
        </div>
      ))}
    </div>
  );
}

function AuctionGate({ code }) {
  const { auction, error, connected } = useAuction();
  if (error) return <ErrorBox>{error}. <Link to="/home">Back to home</Link></ErrorBox>;
  if (!auction) return <Spinner label="Loading auction…" />;
  return (
    <>
      {!connected && <div className="banner warn">Live connection lost – retrying. Data refreshes every few seconds.</div>}
      <Outlet />
    </>
  );
}

export default function Layout() {
  const m = useMatch('/a/:code/*');
  const code = m?.params.code?.toUpperCase();
  const [open, setOpen] = useState(false);
  const [name] = useUserName();
  const close = () => setOpen(false);
  const doLogout = () => { if (window.confirm('Log out? Any team you control will be handed to the bots.')) logout(); };
  if (!name) return <Navigate to="/" replace />; // protected: no session, no pages

  const base = code ? `/a/${code}` : null;
  const nav = [
    ...(base ? [
      ['home', 'Home', '/home'],
      ['dash', 'Dashboard', base, true],
      ['live', 'Live Auction', `${base}/live`],
      ['players', 'Players', `${base}/players`],
      ['teams', 'Teams', `${base}/teams`],
      ['bids', 'Bids', `${base}/bids`],
      ['history', 'Auction History', `${base}/history`],
      ['watch', 'Watchlist', `${base}/watchlist`],
      ['reports', 'Reports', `${base}/reports`],
    ] : [
      ['home', 'Home', '/home', true],
      ['players', 'Players', '/players'],
    ]),
    // The Admin Panel is deliberately not listed in any menu: it is reached only by typing /admin in the address bar.
  ];
  const mobile = base
    ? [['dash', 'Dashboard', base, true], ['players', 'Players', `${base}/players`], ['live', 'Auction', `${base}/live`], ['teams', 'Squad', `${base}/squad`]]
    : [['home', 'Home', '/home', true], ['players', 'Players', '/players']];

  const links = (items, cls) => items.map(([ic, label, to, end]) => (
    <NavLink key={label} to={to} end={end} onClick={close} className={({ isActive }) => `${cls}${isActive ? ' active' : ''}`}>
      <I d={ICONS[ic]} /><span>{label}</span>
    </NavLink>
  ));

  const body = (
    <main className="content">
      <header className="topbar">
        <button className="icon-btn menu" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}><I d={ICONS.menu} /></button>
        <h1>{code ? <>LIVE AUCTION <small>#{code}</small></> : 'IPL AUCTION 2026'}{code && <ModeChip />}</h1>
        <div className="top-right">
          {code && <Link to="/home" className="btn ghost sm home-btn" aria-label="Go to Home page"><I d={ICONS.home} /><span>Home</span></Link>}
          <span className="user"><span className="user-dot">{(name || 'G')[0].toUpperCase()}</span><span className="user-name">{name}</span></span>
          <button className="btn ghost sm logout" onClick={doLogout} aria-label="Log out"><I d={ICONS.out} /><span>Logout</span></button>
        </div>
      </header>
      {code ? <AuctionGate code={code} /> : <Outlet />}
    </main>
  );

  return (
    <div className="shell">
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <Brand />
        <nav>{links(nav, 'nav-item')}</nav>
        <div className="side-art" aria-hidden="true"><div className="trophy">🏆</div><div className="side-year">IPL<br />2026</div></div>
      </aside>
      {open && <div className="scrim" onClick={close} />}
      {code ? <AuctionProvider code={code}>{body}</AuctionProvider> : body}
      <nav className="bottom-nav" aria-label="Primary">{links(mobile, 'bn-item')}
        <button className="bn-item" onClick={() => setOpen(true)}><I d={ICONS.menu} /><span>More</span></button>
      </nav>
    </div>
  );
}
