// Builds a shareable PNG of one team's squad (layout follows the in-app squad card) and saves / shares it.
// Drawn on a <canvas>, so no extra library is needed and it works offline.

export const GROUPS = [
  ['Batter', 'BATSMAN'], ['Wicketkeeper', 'WICKET-KEEPER'], ['All-rounder', 'ALL-ROUNDER'], ['Bowler', 'BOWLER'], ['Unassigned', 'OTHERS'],
];
const lakhToCr = (l) => `${((l || 0) / 100).toFixed(2)} Cr`;

// [{ player, price }] -> [{ key, label, items }] (non-empty groups only, priciest first)
export function groupSquad(players) {
  return GROUPS.map(([key, label]) => ({
    key, label,
    items: players.filter((x) => (GROUPS.some(([k]) => k === x.player.role) ? x.player.role : 'Unassigned') === key).sort((a, b) => b.price - a.price),
  })).filter((g) => g.items.length);
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}
function globe(ctx, cx, cy, r, color) { // small "overseas" globe icon
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.45, r, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
  ctx.restore();
}

// team: auction team state { short, name, color, purse, spent, overseas, count }; players: [{ player, price }]
export async function renderSquadImage({ team, players, auctionName, code }) {
  try { await document.fonts?.ready; } catch { /* fonts API unavailable: system font is used */ }
  const S = 2, W = 1080, PAD = 48, ROW = 64, GAP = 10;
  const groups = groupSquad(players);
  const bodyH = groups.reduce((n, g) => n + 62 + g.items.length * (ROW + GAP), 0);
  const H = 250 + 112 + 74 + Math.max(bodyH, 90) + 96 + 40;
  const c = document.createElement('canvas');
  c.width = W * S; c.height = H * S;
  const ctx = c.getContext('2d');
  ctx.scale(S, S);
  const font = (w, px) => `${w} ${px}px Inter, Roboto, "Segoe UI", Arial, sans-serif`;
  const color = team.color || '#2563eb';

  // background + header band
  ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, W, H);
  const band = ctx.createLinearGradient(0, 0, W, 250);
  band.addColorStop(0, color); band.addColorStop(1, '#0b1020');
  ctx.fillStyle = band; ctx.globalAlpha = 0.55; ctx.fillRect(0, 0, W, 250); ctx.globalAlpha = 1;
  ctx.fillStyle = '#f7b500'; ctx.font = font(800, 26); ctx.textBaseline = 'alphabetic';
  ctx.fillText('IPL AUCTION 2026', PAD, 70);
  ctx.fillStyle = '#ffffff'; ctx.font = font(800, 54);
  ctx.fillText(fit(ctx, team.name, W - PAD * 2 - 150), PAD, 140);
  ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.font = font(500, 26);
  ctx.fillText(fit(ctx, `${auctionName || 'Auction'}${code ? `  ·  #${code}` : ''}`, W - PAD * 2 - 150), PAD, 190);
  // team badge
  rr(ctx, W - PAD - 110, 54, 110, 110, 26); ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = font(800, team.short.length > 3 ? 34 : 40); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(team.short, W - PAD - 55, 110); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  // stats strip: OS / Purse / Spent
  let y = 250 - 6;
  rr(ctx, PAD, y, W - PAD * 2, 86, 18); ctx.fillStyle = '#151a33'; ctx.fill();
  const stat = (label, value, vColor, x, align) => {
    ctx.textAlign = align; ctx.font = font(500, 30); ctx.fillStyle = 'rgba(255,255,255,.7)';
    const lw = ctx.measureText(`${label} `).width, vw = (ctx.font = font(800, 32), ctx.measureText(value).width);
    const sx = align === 'left' ? x : align === 'right' ? x - (lw + vw) : x - (lw + vw) / 2;
    ctx.textAlign = 'left'; ctx.font = font(500, 30); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText(`${label} `, sx, y + 55);
    ctx.font = font(800, 32); ctx.fillStyle = vColor; ctx.fillText(value, sx + lw, y + 55);
  };
  stat('OS:', String(team.overseas ?? 0), '#a78bfa', PAD + 28, 'left');
  stat('Purse:', lakhToCr(team.purse), '#34d399', W / 2, 'center');
  stat('Spent:', lakhToCr(team.spent), '#fbbf24', W - PAD - 28, 'right');
  y += 86 + 58;

  // bought
  ctx.fillStyle = '#34d399'; ctx.font = font(800, 38);
  ctx.fillText(`Bought (${players.length})`, PAD, y);
  y += 28;

  if (!groups.length) {
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = font(500, 30);
    ctx.fillText('No players bought yet.', PAD, y + 46); y += 90;
  }
  for (const g of groups) {
    y += 46;
    ctx.fillStyle = '#22a06b'; ctx.font = font(800, 25);
    ctx.fillText(`${g.label} (${g.items.length})`, PAD + 6, y);
    y += 16;
    for (const it of g.items) {
      rr(ctx, PAD, y, W - PAD * 2, ROW, 14); ctx.fillStyle = '#1a2040'; ctx.fill();
      ctx.font = font(700, 31); ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle';
      const name = fit(ctx, it.player.name, 640);
      ctx.fillText(name, PAD + 24, y + ROW / 2 + 1);
      if (it.player.isOverseas) globe(ctx, PAD + 24 + ctx.measureText(name).width + 28, y + ROW / 2, 12, '#a78bfa');
      ctx.font = font(800, 31); ctx.fillStyle = '#34d399'; ctx.textAlign = 'right';
      ctx.fillText(lakhToCr(it.price), W - PAD - 24, y + ROW / 2 + 1);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      y += ROW + GAP;
    }
  }

  // footer
  const fy = H - 70;
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(PAD, fy - 28, W - PAD * 2, 2);
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = font(500, 24);
  ctx.fillText('IPL Auction 2026', PAD, fy + 14);
  ctx.textAlign = 'right'; ctx.fillText(new Date().toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }), W - PAD, fy + 14); ctx.textAlign = 'left';

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Image could not be created'))), 'image/png'));
}

export const fileName = (team) => `IPL2026-${team.short}-squad.png`;

// Downloads the PNG. (Browsers cannot write straight into a phone's Gallery: on Android the download shows up in
// Downloads / Gallery, on iPhone use Share -> Save Image.)
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Opens the device share sheet with the image attached. Returns 'shared', or 'unsupported' when the browser cannot
// share files (the caller then falls back to downloading). A cancelled share sheet is not an error.
export async function shareBlob(blob, name, { title, text }) {
  const file = new File([blob], name, { type: 'image/png' });
  if (!navigator.share || !navigator.canShare || !navigator.canShare({ files: [file] })) return 'unsupported';
  try { await navigator.share({ files: [file], title, text }); return 'shared'; }
  catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; throw e; }
}

// ---- Team & Player Strength image ----
// team: auction team state; rows: [{ name, role, isOverseas, price, strength, kind }]; summary: { avg, rank, of, count, rated, estimated }
const TIER = (v) => (v >= 80 ? '#34d399' : v >= 65 ? '#38bdf8' : v >= 50 ? '#fbbf24' : '#f87171');
export async function renderStrengthImage({ team, rows, summary, auctionName, code }) {
  try { await document.fonts?.ready; } catch { /* system font is used */ }
  const S = 2, W = 1080, PAD = 48, ROW = 72, GAP = 10;
  const list = [...rows].sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0));
  const H = 250 + 250 + 70 + Math.max(list.length, 1) * (ROW + GAP) + 190;
  const c = document.createElement('canvas');
  c.width = W * S; c.height = H * S;
  const ctx = c.getContext('2d');
  ctx.scale(S, S);
  const font = (w, px) => `${w} ${px}px Inter, Roboto, "Segoe UI", Arial, sans-serif`;
  const color = team.color || '#2563eb';

  ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, W, H);
  const band = ctx.createLinearGradient(0, 0, W, 250);
  band.addColorStop(0, color); band.addColorStop(1, '#0b1020');
  ctx.fillStyle = band; ctx.globalAlpha = 0.55; ctx.fillRect(0, 0, W, 250); ctx.globalAlpha = 1;
  ctx.fillStyle = '#f7b500'; ctx.font = font(800, 26); ctx.textBaseline = 'alphabetic';
  ctx.fillText('IPL AUCTION 2026  ·  TEAM & PLAYER STRENGTH', PAD, 70);
  ctx.fillStyle = '#ffffff'; ctx.font = font(800, 54);
  ctx.fillText(fit(ctx, team.name, W - PAD * 2 - 150), PAD, 140);
  ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.font = font(500, 26);
  ctx.fillText(fit(ctx, `${auctionName || 'Auction'}${code ? `  ·  #${code}` : ''}`, W - PAD * 2 - 150), PAD, 190);
  rr(ctx, W - PAD - 110, 54, 110, 110, 26); ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = font(800, team.short.length > 3 ? 34 : 40); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(team.short, W - PAD - 55, 110); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  // team strength card
  let y = 244;
  rr(ctx, PAD, y, W - PAD * 2, 200, 22); ctx.fillStyle = '#151a33'; ctx.fill();
  const hasAvg = summary && summary.avg != null;
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = font(700, 24); ctx.fillText('TEAM STRENGTH', PAD + 34, y + 52);
  ctx.fillStyle = hasAvg ? TIER(summary.avg) : '#8b93b8'; ctx.font = font(800, 92);
  const big = hasAvg ? summary.avg.toFixed(1) : '—';
  ctx.fillText(big, PAD + 34, y + 148);
  const bw = ctx.measureText(big).width;
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = font(600, 30); ctx.fillText('/100', PAD + 34 + bw + 10, y + 148);
  const rx = W / 2 + 80;
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = font(700, 24); ctx.fillText('RANK', rx, y + 52);
  ctx.fillStyle = '#fff'; ctx.font = font(800, 64); const rk = summary?.rank ? `#${summary.rank}` : '–'; ctx.fillText(rk, rx, y + 128);
  const rkw = ctx.measureText(rk).width;
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = font(600, 28); ctx.fillText(`of ${summary?.of || 10}`, rx + rkw + 12, y + 128);
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = font(500, 24);
  const basis = summary ? `Average of ${rows.length} player${rows.length === 1 ? '' : 's'}: ${summary.rated} from IPL stats${summary.estimated ? `, ${summary.estimated} estimated` : ''}` : '';
  ctx.fillText(fit(ctx, basis, W - PAD * 2 - 68), PAD + 34, y + 184);
  y += 200 + 62;

  ctx.fillStyle = '#34d399'; ctx.font = font(800, 36); ctx.fillText(`Players (${rows.length})`, PAD, y);
  y += 26;
  if (!list.length) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = font(500, 30); ctx.fillText('No players bought yet.', PAD, y + 50); y += 80; }
  for (const it of list) {
    rr(ctx, PAD, y, W - PAD * 2, ROW, 14); ctx.fillStyle = '#1a2040'; ctx.fill();
    ctx.textBaseline = 'middle'; ctx.font = font(700, 30); ctx.fillStyle = '#fff';
    const name = fit(ctx, it.name, 560);
    ctx.fillText(name, PAD + 24, y + ROW / 2 - 9);
    if (it.isOverseas) globe(ctx, PAD + 24 + ctx.measureText(name).width + 26, y + ROW / 2 - 9, 11, '#a78bfa');
    ctx.font = font(500, 22); ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillText(`${it.role || ''}${it.price != null ? `  ·  ${lakhToCr(it.price)}` : ''}`, PAD + 24, y + ROW / 2 + 19);
    const v = it.strength, cx = W - PAD - 52, cy = y + ROW / 2;
    if (it.kind === 'estimated') { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = font(700, 20); ctx.textAlign = 'right'; ctx.fillText('est.', cx - 40, cy); ctx.textAlign = 'left'; }
    ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.fillStyle = '#0b1020'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = v == null ? '#8b93b8' : TIER(v);
    ctx.setLineDash(it.kind === 'estimated' ? [6, 5] : []); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#fff'; ctx.font = font(800, 28); ctx.textAlign = 'center'; ctx.fillText(v == null ? '–' : String(Math.round(v)), cx, cy + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    y += ROW + GAP;
  }
  y += 24;
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = font(500, 21);
  ctx.fillText('Scores out of 100 from IPL career stats (Cricsheet.org).', PAD, y);
  ctx.fillText('Dashed ring + "est." = estimated for a short IPL record.', PAD, y + 30);
  ctx.fillText('Team strength = average of its players’ scores.', PAD, y + 60);
  const fy = H - 70;
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(PAD, fy - 28, W - PAD * 2, 2);
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = font(500, 24); ctx.fillText('IPL Auction 2026', PAD, fy + 14);
  ctx.textAlign = 'right'; ctx.fillText(new Date().toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }), W - PAD, fy + 14); ctx.textAlign = 'left';

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Image could not be created'))), 'image/png'));
}
export const strengthFileName = (team) => `IPL2026-${team.short}-strength.png`;
