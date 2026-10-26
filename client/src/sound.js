import { useEffect, useRef, useSyncExternalStore } from 'react';

// Warning beeps for the last seconds of a lot. Generated with the Web Audio API, so there is no audio file to load.
export const WARN_SECONDS = 3;

let ctx = null;
let active = []; // beeps currently scheduled or playing
let muted = false;
try { muted = sessionStorage.getItem('ipl.muted') === '1'; } catch { /* storage unavailable: start unmuted */ }
const subs = new Set();

function audio() {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

// Browsers keep audio locked until the user interacts with the page; unlock on the first tap / click / key press.
export function unlockAudio() {
  const c = audio();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}
if (typeof window !== 'undefined') {
  ['pointerdown', 'touchstart', 'keydown'].forEach((ev) => window.addEventListener(ev, unlockAudio, { passive: true }));
}

export function stopWarning() {
  active.forEach((o) => { try { o.stop(); } catch { /* already stopped */ } try { o.disconnect(); } catch { /* ignore */ } });
  active = [];
}

// One beep per remaining second (3 -> three beeps over ~3 s). Scheduled up front, so a re-render cannot repeat it.
export function playWarning(count = WARN_SECONDS) {
  if (muted) return;
  const c = audio();
  if (!c || c.state !== 'running') return; // still locked: stay silent rather than play late
  stopWarning();
  const start = c.currentTime + 0.02;
  for (let i = 0; i < count; i++) {
    const t = start + i;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'square';
    osc.frequency.value = i === count - 1 ? 1175 : 880; // last beep is higher
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.1, t + 0.02);
    gain.gain.linearRampToValueAtTime(0, t + 0.3);
    osc.connect(gain); gain.connect(c.destination);
    osc.onended = () => { active = active.filter((x) => x !== osc); };
    osc.start(t); osc.stop(t + 0.32);
    active.push(osc);
  }
}

export function setMuted(value) {
  muted = value;
  try { sessionStorage.setItem('ipl.muted', value ? '1' : '0'); } catch { /* ignore */ }
  if (value) stopWarning(); // silences instantly; the countdown itself is untouched
  subs.forEach((f) => f());
}
export const useMuted = () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => muted);

// Plays the warning once per countdown. `seconds` is the whole seconds left; `running` is true while bidding is live.
// Any bid that pushes the clock back above 3 s (or a new lot, or a pause) re-arms it for the next countdown.
export function useCountdownWarning(seconds, running) {
  const armed = useRef(true);
  useEffect(() => {
    if (!running || seconds > WARN_SECONDS) { armed.current = true; stopWarning(); return; }
    if (seconds >= 1 && armed.current) { armed.current = false; playWarning(seconds); }
  }, [seconds, running]);
  useEffect(() => stopWarning, []);
}
