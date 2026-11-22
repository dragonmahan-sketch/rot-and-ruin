'use strict';
/* ============================================================
   M1 — a room that owns the world
   ------------------------------------------------------------
   One Room holds one simulation. Players join, send inputs, and every
   50 ms the room advances the world by three fixed 1/60 steps and
   broadcasts one snapshot to everybody in it.

   Transport-agnostic on purpose: in Node the "socket" is a callback, in
   the browser it will be a WebSocket, on Cloudflare it will be the
   Durable Object. The room never knows which.
   ============================================================ */

const { createState, step, newPlayer, STEP, WORLD } = require('./sim.js');

const TICK_HZ = 20;
const TICK_MS = 1000 / TICK_HZ;
const STEPS_PER_TICK = Math.round((1 / TICK_HZ) / STEP); // 3

const q = v => Math.round(v * 10) / 10;

/* a room code a person can read out loud */
const ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY';
function makeCode(rng) {
  let out = '';
  for (let i = 0; i < 4; i++) out += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return out;
}

class Room {
  constructor({ code, seed = 1, maxPlayers = 4 } = {}) {
    this.code = code || 'ROOM';
    this.seed = seed;
    this.maxPlayers = maxPlayers;
    this.S = createState({ seed, players: [] });
    this.inputs = new Map();      // playerId -> latest input record
    this.clients = new Map();     // playerId -> { send(snapshotString), lastSeen }
    this.tickIndex = 0;
    this.broadcasts = 0;
    this.closed = false;
    this.timer = null;
  }

  get players() { return this.S.players; }
  get full() { return this.S.players.length >= this.maxPlayers; }

  join(playerId) {
    if (this.closed) return { ok: false, reason: 'closed' };
    if (this.clients.has(playerId)) return { ok: true, rejoined: true };

    // a returning client picks its old survivor back up rather than lying dead
    const existing = this.S.players.find(x => x.id === playerId);
    if (existing) {
      if (!existing.alive) {
        existing.alive = true;
        existing.hp = Math.max(existing.hp, 40);
      }
      this.inputs.set(playerId, { id: playerId, mx: 0, my: 0, fire: false });
      return { ok: true, rejoined: true, player: existing, snapshot: this.snapshot() };
    }
    if (this.full) return { ok: false, reason: 'full' };

    const p = newPlayer(playerId);
    // spread the survivors around the spawn point so they do not stack
    const n = this.S.players.length;
    const a = (Math.PI * 2 * n) / Math.max(1, this.maxPlayers) + Math.PI / 4;
    p.x = WORLD.w / 2 + Math.cos(a) * 40;
    p.y = WORLD.h / 2 + Math.sin(a) * 40;
    this.S.players.push(p);
    this.inputs.set(playerId, { id: playerId, mx: 0, my: 0, fire: false });
    // a room whose whole team died is frozen by the simulation; someone walking
    // in restarts it instead of finding an empty world that never moves
    if (this.S.mode !== 'playing') {
      this.S.mode = 'playing';
      this.S.spawnTimer = 0.4;
    }
    return { ok: true, player: p, snapshot: this.snapshot() };
  }

  leave(playerId) {
    this.clients.delete(playerId);
    this.inputs.delete(playerId);
    // the survivor leaves the world with them, so a dropped tab does not leave
    // a corpse standing in the room or hold a slot for whoever joins next
    const i = this.S.players.findIndex(x => x.id === playerId);
    if (i >= 0) this.S.players.splice(i, 1);
    if (this.S.players.length === 0) this.resetRun();
    return { players: this.S.players.length };
  }

  /** an empty room starts over, keeping its code and its seed */
  resetRun() {
    this.S = createState({ seed: this.seed, players: [] });
    this.inputs.clear();
    return this.S;
  }

  /** a client registers a delivery callback; it gets every snapshot from then on */
  subscribe(playerId, send) {
    this.clients.set(playerId, { send, lastSeen: Date.now() });
    return () => this.clients.delete(playerId);
  }

  /** the newest input from one player replaces the previous one */
  setInput(playerId, input) {
    if (!this.inputs.has(playerId)) this.inputs.set(playerId, { id: playerId });
    const cur = this.inputs.get(playerId);
    Object.assign(cur, input, { id: playerId });
  }

  inputList() {
    // fixed order, so the simulation is not affected by who sent first
    return [...this.inputs.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /** advance the world to the next snapshot */
  tick() {
    if (this.closed) return null;
    for (let i = 0; i < STEPS_PER_TICK; i++) step(this.S, STEP, this.inputList());
    this.tickIndex++;
    const snap = this.snapshot();
    const wire = JSON.stringify(snap);
    for (const [, c] of this.clients) c.send(wire);
    this.broadcasts++;
    return wire;
  }

  /** the compact state a client draws from */
  snapshot() {
    const S = this.S;
    return {
      room: this.code,
      tick: this.tickIndex,
      t: q(S.time),
      wave: S.wave,
      kills: S.kills,
      dark: q(S.darkness),
      mode: S.mode,
      players: S.players.map(p => ({
        id: p.id, x: q(p.x), y: q(p.y), hp: Math.round(p.hp), mh: Math.round(p.maxHp), alive: p.alive,
        a: Math.round(p.angle * 100) / 100,
        w: p.arsenal[p.cur].id, mag: p.arsenal[p.cur].mag, res: p.arsenal[p.cur].reserve,
        med: p.medkits, rl: p.reloading > 0
      })),
      zombies: S.zombies.map(z => ({
        id: z.id, x: q(z.x), y: q(z.y), ty: z.type, hp: Math.round(z.hp), m: Math.round(z.maxHp),
        a: Math.round(z.angle * 100) / 100, r: z.r, b: !!z.boss
      })),
      bullets: S.bullets.map(b => ({ id: b.id, x: q(b.x), y: q(b.y), px: q(b.px), py: q(b.py), o: b.owner })),
      pickups: S.pickups.map(k => ({ id: k.id, x: q(k.x), y: q(k.y), ty: k.type })),
      bossCaches: S.bossCaches.map(c => ({ id: c.id, x: q(c.x), y: q(c.y), locked: c.locked }))
    };
  }

  start() {
    if (this.timer) return this;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.closed = true;
  }
}

/* ------------------------------------------------------------
   room manager: codes in, room out
   ------------------------------------------------------------ */
class RoomManager {
  constructor(opts = {}) {
    this.rooms = new Map();
    this.opts = opts;
    this.seedCounter = 1;
  }
  create(code) {
    let c = code;
    if (!c) {
      let tries = 0;
      do { c = makeCode(Math.random); tries++; } while (this.rooms.has(c) && tries < 200);
    }
    if (this.rooms.has(c)) return null;
    const room = new Room({ code: c, seed: this.seedCounter++, maxPlayers: this.opts.maxPlayers || 4 });
    this.rooms.set(c, room);
    return room;
  }
  get(code) {
    const r = this.rooms.get(String(code || '').toUpperCase());
    return r && !r.closed ? r : null;
  }
  close(code) {
    const r = this.rooms.get(code);
    if (r) { r.stop(); this.rooms.delete(code); }
  }
  sweep(maxIdleMs) {
    const now = Date.now();
    for (const [code, r] of this.rooms) {
      // drop survivors whose tab is gone, so a killed connection does not leave
      // a ghost standing in the room
      const seats = new Set(r.clients.keys());
      r.S.players = r.S.players.filter(p => seats.has(p.id));
      const live = [...r.clients.values()].some(c => now - c.lastSeen < maxIdleMs);
      if (!live) this.close(code);
    }
  }
}

module.exports = { Room, RoomManager, makeCode, TICK_HZ, TICK_MS, STEPS_PER_TICK };
