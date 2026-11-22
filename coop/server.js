'use strict';
/* ============================================================
   M1 local server — rooms over plain HTTP, no dependencies.

     node files/coop/server-node.js            (port 3000)
     PORT=3010 node files/coop/server-node.js

   GET  /                      the client page
   GET  /events?room=AB12&id=p1   server-sent events, one snapshot per tick
   POST /input                 one player's latest input, JSON body
   GET  /stats?room=AB12       room summary, for debugging
   GET  /health                liveness

   Server-sent events rather than WebSockets on purpose: the whole point of
   M1 is the messages, not the transport, and this keeps the server to one
   file with nothing to install. The Durable Object version replaces this.
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { RoomManager } = require('./room.js');

const PORT = Number(process.env.PORT || 3000);
const mgr = new RoomManager({ maxPlayers: 4 });
const CLIENT = path.join(__dirname, 'client.html');
const RENDER = path.join(__dirname, 'render.js');

function getRoom(code, createIfMissing) {
  let room = mgr.get(code);
  if (!room && createIfMissing) room = mgr.create(String(code || 'AB12').toUpperCase());
  return room;
}

/* a stand-alone co-op app lives on another origin (a downloaded bundle, a
   static host), so every response says it is fine to call from anywhere */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

function json(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, CORS));
  res.end(s);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const roomCode = (url.searchParams.get('room') || 'AB12').toUpperCase();

  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
  const playerId = url.searchParams.get('id') || ('p' + Math.floor(Math.random() * 1000));

  if (url.pathname === '/' || url.pathname === '/index.html') {
    fs.readFile(CLIENT, (err, buf) => {
      if (err) { res.writeHead(500); res.end('client.html missing'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
    return;
  }

  if (url.pathname === '/render.js') {
    fs.readFile(RENDER, (err, buf) => {
      if (err) { res.writeHead(500); res.end('render.js missing'); return; }
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
    return;
  }

  if (url.pathname === '/health') { json(res, 200, { ok: true, rooms: mgr.rooms.size }); return; }

  // a tab that was opened without ?id= asks for a free seat, so two plain
  // tabs become p1 and p2 instead of fighting over the same survivor
  if (url.pathname === '/free-id') {
    const room = getRoom(roomCode, true);
    const taken = new Set(room ? room.S.players.map(p => p.id) : []);
    let id = 'p1';
    for (let i = 1; i <= 9; i++) { if (!taken.has('p' + i)) { id = 'p' + i; break; } }
    json(res, 200, { room: room ? room.code : roomCode, id });
    return;
  }

  if (url.pathname === '/stats') {
    const room = getRoom(roomCode, false);
    if (!room) { json(res, 404, { error: 'no such room' }); return; }
    const s = room.snapshot();
    json(res, 200, {
      room: room.code, tick: s.tick, t: s.t, wave: s.wave, kills: s.kills,
      players: s.players.map(p => ({ id: p.id, hp: p.hp, alive: p.alive })),
      zombies: s.zombies.length, bullets: s.bullets.length, clients: room.clients.size
    });
    return;
  }

  if (url.pathname === '/events') {
    const room = getRoom(roomCode, true);
    if (!room) { json(res, 503, { error: 'cannot create room' }); return; }
    const joined = room.join(playerId);
    if (!joined.ok) { json(res, 409, { error: joined.reason }); return; }

    res.writeHead(200, Object.assign({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    }, CORS));
    res.write('retry: 1000\n\n');
    // a fresh client needs the world immediately, then one per tick
    res.write('data: ' + JSON.stringify(joined.snapshot) + '\n\n');

    const unsubscribe = room.subscribe(playerId, wire => {
      try { res.write('data: ' + wire + '\n\n'); } catch (e) { /* client gone */ }
    });

    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 15000);

    req.on('close', () => {
      clearInterval(ping);
      unsubscribe();
      room.leave(playerId);
      if (room.clients.size === 0) setTimeout(() => {
        const r = mgr.get(room.code);
        if (r && r.clients.size === 0) mgr.close(room.code);
      }, 60000);
    });
    return;
  }

  if (url.pathname === '/input' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const room = getRoom(String(data.room || roomCode).toUpperCase(), false);
        if (!room) { json(res, 404, { error: 'no such room' }); return; }
        room.setInput(String(data.id || playerId), {
          mx: Number(data.mx) || 0,
          my: Number(data.my) || 0,
          aim: Number.isFinite(+data.aim) ? +data.aim : undefined,
          fire: !!data.fire,
          reload: !!data.reload,
          medkit: !!data.medkit,
          sprint: !!data.sprint
        });
        json(res, 200, { ok: true, tick: room.tickIndex });
      } catch (e) {
        json(res, 400, { error: 'bad input' });
      }
    });
    return;
  }

  json(res, 404, { error: 'not found' });
});

/* every room ticks whether or not a request has arrived recently */
setInterval(() => {
  for (const [, room] of mgr.rooms) if (!room.closed) room.tick();
}, 50);

setInterval(() => mgr.sweep(60000), 30000);

server.listen(PORT, '0.0.0.0', () => {
  console.log('ROT & RUIN co-op (M1) listening on http://0.0.0.0:' + PORT);
  console.log('room codes: use ?room=AB12 in the page URL');
});
