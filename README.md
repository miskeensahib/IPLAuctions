# IPL Auction 2026

React (Vite) + Node/Express + Socket.IO + MongoDB Atlas (Mongoose).

## Setup (Node 18+; Node 22 recommended)
1. **Atlas**: create a free cluster, a database user, and allow your IP (Network Access). Copy the connection string.
2. `cd server && cp .env.example .env`, then set `MONGODB_URI` and `ADMIN_KEY`. (The `.env` in this folder currently uses `USE_MEMORY_DB=true` for local testing; remove that line when you add Atlas.)
3. `cd server && npm install && npm run dev` (seeds teams, mode presets and the 274-player pool on boot; safe to re-run).
4. `cd client && npm install && npm run dev` -> http://localhost:5173
5. Production: `cd client && npm run build`; set `VITE_API_URL` at build time and `CLIENT_ORIGIN` on the server.

`npm test` in `server/` runs two end-to-end suites on an in-memory MongoDB (mode rules, timer permissions, logout, images, and a full auction with purse reconciliation).

## Auction modes
| Mode | Purse | Squad | Order |
|---|---|---|---|
| Mega | ₹120 Cr | min 18, max 25 | prominent players first (Kohli, Rohit, Dhoni, ...) then the rest, all 274 players |
| Mini | ₹90 Cr | max 18 | random |
| Rapid | ₹50 Cr | max 12, 30-player pool | random |

Rules enforced **on the server**: purse, squad max, overseas max (8), IPL bid increments, one owner per player, atomic concurrent bids, and in Mega a **purse reserve**: a bid is rejected if it would leave too little to reach the 18-player minimum (₹0.30 Cr per missing player), with an explanatory message. Mega creation fails with a clear message if the pool cannot supply 18 players to every team.
A lot ends only when its timer runs out (sold to the highest bidder, otherwise unsold). Pass / Sold / Next Player were removed from the UI; the API routes remain.

## Bid timer
The auction host (creator) has **Settings** beside **End auction**: 5/10/15/20/25/30/45/60 s. Stored in MongoDB per auction, pushed to everyone over Socket.IO, validated on the server, host-only (`PUT /api/auctions/:code/timer`). New players start at this time and each bid resets the clock to it; the lot already running keeps its clock.

## Logout
Clears the session on this device (name, team/host markers, admin key, identity), hands any team this browser controlled back to the bots, and returns to the login page. Pages redirect to login without a session. Auction data and other users are untouched. Hosts should end their auction before logging out (a host who logs out cannot manage it afterwards).

## Data and sources
- Squads (name, role, country, **image URL**): iplt20.com team squad pages, imported by `npm run import-squads` into `server/src/scripts/squads.json` (274 players, every one with its own image). Images are hotlinked, stored as URLs in MongoDB (`image`, small `imageThumb`), with an initials fallback if one fails.
- 2026 auction results (buyer + price, 71 players): ipl.com results page.
- **Not available from either source**: base prices (estimated: marquee ₹2 Cr, else nearest slab to the sale price, else ₹0.30 Cr, flagged "est."), previous teams, career stats, unsold list. Prominent-first order is an editorial list in `seedData.js`, not an official ranking. Andre Russell is not on the current iplt20.com KKR squad, so he is not in the pool.
- Fix or add anything in the Admin Panel or via `POST /api/players/bulk`. Seeding only rewrites records older than the current seed version, so your edits survive restarts.
- No real user accounts: players are identified by a browser id; admin routes use `ADMIN_KEY`.
