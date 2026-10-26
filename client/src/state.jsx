import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, socket, store } from './api';

// ---------- toasts ----------
const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, kind = 'info') => {
    const id = Math.random();
    setItems((x) => [...x.slice(-3), { id, message, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3800);
  }, []);
  const value = useMemo(() => ({ ok: (m) => push(m, 'ok'), err: (m) => push(m, 'err'), info: (m) => push(m) }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((i) => <div key={i.id} className={`toast ${i.kind}`}>{i.message}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- user ----------
export const useUserName = () => {
  const [name, setName] = useState(store.get('ipl.name') || '');
  const save = (n) => { store.set('ipl.name', n); setName(n); };
  return [name, save];
};

// ---------- live auction ----------
const AuctionCtx = createContext(null);
export const useAuction = () => useContext(AuctionCtx);

export function AuctionProvider({ code, children }) {
  const [auction, setAuction] = useState(null);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(socket.connected);
  // Team ownership and host status are stored in MongoDB and read through the API (never from the browser).
  const [me, setMe] = useState({ isHost: false, teamId: null });
  const offset = useRef(0);

  const apply = useCallback((a) => {
    offset.current = a.serverNow - Date.now();
    setAuction((prev) => (prev && prev.updatedAt > a.updatedAt ? prev : a));
  }, []);

  useEffect(() => {
    let alive = true;
    setAuction(null); setError(null);
    api(`/auctions/${code}`).then((a) => alive && apply(a)).catch((e) => alive && setError(e.message));
    const onUpdate = (a) => { if (a.code === code) apply(a); };
    const onConn = () => { setConnected(true); socket.emit('auction:join', code); };
    const onDisc = () => setConnected(false);
    socket.on('auction:update', onUpdate); socket.on('connect', onConn); socket.on('disconnect', onDisc);
    socket.connect();
    if (socket.connected) onConn();
    // Fallback polling keeps the page correct if the websocket is blocked.
    const poll = setInterval(() => { if (!socket.connected) api(`/auctions/${code}`).then((a) => alive && apply(a)).catch(() => {}); }, 3000);
    return () => {
      alive = false; clearInterval(poll);
      socket.emit('auction:leave', code);
      socket.off('auction:update', onUpdate); socket.off('connect', onConn); socket.off('disconnect', onDisc);
    };
  }, [code, apply]);

  const claimKey = auction ? auction.teams.map((t) => (t.claimed ? 1 : 0)).join('') : '';
  useEffect(() => {
    let alive = true;
    api(`/auctions/${code}/me`).then((m) => alive && setMe(m)).catch(() => {});
    return () => { alive = false; };
  }, [code, claimKey]);
  const setMyTeam = (id) => setMe((m) => ({ ...m, teamId: id })); // instant UI update; the server copy is already saved
  const myTeamId = me.teamId;
  const isHost = me.isHost;
  const myTeam = auction?.teams.find((t) => t.team === myTeamId) || null;
  const now = () => Date.now() + offset.current;

  const value = { code, auction, error, connected, myTeam, myTeamId, setMyTeam, isHost, now, refresh: () => api(`/auctions/${code}`).then(apply) };
  return <AuctionCtx.Provider value={value}>{children}</AuctionCtx.Provider>;
}

// seconds left on the current lot, ticking at 4Hz
export function useCountdown() {
  const { auction, now } = useAuction();
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 250); return () => clearInterval(i); }, []);
  const live = auction?.live;
  if (!live || live.phase !== 'bidding') return 0;
  if (auction.status === 'paused') return Math.ceil((live.remainingMs || 0) / 1000);
  return Math.max(0, Math.ceil((new Date(live.endsAt).getTime() - now()) / 1000));
}
