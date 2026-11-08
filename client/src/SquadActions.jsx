import { useState } from 'react';
import { useAuction, useToast } from './state';
import { api } from './api';
import { fileName, renderSquadImage, renderStrengthImage, saveBlob, shareBlob, strengthFileName } from './squadImage';

const Icon = ({ d }) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const SAVE = 'M12 3v12m0 0l-4-4m4 4l4-4M4 20h16';
const SHARE = 'M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zM18 22a3 3 0 100-6 3 3 0 000 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4';
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Save + Share buttons for ONE team. Each button builds that team's own squad image on demand, so teams never mix.
// team: auction team state; players: [{ player, price }] bought by that team.
export default function SquadActions({ team, players, compact }) {
  const { auction } = useAuction();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState({ view: true, strength: false });
  const empty = !players.length;

  const make = () => renderSquadImage({ team, players, auctionName: auction.name, code: auction.code });
  const nothing = !pick.view && !pick.strength;
  const strengthBlob = async () => {
    const d = await api(`/auctions/${auction.code}/strength`); // fresh scores at the moment of saving
    const t = d.teams.find((x) => x.short === team.short);
    const rows = d.players.filter((p) => p.team === team.short);
    return renderStrengthImage({ team, rows, summary: t ? { avg: t.avg, rank: t.rank, of: d.teams.length, rated: t.rated, estimated: t.estimated } : null, auctionName: auction.name, code: auction.code });
  };
  const save = async () => {
    if (nothing) return;
    setBusy('save');
    try {
      let n = 0;
      if (pick.view) { saveBlob(await make(), fileName(team)); n++; }
      if (pick.strength) { if (n) await new Promise((r) => setTimeout(r, 500)); saveBlob(await strengthBlob(), strengthFileName(team)); n++; }
      setOpen(false);
      toast.ok(isIOS() ? `${n} image${n > 1 ? 's' : ''} downloaded. Open it, then tap Share → Save Image to add it to Photos.` : `${n} image${n > 1 ? 's' : ''} saved to your device (Downloads / Gallery).`);
    } catch { toast.err('Could not create the image.'); } finally { setBusy(''); }
  };
  const share = async () => {
    setBusy('share');
    try {
      const blob = await make();
      const r = await shareBlob(blob, fileName(team), { title: `${team.name} squad`, text: `${team.name} squad from IPL Auction 2026 (${players.length} players)` });
      if (r === 'unsupported') { saveBlob(blob, fileName(team)); toast.info('Sharing is not supported in this browser, so the image was downloaded instead. You can send it from your files.'); }
    } catch { toast.err('Could not share the squad image.'); } finally { setBusy(''); }
  };

  const why = empty ? 'No players bought yet' : '';
  return (
    <div className={`squad-actions${compact ? ' compact' : ''}`}>
      <button type="button" className="btn save" disabled={empty || !!busy} onClick={() => setOpen(true)} title={why} aria-label={`Save ${team.name} images`}><Icon d={SAVE} /><span>{busy === 'save' ? 'Saving…' : 'Save'}</span></button>
      <button type="button" className="btn share" disabled={empty || !!busy} onClick={share} title={why} aria-label={`Share ${team.name} squad image`}><Icon d={SHARE} /><span>{busy === 'share' ? 'Sharing…' : 'Share'}</span></button>
    {open && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Save images" onClick={() => !busy && setOpen(false)}>
          <div className="modal-card save-pop" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="icon-btn x" onClick={() => setOpen(false)} aria-label="Close" disabled={!!busy}>✕</button>
            <h3 className="panel-title">SAVE {team.short} IMAGE</h3>
            <p className="muted small">Choose one or both. Each selected option downloads as its own image.</p>
            <label className={`save-opt${pick.view ? ' on' : ''}`}><input type="checkbox" checked={pick.view} onChange={(e) => setPick({ ...pick, view: e.target.checked })} /><span><b>Current View</b><small>The squad image with purse, spent and prices.</small></span></label>
            <label className={`save-opt${pick.strength ? ' on' : ''}`}><input type="checkbox" checked={pick.strength} onChange={(e) => setPick({ ...pick, strength: e.target.checked })} /><span><b>Team &amp; Player Strength</b><small>Overall team strength and every player's strength score.</small></span></label>
            <div className="row-btns">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)} disabled={!!busy}>Cancel</button>
              <button type="button" className="btn primary" onClick={save} disabled={nothing || !!busy}>{busy === 'save' ? 'Saving…' : pick.view && pick.strength ? 'Download both' : 'Download'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
