import { useEffect, useState } from 'react';
import { api } from './api';
import { useAuction, useToast } from './state';
import { Presence, TeamBadge } from './ui';

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
                  <span><b><Presence online={t.online} name={t.ownerName} />{t.ownerName}</b><small>{t.name}</small></span>
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

// Host-only: the details of the user who joined a team, with a Kick out button that asks Yes / No.
// "No" (or Close) changes nothing: the team stays selected and its players stay on screen exactly as before.
export function KickConfirm({ team, squad, onClose }) {
  const { code, auction } = useAuction();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const players = squad ?? team.count ?? 0;
  const liveTeam = auction.teams.find((x) => x.team === team.team) || team; // stays up to date while the card is open
  const yes = async () => { setBusy(true); await kickTeams(code, [team.team], toast); onClose(); };
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="kc-title" onClick={() => !busy && onClose()}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn x" onClick={onClose} aria-label="Close" disabled={busy}>✕</button>
        <div className="cp-top"><TeamBadge short={team.short} color={team.color} size={64} />
          <div className="cp-info"><h3 id="kc-title" className="panel-title" style={{ margin: 0 }}>{team.ownerName}</h3><small className="muted">User in {team.name}</small></div>
        </div>
        <dl className="kv">
          <div><dt>Username</dt><dd><Presence online={liveTeam.online} name={team.ownerName} />{team.ownerName}</dd></div>
          <div><dt>Status</dt><dd>{liveTeam.online ? 'Online' : 'Offline'}</dd></div>
          <div><dt>Team</dt><dd>{team.name} ({team.short})</dd></div>
          <div><dt>Players bought</dt><dd>{players} / {auction.settings.maxSquad}</dd></div>
          <div><dt>Purse left</dt><dd>{(team.purse / 100).toFixed(2)} Cr</dd></div>
          <div><dt>Spent</dt><dd>{((team.spent || 0) / 100).toFixed(2)} Cr</dd></div>
          <div><dt>Overseas</dt><dd>{team.overseas ?? 0} / {auction.settings.maxOverseas}</dd></div>
        </dl>
        {!sure ? (
          <div className="row-btns"><button type="button" className="btn ghost" onClick={onClose}>Close</button><button type="button" className="btn primary danger" onClick={() => setSure(true)}>Kick out {team.ownerName}</button></div>
        ) : (
          <>
            <p><b>Kick out {team.ownerName} from {team.name}?</b></p>
            <p className="muted small">The team keeps its {players} player{players === 1 ? '' : 's'} and its purse. A Bot takes over and continues the auction for this team. {team.ownerName} cannot rejoin this room.</p>
            <div className="row-btns"><button type="button" className="btn ghost" disabled={busy} onClick={onClose} autoFocus>No</button><button type="button" className="btn primary danger" disabled={busy} onClick={yes}>{busy ? 'Kicking…' : 'Yes'}</button></div>
          </>
        )}
      </div>
    </div>
  );
}
