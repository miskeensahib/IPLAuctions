// Who is online right now. A person is online while at least one browser tab of theirs holds a live connection to the
// server (socket.io), so closing the site, logging out or losing the network turns them offline by itself.
// A short grace period keeps a page refresh from flashing "offline": the person only goes offline if they have not
// come back within GRACE_MS.
const GRACE_MS = Number(process.env.PRESENCE_GRACE_MS ?? 4000);
const users = new Map(); // clientId -> { sockets: Set<socketId>, timer }
let onChange = () => {};

const setOnChange = (fn) => { onChange = fn; };
const isOnline = (clientId) => !!clientId && users.has(clientId);

function connect(clientId, socketId) {
  let u = users.get(clientId);
  const wasOnline = !!u;
  if (!u) { u = { sockets: new Set(), timer: null }; users.set(clientId, u); }
  if (u.timer) { clearTimeout(u.timer); u.timer = null; }
  u.sockets.add(socketId);
  if (!wasOnline) onChange(clientId, true);
}
function disconnect(clientId, socketId) {
  const u = users.get(clientId);
  if (!u) return;
  u.sockets.delete(socketId);
  if (u.sockets.size || u.timer) return;
  u.timer = setTimeout(() => { if (!u.sockets.size) { users.delete(clientId); onChange(clientId, false); } }, GRACE_MS);
  u.timer.unref?.();
}
module.exports = { connect, disconnect, isOnline, setOnChange, GRACE_MS };
