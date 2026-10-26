import { useEffect, useState } from 'react';
import { initials } from './utils';
import { setMuted, useMuted } from './sound';

// Shows the official player image when there is one; falls back to initials if it is missing or fails to load.
export function Avatar({ name, src, color = '#334155', size = 44, square }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  return (
    <span className={`avatar${square ? ' sq' : ''}`} style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(160deg, ${color}, #0b1020)` }}>
      {src && !bad ? <img src={src} alt={name || ''} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBad(true)} /> : <span aria-hidden="true">{initials(name)}</span>}
    </span>
  );
}

// Mute / unmute the last-3-seconds warning beep. Takes effect immediately and is remembered for the session.
export function SoundToggle() {
  const muted = useMuted();
  return (
    <button type="button" className={`icon-btn sound-btn${muted ? ' off' : ''}`} onClick={() => setMuted(!muted)} aria-pressed={!muted}
      aria-label={muted ? 'Turn warning sound on' : 'Turn warning sound off'} title={muted ? 'Warning sound off' : 'Warning sound on'}>
      <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
    </button>
  );
}

export function TeamBadge({ short, color, size = 34 }) {
  return (
    <span className="tbadge" style={{ width: size, height: size, fontSize: size * 0.3, background: `linear-gradient(145deg, ${color || '#475569'}, #0b1020)` }}>
      {short}
    </span>
  );
}

export const Spinner = ({ label = 'Loading…' }) => <div className="center-msg"><span className="spin" />{label}</div>;
export const Empty = ({ children }) => <div className="empty">{children}</div>;
export const ErrorBox = ({ children, onRetry }) => (
  <div className="errbox" role="alert">{children}{onRetry && <button className="btn ghost sm" onClick={onRetry}>Retry</button>}</div>
);

export function VerifyTag({ ok, label }) {
  return <span className={`vtag ${ok ? 'ok' : 'warn'}`} title={ok ? 'Confirmed from an official source' : 'Not confirmed from an official source'}>{ok ? '✓' : '!'} {label}</span>;
}

// SVG donut. data: [{label, value, color}]
export function Donut({ data, size = 170 }) {
  const total = data.reduce((n, d) => n + d.value, 0);
  const r = 15.9155, c = 2 * Math.PI * r;
  let off = 25;
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} role="img" aria-label="Spending split by team">
      <circle cx="18" cy="18" r={r} fill="none" stroke="#1a2346" strokeWidth="6" />
      {total > 0 && data.filter((d) => d.value > 0).map((d) => {
        const len = (d.value / total) * 100;
        const el = <circle key={d.label} cx="18" cy="18" r={r} fill="none" stroke={d.color} strokeWidth="6" strokeDasharray={`${len} ${100 - len}`} strokeDashoffset={off} />;
        off -= len;
        return el;
      })}
    </svg>
  );
}
