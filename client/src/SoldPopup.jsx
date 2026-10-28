import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuction } from './state';
import { CITY, crShort } from './utils';

const SHOW_MS = 3200;
const COLORS = ['#ffffff', '#f4c20d', '#1e6fd9', '#c7d0d9', '#2b8ae6', '#e8d44d'];

// Falling confetti: pure CSS animation, positions/colours chosen once per popup.
function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 38 }, (_, i) => ({
    id: i, left: Math.random() * 100, w: 6 + Math.random() * 9, h: 8 + Math.random() * 12,
    color: COLORS[Math.floor(Math.random() * COLORS.length)], round: Math.random() < 0.25,
    dur: 2.4 + Math.random() * 2.2, delay: -Math.random() * 4, drift: (Math.random() - 0.5) * 70,
  })), []);
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <i key={p.id} style={{ left: `${p.left}%`, width: p.w, height: p.round ? p.w : p.h, background: p.color, borderRadius: p.round ? '50%' : 2, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`, '--dx': `${p.drift}px` }} />
      ))}
    </div>
  );
}

// Shown to everyone watching the auction the moment a player is sold. Not shown for a sale that already happened
// before the page was opened (so a refresh does not replay it).
export default function SoldPopup() {
  const { auction } = useAuction();
  const [sale, setSale] = useState(null);
  const lastRev = useRef(undefined);
  const live = auction?.live;
  const sold = live?.phase === 'closed' && live?.lastResult?.status === 'sold';
  const rev = live?.rev;

  useEffect(() => {
    if (!auction) return;
    if (lastRev.current === undefined) { lastRev.current = sold ? rev : null; return; } // first look at this auction: remember, do not show
    if (sold && rev !== lastRev.current) {
      lastRev.current = rev;
      const r = live.lastResult;
      const t = auction.teams.find((x) => x.short === r.team);
      setSale({ key: rev, price: r.price, short: r.team, color: t?.color || '#0b4fa8' });
    }
  }, [auction, sold, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { // auto-close, and close as soon as the next player is up
    if (!sale) return undefined;
    const t = setTimeout(() => setSale(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [sale]);
  useEffect(() => { if (sale && live?.phase === 'bidding') setSale(null); }, [live?.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!sale) return undefined;
    const k = (e) => e.key === 'Escape' && setSale(null);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [sale]);

  if (!sale) return null;
  return (
    <div className="sold-wrap" onClick={() => setSale(null)}>
      <div className="sold-pop" key={sale.key} role="status" aria-live="polite" aria-label={`Sold for ${crShort(sale.price)} Cr to ${CITY[sale.short] || sale.short}`}>
        <Confetti />
        <div className="sold-title">SOLD!</div>
        <div className="sold-price">{crShort(sale.price)} Cr</div>
        <div className="sold-team">
          <span className="sold-badge" style={{ background: sale.color }}>{sale.short}</span>
          <span className="sold-city">{CITY[sale.short] || sale.short}</span>
        </div>
      </div>
    </div>
  );
}
