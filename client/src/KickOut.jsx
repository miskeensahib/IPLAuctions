import { useEffect, useState } from 'react';
import { api } from './api';
import { useAuction, useToast } from './state';
import { TeamBadge } from './ui';

// Host-only helper (the server refuses anyone else): kick out the users of the given teams.
export async function kickTeams(code, teamIds, toast) {
  try {
    const r = await api(`/auctions/${code}/kick`, { method: 'POST', body: { teamIds } });
    toast.ok(r.removed.length === 1 ? `${r.removed[0].user || 'User'} (${r.removed[0].short}) was kicked out` : `${r.removed.length} users were kicked out`);
    return true;
  } catch (e) { toast.err(e.message); return false; }
}
export const kickable = (auction) => auction.teams.filter((t) => t.claimed && !t.host);
const msg = (list) => (list.length === 1 ? `Kick out ${list[0].ownerName} (${list[0].short})? They will not be able to rejoin this room.` : `Kick out ${list.length} users (${list.map((t) => t.short).join(', ')})? They will not be able to rejoin this room.`);
export const confirmKick = (list) => window.confirm(msg(list));

// Pick one or several users, grouped by the team they joined, then kick them out together.
export function KickDialog({ onClose }) {
  const { auction, code } = useAuction();
  const toast = useToast();
  const [sel, setSel] = useState([]);
  const [busy, setBusy] = useState(false);
  const users = kickable(auction);
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  useEffect(() => { setSel((s) => s.filter((id) => users.some((t) => t.team === id))); }, [auction]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const go = async () => {
    const list = users.filter((t) => sel.includes(t.team));
    if (!list.length || !confirmKick(list)) return;
    setBusy(true);
    if (await kickTeams(code, sel, toast)) onClose(); else setBusy(false);
  };
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Kick out users" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn x" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="panel-title">KICK OUT USERS</h3>
        {!users.length ? <p className="muted">No other users have joined a team.</p> : (
          <>
            <p className="muted small">Tick one user or several. Their teams go back to the bots.</p>
            <div className="row-btns kick-quick"><button type="button" className="btn ghost sm" onClick={() => setSel(users.map((t) => t.team))}>Select all</button><button type="button" className="btn ghost sm" onClick={() => setSel([])}>Clear</button></div>
            <ul className="kick-list">
              {users.map((t) => (
                <li key={t.team}><label className={`save-opt${sel.includes(t.team) ? ' on' : ''}`}>
                  <input type="checkbox" checked={sel.includes(t.team)} onChange={() => toggle(t.team)} />
                  <TeamBadge short={t.short} color={t.color} size={34} />
                  <span><b>{t.ownerName}</b><small>{t.name}</small></span>
                </label></li>
              ))}
            </ul>
          </>
        )}
        <div className="row-btns"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn primary danger" disabled={!sel.length || busy} onClick={go}>{busy ? 'Kicking…' : `Kick out${sel.length ? ` (${sel.length})` : ''}`}</button></div>
      </div>
    </div>
  );
}

// Host-only Yes / No question shown when the host clicks a team that a user has joined. "No" changes nothing:
// the team stays selected and its players stay on screen exactly as before.
export function KickConfirm({ team, squad, onClose }) {
  const { code } = useAuction();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const yes = async () => { setBusy(true); await kickTeams(code, [team.team], toast); onClose(); };
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="kc-title" onClick={() => !busy && onClose()}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 id="kc-title" className="panel-title">KICK OUT {team.ownerName?.toUpperCase()}?</h3>
        <p>Do you want to kick <b>{team.ownerName}</b> out of <b>{team.name}</b>?</p>
        <p className="muted small">The team keeps its {squad} player{squad === 1 ? '' : 's'} and its {(team.purse / 100).toFixed(2)} Cr purse. A Bot takes over and continues the auction for this team. {team.ownerName} cannot rejoin this room.</p>
        <div className="row-btns"><button type="button" className="btn ghost" disabled={busy} onClick={onClose} autoFocus>No</button><button type="button" className="btn primary danger" disabled={busy} onClick={yes}>{busy ? 'Kicking…' : 'Yes'}</button></div>
      </div>
    </div>
  );
}
