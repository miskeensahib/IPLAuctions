import { useState } from 'react';
import { api } from '../api';
import { useAuction, useToast, useUserName } from '../state';
import { TeamBadge } from '../ui';
import { cr } from '../utils';
import { KickConfirm, confirmKick, kickTeams, kickable } from '../KickOut';

export default function Lobby() {
  const { auction, myTeamId, setMyTeam, isHost, kicked, code } = useAuction();
  const [name] = useUserName();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(null); // host only: the user whose details are open
  const [multi, setMulti] = useState(false); // host only: tick several teams instead of opening one user
  const [sel, setSel] = useState([]); // host only: teams whose users are selected to be kicked out
  const s = auction.settings;
  const users = isHost ? kickable(auction) : [];
  const chosen = users.filter((t) => sel.includes(t.team));
  const toggle = (id) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const kick = async () => { if (!chosen.length || !confirmKick(chosen)) return; setBusy(true); if (await kickTeams(code, chosen.map((t) => t.team), toast)) setSel([]); setBusy(false); };

  const claim = async (t) => {
    setBusy(true);
    try {
      await api(`/auctions/${code}/claim`, { method: 'POST', body: { teamId: t.team, name } });
      setMyTeam(t.team); toast.ok(`You are ${t.name}`);
    } catch (e) { toast.err(e.message); } finally { setBusy(false); }
  };
  const release = async () => {
    try { await api(`/auctions/${code}/release`, { method: 'POST', body: { teamId: myTeamId } }); setMyTeam(null); } catch (e) { toast.err(e.message); }
  };
  const start = async () => {
    setBusy(true);
    try { await api(`/auctions/${code}/start`, { method: 'POST' }); } catch (e) { toast.err(e.message); } finally { setBusy(false); }
  };
  const copy = () => { navigator.clipboard?.writeText(`${location.origin}/a/${code}`).then(() => toast.ok('Invite link copied')).catch(() => toast.info(`Share code ${code}`)); };

  return (
    <div className="lobby">
      <section className="panel">
        <div className="lobby-head">
          <div><h3 className="panel-title">SELECT YOUR TEAM</h3><p className="muted small">{auction.name} · {auction.play === 'solo' ? 'Solo vs bots' : 'Multiplayer room'}</p></div>
          <button className="btn ghost sm" onClick={copy}>Room {code} · Copy link</button>
        </div>
        {kicked && <div className="banner warn">The host removed you from this room, so you can only watch.</div>}
        {isHost && users.length > 0 && (
          <div className="kick-bar">
            <span className="muted small">{multi ? 'Tap teams to tick their users, then Kick out.' : 'Host: tap a joined team to see that user and kick them out.'}</span>
            <span className="kick-actions">
              <button type="button" className={`btn ghost sm${multi ? ' on' : ''}`} aria-pressed={multi} onClick={() => { setMulti(!multi); setSel([]); }}>{multi ? 'Done' : 'Select several'}</button>
              {multi && <button type="button" className="btn ghost sm" onClick={() => setSel(users.map((t) => t.team))}>Select all</button>}
              {multi && chosen.length > 0 && <button type="button" className="btn ghost sm" onClick={() => setSel([])}>Clear</button>}
              {multi && <button type="button" className="btn ghost sm danger" disabled={!chosen.length || busy} onClick={kick}>Kick out{chosen.length ? ` (${chosen.length})` : ''}</button>}
            </span>
          </div>
        )}
        {ask && <KickConfirm team={ask} onClose={() => setAsk(null)} />}
        <div className="team-grid">
          {auction.teams.map((t) => {
            const mine = t.team === myTeamId;
            const taken = t.claimed && !mine;
            const kickPick = isHost && taken && !t.host; // the host can select other users' teams to kick them out
            const picked = kickPick && multi && sel.includes(t.team);
            return (
              <button key={t.team} disabled={busy || (taken && !kickPick) || (kicked && !taken)} className={`team-pick${mine ? ' mine' : ''}${taken ? ' taken' : ''}${kickPick ? ' kickable' : ''}${picked ? ' picked' : ''}`} style={{ '--tc': t.color }} onClick={() => (kickPick ? (multi ? toggle(t.team) : setAsk(t)) : claim(t))} aria-pressed={kickPick ? picked : undefined}>
                <TeamBadge short={t.short} color={t.color} size={52} />
                <b>{t.short}</b><small>{t.name}</small>
                {taken && <em>{picked ? '\u2713 ' : ''}{t.ownerName}</em>}{mine && <em>✓ You</em>}
              </button>
            );
          })}
        </div>
      </section>
      <section className="panel rules">
        <h3 className="panel-title">AUCTION RULES</h3>
        <dl className="kv">
          <div><dt>Mode</dt><dd style={{ textTransform: 'capitalize' }}>{auction.mode} auction</dd></div><div><dt>Purse</dt><dd>{cr(s.purse)}</dd></div>
          <div><dt>Squad size</dt><dd>{s.minSquad ? `min ${s.minSquad}, ` : ''}max {s.maxSquad}</dd></div><div><dt>Overseas</dt><dd>max {s.maxOverseas}</dd></div>
          <div><dt>Timer</dt><dd>{s.initialSeconds}s, restarts on every bid</dd></div><div><dt>Players</dt><dd>{auction.poolTotal}</dd></div>
          <div><dt>Increments</dt><dd>5L &lt;1Cr · 10L &lt;2Cr · 20L &lt;5Cr · 25L above</dd></div>
        </dl>
        <p className="muted small">Unclaimed teams are controlled by bots. {s.minSquad ? `You must keep enough purse to still reach the minimum squad of ${s.minSquad} (₹0.30 Cr per missing player). ` : ''}Bids must beat the current bid by the increment, fit your purse and respect squad and overseas limits.</p>
        {isHost ? (
          <button className="btn primary block" disabled={!myTeamId || busy} onClick={start}>{myTeamId ? 'START AUCTION' : 'Pick a team to start'}</button>
        ) : <p className="center-msg">Waiting for {auction.hostName} to start…</p>}
        {myTeamId && <button className="link-btn" onClick={release}>Release my team</button>}
      </section>
    </div>
  );
}
