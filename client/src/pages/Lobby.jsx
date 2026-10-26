import { useState } from 'react';
import { api } from '../api';
import { useAuction, useToast, useUserName } from '../state';
import { TeamBadge } from '../ui';
import { cr } from '../utils';

export default function Lobby() {
  const { auction, myTeamId, setMyTeam, isHost, code } = useAuction();
  const [name] = useUserName();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const s = auction.settings;

  const claim = async (t) => {
    setBusy(true);
    try {
      if (myTeamId && myTeamId !== t.team && auction.play === 'solo') await api(`/auctions/${code}/release`, { method: 'POST', body: { teamId: myTeamId } });
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
        <div className="team-grid">
          {auction.teams.map((t) => {
            const mine = t.team === myTeamId;
            const taken = t.claimed && !mine;
            return (
              <button key={t.team} disabled={busy || taken} className={`team-pick${mine ? ' mine' : ''}${taken ? ' taken' : ''}`} style={{ '--tc': t.color }} onClick={() => claim(t)}>
                <TeamBadge short={t.short} color={t.color} size={52} />
                <b>{t.short}</b><small>{t.name}</small>
                {taken && <em>{t.ownerName}</em>}{mine && <em>✓ You</em>}
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
          <div><dt>Timer</dt><dd>{s.initialSeconds}s, resets to {s.resetSeconds}s on bid</dd></div><div><dt>Players</dt><dd>{auction.poolTotal}</dd></div>
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
