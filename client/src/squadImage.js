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
