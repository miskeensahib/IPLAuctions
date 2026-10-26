require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const { connectDb } = require('./config/db');
const engine = require('./engine/auctionEngine');
const { seedAll } = require('./scripts/seed');

const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim());

function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: origins }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));
  // Never pretend to work without the database: health and every API call report the real connection state.
  const dbUp = () => mongoose.connection.readyState === 1;
  app.get('/api/health', (_req, res) => res.status(dbUp() ? 200 : 503).json({ ok: dbUp(), db: dbUp() ? 'connected' : 'disconnected', time: Date.now() }));
  app.use('/api', (_req, res, next) => (dbUp() ? next() : res.status(503).json({ error: 'Database is unavailable. Please try again shortly.' })));
  app.use('/api/players', require('./routes/players'));
  app.use('/api/teams', require('./routes/teams'));
  app.use('/api/auctions', require('./routes/auctions'));
  app.use('/api/watchlist', require('./routes/watchlist'));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    let status = err.status || 500;
    let message = err.message;
    if (err.name === 'ValidationError') { status = 400; message = Object.values(err.errors).map((e) => e.message).join('; '); }
    else if (err.name === 'CastError') { status = 400; message = 'Invalid id'; }
    else if (status === 500) { console.error(err); message = 'Internal server error'; }
    res.status(status).json({ error: message });
  });
  return app;
}

async function main() {
  await connectDb();
  if (process.env.AUTO_SEED !== 'false') console.log('[seed]', await seedAll());
  const server = http.createServer(buildApp());
  const io = new Server(server, { cors: { origin: origins } });
  engine.init(io);
  io.on('connection', (socket) => {
    socket.on('auction:join', async (code) => {
      code = String(code || '').toUpperCase().slice(0, 12);
      socket.join(`auction:${code}`);
      try { socket.emit('auction:update', await engine.view(code)); } catch { /* unknown code */ }
    });
    socket.on('auction:leave', (code) => socket.leave(`auction:${String(code).toUpperCase()}`));
  });
  await engine.recover();
  const port = process.env.PORT || 4000;
  server.listen(port, () => console.log(`[server] http://localhost:${port}`));
}

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e?.message || e));
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { buildApp };
