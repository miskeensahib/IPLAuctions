import { useState } from 'react';
import { useAuction, useToast } from './state';
import { fileName, renderSquadImage, saveBlob, shareBlob } from './squadImage';

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
  const empty = !players.length;

  const make = () => renderSquadImage({ team, players, auctionName: auction.name, code: auction.code });
  const save = async () => {
    setBusy('save');
    try {
      saveBlob(await make(), fileName(team));
      toast.ok(isIOS() ? `${team.short} squad image downloaded. Open it, then tap Share → Save Image to add it to Photos.` : `${team.short} squad image saved to your device (Downloads / Gallery).`);
    } catch { toast.err('Could not create the squad image.'); } finally { setBusy(''); }
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
      <button type="button" className="btn save" disabled={empty || !!busy} onClick={save} title={why} aria-label={`Save ${team.name} squad image`}><Icon d={SAVE} /><span>{busy === 'save' ? 'Saving…' : 'Save'}</span></button>
      <button type="button" className="btn share" disabled={empty || !!busy} onClick={share} title={why} aria-label={`Share ${team.name} squad image`}><Icon d={SHARE} /><span>{busy === 'share' ? 'Sharing…' : 'Share'}</span></button>
    </div>
  );
}
