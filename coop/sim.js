'use strict';
/* ============================================================
   ROT & RUIN — headless simulation (M0)
   ------------------------------------------------------------
   The simulation from game/index.html, lifted out of the page:
   no canvas, no DOM, no localStorage, no audio, no requestAnimationFrame.
   It takes a state object and a list of player inputs, and returns new
   state. All randomness comes from one seeded generator, so the same
   seed and the same inputs always produce the same run.

   Nothing here runs in the browser yet; game/index.html is untouched.
   ============================================================ */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function segCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const fx = x1 - cx, fy = y1 - cy;
  const a = dx * dx + dy * dy;
  let t = a > 0.0001 ? -(fx * dx + fy * dy) / a : 0;
  t = clamp(t, 0, 1);
  const px = x1 + dx * t - cx, py = y1 + dy * t - cy;
  return px * px + py * py <= r * r;
}

/* ------------------------------------------------------------
   constants (identical to the game)
   ------------------------------------------------------------ */
const WAVE_DUR = 40;
const DAY_CYCLE = 210;
const STEP = 1 / 60;
const MAX_Z = 58;

function dayPhase(t) {
  const p = (t % DAY_CYCLE) / DAY_CYCLE;
  let d = 0, name = 'DAY';
  if (p < 0.36) { d = 0; name = 'DAY'; }
  else if (p < 0.46) { d = (p - 0.36) / 0.10; name = 'DUSK'; }
  else if (p < 0.76) { d = 1; name = 'NIGHT'; }
  else if (p < 0.86) { d = 1 - (p - 0.76) / 0.10; name = 'DAWN'; }
  d = clamp(d, 0, 1);
  return { name, d: d * d * (3 - 2 * d), p };
}

const WEAPONS = {
  pistol:  { name: 'PISTOL',  key: '1', dmg: 26, cd: 0.125, mag: 12, reload: 1.1, spread: 0.025, pellets: 1, speed: 1150, life: 0.70, maxReserve: 300, box: 30, shake: 1.6 },
  shotgun: { name: 'SHOTGUN', key: '2', dmg: 11, cd: 0.75,  mag: 6,  reload: 2.0, spread: 0.155, pellets: 7, speed: 980,  life: 0.34, maxReserve: 90,  box: 8,  shake: 6.0 },
  rifle:   { name: 'RIFLE',   key: '3', dmg: 34, cd: 0.11,  mag: 30, reload: 2.1, spread: 0.030, pellets: 1, speed: 1500, life: 0.90, maxReserve: 240, box: 20, shake: 2.2 },
  smg:     { name: 'SMG',     key: '4', dmg: 15, cd: 0.07,  mag: 25, reload: 1.5, spread: 0.060, pellets: 1, speed: 1250, life: 0.60, maxReserve: 360, box: 45, shake: 1.1 },
  smoke:   { name: 'SMOKE',   key: '5', dmg: 0,  cd: 0.85,  mag: 2,  reload: 2.2, spread: 0,     pellets: 0, speed: 0,    life: 0,    maxReserve: 8,   box: 2,  shake: 0, thrown: 'smoke' },
  frag:    { name: 'FRAG',    key: '6', dmg: 0,  cd: 0.95,  mag: 2,  reload: 2.4, spread: 0,     pellets: 0, speed: 0,    life: 0,    maxReserve: 8,   box: 2,  shake: 0, thrown: 'frag' }
};

const ZTYPE = [
  { r: 14, hp: 60, speed: 66, dmg: 9 },
  { r: 11, hp: 38, speed: 132, dmg: 6 },
  { r: 23, hp: 240, speed: 48, dmg: 22 }
];

/* headless stand-ins for the presentation layer */
const AUDIO = new Proxy({}, { get: () => () => {} });
const GFX = { decalCap: 190, partCap: 190, partChance: 1 };

/* ------------------------------------------------------------
   world
   ------------------------------------------------------------ */
const WORLD = { w: 5600, h: 5600 };
const ROAD_H = { x0: 0, x1: WORLD.w, y0: 2000, y1: 2245 };
const ROAD_V = { x0: 2900, x1: 3120, y0: 0, y1: WORLD.h };
const ROADS = [ROAD_H, ROAD_V];
const CELL = 240;

function inRoad(x, y) {
  return (x > ROAD_H.x0 && x < ROAD_H.x1 && y > ROAD_H.y0 && y < ROAD_H.y1) ||
         (x > ROAD_V.x0 && x < ROAD_V.x1 && y > ROAD_V.y0 && y < ROAD_V.y1);
}
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw), ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
function overlapsRoad(x, y, w, h, m) {
  m = m || 0;
  for (const r of ROADS) {
    if (rectsOverlap(x - m, y - m, w + 2 * m, h + 2 * m, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0)) return true;
  }
  return false;
}

function obBox(o) {
  if (o.shape === 'rect') return { x0: o.x, x1: o.x + o.w, y0: o.y, y1: o.y + o.h };
  return { x0: o.x - o.r, x1: o.x + o.r, y0: o.y - o.r, y1: o.y + o.r };
}

function buildGrid(world) {
  const GW = Math.ceil(WORLD.w / CELL), GH = Math.ceil(WORLD.h / CELL);
  const grid = new Array(GW * GH);
  for (let i = 0; i < grid.length; i++) grid[i] = [];
  for (const o of world.obstacles) {
    const b = obBox(o);
    const cx0 = clamp(Math.floor(b.x0 / CELL), 0, GW - 1), cx1 = clamp(Math.floor(b.x1 / CELL), 0, GW - 1);
    const cy0 = clamp(Math.floor(b.y0 / CELL), 0, GH - 1), cy1 = clamp(Math.floor(b.y1 / CELL), 0, GH - 1);
    for (let gy = cy0; gy <= cy1; gy++) {
      for (let gx = cx0; gx <= cx1; gx++) grid[gy * GW + gx].push(o);
    }
  }
  world.GW = GW; world.GH = GH; world.grid = grid;
}

function nearObstacles(world, x, y, pad) {
  const out = [];
  const cx0 = clamp(Math.floor((x - pad) / CELL), 0, world.GW - 1);
  const cx1 = clamp(Math.floor((x + pad) / CELL), 0, world.GW - 1);
  const cy0 = clamp(Math.floor((y - pad) / CELL), 0, world.GH - 1);
  const cy1 = clamp(Math.floor((y + pad) / CELL), 0, world.GH - 1);
  for (let gy = cy0; gy <= cy1; gy++) {
    for (let gx = cx0; gx <= cx1; gx++) {
      const cell = world.grid[gy * world.GW + gx];
      for (let i = 0; i < cell.length; i++) out.push(cell[i]);
    }
  }
  return out;
}

function isBlocked(world, x, y, r) {
  const list = nearObstacles(world, x, y, r + 2);
  for (const o of list) {
    if (o.shape === 'rect') {
      const nx = clamp(x, o.x, o.x + o.w), ny = clamp(y, o.y, o.y + o.h);
      const dx = x - nx, dy = y - ny;
      if (dx * dx + dy * dy < r * r) return true;
    } else {
      const rsum = r + o.r;
      const dx = x - o.x, dy = y - o.y;
      if (dx * dx + dy * dy < rsum * rsum) return true;
    }
  }
  return false;
}

function pushOut(world, e) {
  const list = nearObstacles(world, e.x, e.y, e.r + 4);
  for (const o of list) {
    if (o.shape === 'rect') {
      const nx = clamp(e.x, o.x, o.x + o.w), ny = clamp(e.y, o.y, o.y + o.h);
      let dx = e.x - nx, dy = e.y - ny;
      const d = Math.hypot(dx, dy);
      if (d < e.r) {
        if (d < 0.0001) {
          const left = e.x - o.x, right = o.x + o.w - e.x;
          const top = e.y - o.y, bot = o.y + o.h - e.y;
          const m = Math.min(left, right, top, bot);
          if (m === left) e.x = o.x - e.r;
          else if (m === right) e.x = o.x + o.w + e.r;
          else if (m === top) e.y = o.y - e.r;
          else e.y = o.y + o.h + e.r;
        } else {
          const push = (e.r - d) / d;
          e.x += dx * push; e.y += dy * push;
        }
      }
    } else {
      const dx = e.x - o.x, dy = e.y - o.y;
      const rsum = e.r + o.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < rsum * rsum) {
        const d = Math.sqrt(d2) || 0.0001;
        const push = (rsum - d) / d;
        e.x += dx * push; e.y += dy * push;
      }
    }
  }
}
function collideWorld(world, e, passes) {
  for (let i = 0; i < (passes || 2); i++) pushOut(world, e);
}

/* ---------- generation (same rules, seeded) ---------- */
function genWorld(seed) {
  const rng = mulberry32(seed >>> 0);
  const gr = (a, b) => a + rng() * (b - a);
  const world = { obstacles: [], buildings: [], trees: [], rocks: [], cars: [], decals: [], crates: [], weaponCaches: [] };
  const cx = WORLD.w / 2, cy = WORLD.h / 2;

  let guard = 0;
  while (world.buildings.length < 30 && guard++ < 2000) {
    const w = gr(160, 380), h = gr(140, 300);
    const x = gr(160, WORLD.w - 160 - w), y = gr(160, WORLD.h - 160 - h);
    if (overlapsRoad(x, y, w, h, 60)) continue;
    if (circleRect(cx, cy, 430, x, y, w, h)) continue;
    if (world.buildings.some(b => rectsOverlap(x - 80, y - 80, w + 160, h + 160, b.x, b.y, b.w, b.h))) continue;
    const details = [];
    const n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      details.push({ x: x + gr(18, Math.max(24, w - 80)), y: y + gr(18, Math.max(24, h - 76)), w: gr(22, 54), h: gr(18, 42) });
    }
    const b = { shape: 'rect', kind: 'building', x, y, w, h, details };
    world.buildings.push(b); world.obstacles.push(b);
  }

  let tg = 0;
  while (world.trees.length < 560 && tg++ < 9000) {
    const x = gr(70, WORLD.w - 70), y = gr(70, WORLD.h - 70);
    const r = gr(13, 25);
    if (inRoad(x, y)) continue;
    if (Math.hypot(x - cx, y - cy) < 330 + r) continue;
    if (world.buildings.some(b => circleRect(x, y, r + 26, b.x, b.y, b.w, b.h))) continue;
    if (world.trees.some(t => {
      const dx = x - t.x, dy = y - t.y;
      return dx * dx + dy * dy < (r + t.r + 14) * (r + t.r + 14);
    })) continue;
    const t = { shape: 'circle', kind: 'tree', x, y, r, seed: rng() };
    world.trees.push(t); world.obstacles.push(t);
  }

  let rg = 0;
  while (world.rocks.length < 120 && rg++ < 3000) {
    const x = gr(80, WORLD.w - 80), y = gr(80, WORLD.h - 80);
    const r = gr(9, 20);
    if (inRoad(x, y)) continue;
    if (Math.hypot(x - cx, y - cy) < 320 + r) continue;
    if (world.buildings.some(b => circleRect(x, y, r + 12, b.x, b.y, b.w, b.h))) continue;
    if (world.trees.some(t => {
      const dx = x - t.x, dy = y - t.y;
      return dx * dx + dy * dy < (r + t.r + 8) * (r + t.r + 8);
    })) continue;
    const o = { shape: 'circle', kind: 'rock', x, y, r, seed: rng() };
    world.rocks.push(o); world.obstacles.push(o);
  }

  const CAR_COLORS = ['#586470', '#6a5344', '#4c6252', '#5b4c60', '#6e6a58'];
  let cg = 0;
  while (world.cars.length < 18 && cg++ < 800) {
    const horiz = rng() < 0.5;
    let x, y, w, h;
    if (horiz) {
      w = gr(52, 72); h = 28;
      x = gr(180, WORLD.w - 180 - w); y = gr(ROAD_H.y0 + 34, ROAD_H.y1 - 34 - h);
    } else {
      w = 28; h = gr(52, 72);
      x = gr(ROAD_V.x0 + 34, ROAD_V.x1 - 34 - w); y = gr(180, WORLD.h - 180 - h);
    }
    if (world.cars.some(c => rectsOverlap(x - 50, y - 50, w + 100, h + 100, c.x, c.y, c.w, c.h))) continue;
    const car = { shape: 'rect', kind: 'car', x, y, w, h, color: CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)], rust: rng() };
    world.cars.push(car); world.obstacles.push(car);
  }

  for (let i = 0; i < 240; i++) {
    const x = gr(100, WORLD.w - 100), y = gr(100, WORLD.h - 100);
    const r = gr(6, 26);
    if (world.buildings.some(b => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h)) continue;
    world.decals.push({ x, y, r, rot: rng() * TAU, alpha: 0.10 + rng() * 0.16 });
  }

  buildGrid(world);
  makeCrates(world, rng);
  makeWeaponCaches(world, rng);
  return world;
}

function makeCrates(world, rng) {
  const rnd2 = (a, b) => a + rng() * (b - a);
  let guard = 0;
  while (world.crates.length < 46 && guard++ < 4000) {
    const x = rnd2(180, WORLD.w - 180), y = rnd2(180, WORLD.h - 180);
    if (isBlocked(world, x, y, 26)) continue;
    if (Math.hypot(x - WORLD.w / 2, y - WORLD.h / 2) < 320) continue;
    if (world.crates.some(c => Math.hypot(c.x - x, c.y - y) < 160)) continue;
    world.crates.push({ x, y, type: rng() < 0.68 ? 'ammo' : 'medkit' });
  }
}

function makeWeaponCaches(world, rng) {
  const rnd2 = (a, b) => a + rng() * (b - a);
  function findSpot(nearSpawn, minR, maxR, spacing) {
    for (let i = 0; i < 600; i++) {
      let x, y;
      if (nearSpawn) {
        const a = rng() * TAU, r = rnd2(minR, maxR);
        x = WORLD.w / 2 + Math.cos(a) * r; y = WORLD.h / 2 + Math.sin(a) * r;
      } else {
        x = rnd2(240, WORLD.w - 240); y = rnd2(240, WORLD.h - 240);
        if (Math.hypot(x - WORLD.w / 2, y - WORLD.h / 2) < minR) continue;
      }
      x = clamp(x, 180, WORLD.w - 180); y = clamp(y, 180, WORLD.h - 180);
      if (Math.hypot(x - WORLD.w / 2, y - WORLD.h / 2) < 400) continue;
      if (isBlocked(world, x, y, 34)) continue;
      if (world.weaponCaches.some(c => Math.hypot(c.x - x, c.y - y) < spacing)) continue;
      if (world.crates.some(c => Math.hypot(c.x - x, c.y - y) < 110)) continue;
      return { x, y };
    }
    return null;
  }
  const plan = [
    { id: 'shotgun', near: true,  minR: 420,  maxR: 700, spacing: 0 },
    { id: 'shotgun', near: false, minR: 1000, maxR: 0,   spacing: 800 },
    { id: 'shotgun', near: false, minR: 1000, maxR: 0,   spacing: 800 },
    { id: 'rifle',   near: false, minR: 1300, maxR: 0,   spacing: 800 },
    { id: 'rifle',   near: false, minR: 1300, maxR: 0,   spacing: 800 },
    { id: 'rifle',   near: false, minR: 1300, maxR: 0,   spacing: 800 },
    { id: 'smg',     near: true,  minR: 480,  maxR: 760, spacing: 400 },
    { id: 'smg',     near: false, minR: 1100, maxR: 0,   spacing: 800 },
    { id: 'smoke',   near: true,  minR: 520,  maxR: 820, spacing: 400 },
    { id: 'smoke',   near: false, minR: 1200, maxR: 0,   spacing: 800 },
    { id: 'frag',    near: true,  minR: 560,  maxR: 860, spacing: 400 },
    { id: 'frag',    near: false, minR: 1150, maxR: 0,   spacing: 800 }
  ];
  for (const item of plan) {
    const spot = findSpot(item.near, item.minR, item.maxR, item.spacing);
    if (spot) world.weaponCaches.push({ x: spot.x, y: spot.y, id: item.id });
  }
}

/* ------------------------------------------------------------
   state
   ------------------------------------------------------------ */
function newPlayer(id) {
  return {
    id, alive: true,
    x: WORLD.w / 2, y: WORLD.h / 2, r: 13, angle: -Math.PI / 2,
    hp: 100, maxHp: 100, baseSpeed: 210, sprintMul: 1.55,
    arsenal: [{ id: 'pistol', mag: 12, reserve: 60 }], cur: 0,
    reloading: 0, reloadTotal: 0, fireCd: 0, muzzle: 0,
    medkits: 1, invuln: 0, walkPhase: 0
  };
}

function createState({ seed = 1, players = ['p1'] } = {}) {
  const rng = mulberry32((seed * 2654435761) >>> 0);
  const world = genWorld(seed);
  const S = {
    seed, rng, world,
    mode: 'playing',
    players: players.map(newPlayer),
    zombies: [], bullets: [], grenades: [], smokes: [], particles: [], pickups: [], toasts: [],
    crates: [], weaponCaches: [], bossCaches: [], decals: [],
    nextId: 1,
    wave: 1, waveTimer: WAVE_DUR, kills: 0, time: 0, spawnTimer: 0.8,
    darkness: 0, shake: 0, damageFlash: 0, hint: 0, bossSeq: 0, tick: 0
  };
  S.crates = world.crates.map(c => ({ x: c.x, y: c.y, type: c.type, taken: false, bob: rng() * TAU }));
  S.weaponCaches = world.weaponCaches.map(c => ({ x: c.x, y: c.y, id: c.id, taken: false, bob: rng() * TAU }));
  return S;
}

/* ------------------------------------------------------------
   presentation stand-ins (kept so the sim stays identical)
   ------------------------------------------------------------ */
function part(S, x, y, vx, vy, life, r, color) {
  if (S.particles.length > GFX.partCap) return;
  S.particles.push({ x, y, vx, vy, life, max: life, r, color });
}
function popText(S, x, y, str, color) {
  S.particles.push({ x, y, vx: 0, vy: -38, life: 1.15, max: 1.15, str, color, text: true });
}
function bloodBurst(S, x, y, n, scale) {
  const rnd2 = (a, b) => a + S.rng() * (b - a);
  for (let i = 0; i < n; i++) {
    part(S, x + rnd2(-6, 6) * scale, y + rnd2(-6, 6) * scale,
      rnd2(-150, 150) * scale, rnd2(-150, 150) * scale,
      rnd2(0.25, 0.8), rnd2(1.4, 3.8) * scale,
      S.rng() < 0.7 ? '#8e1f1a' : '#4d0f0c');
  }
}
function addToast(S, text, color) {
  S.toasts.push({ text, color: color || '#cfe3c6', life: 2.4, max: 2.4 });
  if (S.toasts.length > 3) S.toasts.shift();
}

/* ------------------------------------------------------------
   weapons / player actions
   ------------------------------------------------------------ */
function curW(p) { return p ? p.arsenal[p.cur] : null; }
function curDef(p) { const w = curW(p); return w ? WEAPONS[w.id] : WEAPONS.pistol; }

function switchWeapon(p, idx) {
  if (!p) return;
  if (idx < 0 || idx >= p.arsenal.length || idx === p.cur) return;
  p.cur = idx; p.reloading = 0; p.reloadTotal = 0; p.muzzle = 0;
  p.fireCd = Math.max(p.fireCd, 0.16);
}
function tryReload(S, p) {
  if (!p || S.mode !== 'playing') return;
  const w = curW(p), def = WEAPONS[w.id];
  if (p.reloading > 0 || w.mag >= def.mag || w.reserve <= 0) return;
  p.reloadTotal = def.reload; p.reloading = def.reload;
}
function finishReload(p) {
  const w = curW(p), def = WEAPONS[w.id];
  const take = Math.min(def.mag - w.mag, w.reserve);
  w.mag += take; w.reserve -= take;
  p.reloading = 0; p.reloadTotal = 0;
}
function tryShoot(S, p) {
  if (S.mode !== 'playing' || p.fireCd > 0 || p.reloading > 0 || !p.alive) return;
  const w = curW(p), def = WEAPONS[w.id];
  if (w.mag <= 0) { tryReload(S, p); return; }
  if (def.thrown) {
    throwGrenade(S, p, def.thrown);
    w.mag--; p.fireCd = def.cd; p.muzzle = 0.02;
    S.shake = Math.min(S.shake + 0.8, 9);
    if (w.mag === 0) tryReload(S, p);
    return;
  }
  const rnd2 = (a, b) => a + S.rng() * (b - a);
  for (let i = 0; i < def.pellets; i++) {
    const a = p.angle + rnd2(-def.spread, def.spread);
    const sp = def.speed * (def.pellets > 1 ? rnd2(0.92, 1.06) : 1);
    const bx = p.x + Math.cos(a) * 20, by = p.y + Math.sin(a) * 20;
    S.bullets.push({ id: S.nextId++, owner: p.id, x: bx, y: by, px: bx, py: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: def.life, dmg: def.dmg });
  }
  w.mag--; p.fireCd = def.cd; p.muzzle = 0.055;
  S.shake = Math.min(S.shake + def.shake, 9);
  if (w.mag === 0) tryReload(S, p);
}
function throwGrenade(S, p, kind) {
  const a = p.angle;
  S.grenades.push({
    kind: kind || 'smoke',
    x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20,
    vx: Math.cos(a) * 540, vy: Math.sin(a) * 540,
    fuse: 1.05, spin: 0, t: 0
  });
}
function makeSmoke(S, x, y) {
  S.smokes.push({ x, y, r: 178, life: 5.2, max: 5.2, puffs: [] });
  S.shake = Math.max(S.shake, 1.2);
}
function addAmmo(p) {
  let gained = false;
  for (const w of p.arsenal) {
    const def = WEAPONS[w.id];
    if (w.reserve < def.maxReserve) {
      w.reserve = Math.min(def.maxReserve, w.reserve + def.box);
      gained = true;
    }
  }
  return gained;
}
function giveWeapon(S, p, id, x, y) {
  const def = WEAPONS[id];
  const owned = p.arsenal.find(w => w.id === id);
  if (owned) {
    owned.reserve = Math.min(def.maxReserve, owned.reserve + def.box);
    popText(S, x, y, '+' + def.box + ' ' + def.name, '#e2c766');
    return;
  }
  p.arsenal.push({ id, mag: def.mag, reserve: def.box * 2 });
  addToast(S, def.name + ' FOUND', '#8ad9e8');
  switchWeapon(p, p.arsenal.length - 1);
}
function useMedkit(S, p) {
  if (!p || S.mode !== 'playing' || !p.alive) return;
  if (p.medkits > 0 && p.hp < p.maxHp) {
    p.medkits--;
    p.hp = Math.min(p.maxHp, p.hp + 45);
    popText(S, p.x, p.y - 18, '+45', '#9fe08a');
  }
}
function damagePlayer(S, p, amount, z) {
  if (p.invuln > 0 || S.mode !== 'playing' || !p.alive) return;
  p.invuln = 0.35;
  p.hp -= amount;
  S.damageFlash = 1;
  S.shake = Math.max(S.shake, 7);
  const dx = p.x - z.x, dy = p.y - z.y, d = Math.hypot(dx, dy) || 1;
  p.x += dx / d * 9; p.y += dy / d * 9;
  collideWorld(S.world, p, 2);
  bloodBurst(S, p.x, p.y, 8, 0.9);
  if (p.hp <= 0) { p.hp = 0; p.alive = false; }
  if (S.players.every(q => !q.alive)) S.mode = 'dead';
}

/* ------------------------------------------------------------
   zombies
   ------------------------------------------------------------ */
function pickType(S) {
  const w = S.wave;
  const bruteChance = Math.min(0.04 + w * 0.018, 0.28);
  const runnerChance = Math.min(0.12 + w * 0.030 + S.darkness * 0.10, 0.55);
  const r = S.rng();
  if (r < bruteChance) return 2;
  if (r < bruteChance + runnerChance) return 1;
  return 0;
}
function spawnZombie(S, p) {
  const rnd2 = (a, b) => a + S.rng() * (b - a);
  const ring = Math.max(900, Math.hypot(1600, 900) * 0.55) + 40;
  for (let i = 0; i < 30; i++) {
    const a = S.rng() * TAU;
    const rad = ring + S.rng() * 280;
    let x = p.x + Math.cos(a) * rad;
    let y = p.y + Math.sin(a) * rad;
    x = clamp(x, 60, WORLD.w - 60);
    y = clamp(y, 60, WORLD.h - 60);
    if (isBlocked(S.world, x, y, 22)) continue;
    const type = pickType(S);
    const base = ZTYPE[type];
    const hpMul = 1 + (S.wave - 1) * 0.15;
    S.zombies.push({
      id: S.nextId++, type, x, y, r: base.r,
      hp: base.hp * hpMul, maxHp: base.hp * hpMul,
      speed: base.speed * (1 + Math.min(0.35, (S.wave - 1) * 0.018)) * rnd2(0.92, 1.08),
      dmg: base.dmg * (1 + (S.wave - 1) * 0.06),
      angle: S.rng() * TAU, bob: S.rng() * TAU,
      flash: 0, atkCd: S.rng() * 0.3, dead: false
    });
    return;
  }
}
function spawnBoss(S, p) {
  const rnd2 = (a, b) => a + S.rng() * (b - a);
  const ring = Math.max(820, Math.hypot(1600, 900) * 0.52) + 40;
  for (let i = 0; i < 40; i++) {
    const a = S.rng() * TAU, rad = ring + rnd2(0, 240);
    const x = clamp(p.x + Math.cos(a) * rad, 140, WORLD.w - 140);
    const y = clamp(p.y + Math.sin(a) * rad, 140, WORLD.h - 140);
    if (isBlocked(S.world, x, y, 44)) continue;
    let cx = null, cy = null;
    for (let k = 0; k < 30; k++) {
      const ca = S.rng() * TAU, cd = rnd2(70, 120);
      const tx = clamp(x + Math.cos(ca) * cd, 140, WORLD.w - 140);
      const ty = clamp(y + Math.sin(ca) * cd, 140, WORLD.h - 140);
      if (!isBlocked(S.world, tx, ty, 32)) { cx = tx; cy = ty; break; }
    }
    if (cx === null) continue;
    const wave = S.wave;
    const hp = 1100 * (1 + (wave - 1) * 0.22);
    const cache = { id: ++S.bossSeq, x: cx, y: cy, locked: true, taken: false, msgCd: 0 };
    S.bossCaches.push(cache);
    S.zombies.push({
      id: S.nextId++, type: 2, boss: true, cacheId: cache.id, bossWave: wave,
      x, y, r: 36, hp, maxHp: hp,
      speed: 62 * (1 + Math.min(0.25, (wave - 1) * 0.012)),
      dmg: 30 * (1 + (wave - 1) * 0.05),
      angle: S.rng() * TAU, bob: S.rng() * TAU,
      flash: 0, atkCd: 1, dead: false
    });
    addToast(S, 'ABOMINATION — GUARDING SUPPLIES', '#e0705a');
    return;
  }
  for (let i = 0; i < 4; i++) spawnZombie(S, p);
}
function hitZombie(S, z, dmg, vx, vy) {
  z.hp -= dmg;
  z.flash = 0.09;
  const inv = 1 / (Math.hypot(vx, vy) || 1);
  const kb = z.boss ? 0.4 : 2.2;
  z.x += vx * inv * kb; z.y += vy * inv * kb;
  bloodBurst(S, z.x, z.y, 6, 0.8);
  if (z.hp <= 0) killZombie(S, z);
}
function killZombie(S, z) {
  if (z.dead) return;
  z.dead = true;
  S.kills++;
  S.decals.push({ x: z.x, y: z.y, r: z.r * (1.2 + S.rng() * 0.6), rot: S.rng() * TAU, alpha: 0.34 });
  if (S.decals.length > GFX.decalCap) S.decals.shift();
  bloodBurst(S, z.x, z.y, 14, 1.15);
  if (z.boss) {
    S.shake = Math.max(S.shake, 12);
    const cache = S.bossCaches.find(c => c.id === z.cacheId);
    if (cache && !cache.taken) cache.locked = false;
    addToast(S, 'ABOMINATION DOWN — CACHE UNLOCKED', '#f0d78a');
    dropPickup(S, z.x, z.y, 'medkit');
    dropPickup(S, z.x + 40, z.y, 'ammo');
  } else {
    if (S.rng() < 0.16) dropPickup(S, z.x, z.y, 'ammo');
    else if (S.rng() < 0.05) dropPickup(S, z.x, z.y, 'medkit');
  }
  S.shake = Math.max(S.shake, 1.4);
}
function dropPickup(S, x, y, type) {
  if (isBlocked(S.world, x, y, 8)) return;
  S.pickups.push({ id: S.nextId++, x, y, type, life: 45, bob: S.rng() * TAU });
}

function nearestPlayer(S, x, y) {
  let best = null, bd = Infinity;
  for (const p of S.players) {
    if (!p.alive) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { p: best, d: bd } : null;
}

function updateZombies(S, dt) {
  const rnd2 = (a, b) => a + S.rng() * (b - a);
  for (const z of S.zombies) {
    if (z.dead) continue;
    const near = nearestPlayer(S, z.x, z.y);
    if (!near) continue;
    const p = near.p;
    const d = near.d || 1;

    let playerHidden = false;
    for (const sm of S.smokes) {
      if (Math.hypot(p.x - sm.x, p.y - sm.y) < sm.r) { playerHidden = true; break; }
    }

    z.flash = Math.max(0, z.flash - dt);
    z.atkCd = Math.max(0, z.atkCd - dt);
    z.bob += dt * (0.5 + z.speed * 0.09);
    if (z.wander === undefined) z.wander = S.rng() * TAU;

    let inSmoke = false;
    for (const sm of S.smokes) {
      if (Math.hypot(z.x - sm.x, z.y - sm.y) < sm.r + z.r * 0.5) { inSmoke = true; break; }
    }
    const blind = inSmoke || (z.boss && playerHidden);
    z.lostCd = Math.max(0, (z.lostCd || 0) - dt);
    z.blind = blind;

    const faceA = blind && z.boss ? z.wander : Math.atan2(p.y - z.y, p.x - z.x);
    let da = faceA - z.angle;
    da = ((da + Math.PI) % TAU + TAU) % TAU - Math.PI;
    z.angle += da * Math.min(1, dt * (blind ? 3 : 8));

    let sx = 0, sy = 0;
    for (const o of S.zombies) {
      if (o === z || o.dead) continue;
      const ox = z.x - o.x, oy = z.y - o.y;
      const dd = ox * ox + oy * oy;
      const minD = (z.r + o.r) * 0.95;
      if (dd < minD * minD && dd > 0.0001) {
        const dl = Math.sqrt(dd);
        sx += ox / dl; sy += oy / dl;
      }
    }
    let tx = (p.x - z.x) / d, ty = (p.y - z.y) / d;
    if (blind) {
      z.wander += (S.rng() - 0.5) * dt * 3.4;
      tx = Math.cos(z.wander); ty = Math.sin(z.wander);
    }
    let vx = tx + sx * 0.9, vy = ty + sy * 0.9;
    const vl = Math.hypot(vx, vy) || 1;
    vx /= vl; vy /= vl;

    if (inSmoke && !z.boss) {
      const wob = Math.sin(S.time * 2.6 + z.bob * 1.7) * 1.15;
      const ca = Math.cos(wob), sa = Math.sin(wob);
      const nx = vx * ca - vy * sa, ny = vx * sa + vy * ca;
      vx = nx; vy = ny;
    }
    const hunting = z.boss ? (d > 600 ? 1.8 : 1) : (d > 1000 ? 1.5 : 1);
    let sp = z.speed * hunting * (1 + S.darkness * 0.15);
    if (inSmoke) sp *= 0.42;
    if (blind && z.boss) sp *= 0.5;
    z.x += vx * sp * dt; z.y += vy * sp * dt;
    z.x = clamp(z.x, z.r + 4, WORLD.w - z.r - 4);
    z.y = clamp(z.y, z.r + 4, WORLD.h - z.r - 4);
    collideWorld(S.world, z, 1);

    if (d < z.r + p.r + 5 && z.atkCd <= 0) {
      z.atkCd = 0.85;
      damagePlayer(S, p, z.dmg, z);
    }
    if (d > 3000 && !z.boss) z.dead = true;
  }
  S.zombies = S.zombies.filter(z => !z.dead);
}

function updateSpawner(S, dt) {
  S.waveTimer -= dt;
  if (S.waveTimer <= 0) {
    S.wave++;
    S.waveTimer = WAVE_DUR;
    addToast(S, 'WAVE ' + S.wave, S.wave % 5 === 0 ? '#e0705a' : '#cfe3c6');
    if (S.wave % 5 === 0 && !S.zombies.some(z => z.boss)) {
      const anchor = S.players.find(p => p.alive) || S.players[0];
      spawnBoss(S, anchor);
    }
    const burst = Math.min(3 + S.wave * 2, 16);
    for (let i = 0; i < burst; i++) {
      const anchor = S.players.find(p => p.alive) || S.players[0];
      spawnZombie(S, anchor);
    }
    S.shake = Math.max(S.shake, 3);
  }
  const target = Math.min(Math.floor((9 + S.wave * 4) * (1 + S.darkness * 0.3)), 56);
  S.spawnTimer -= dt;
  if (S.spawnTimer <= 0 && S.zombies.length < target && S.zombies.length < MAX_Z) {
    const anchor = S.players.find(p => p.alive) || S.players[0];
    spawnZombie(S, anchor);
    S.spawnTimer = Math.max(0.18, (1.0 - S.wave * 0.06) * (1 - S.darkness * 0.25));
  }
}

/* ------------------------------------------------------------
   bullets / grenades / pickups / particles
   ------------------------------------------------------------ */
function updateBullets(S, dt) {
  for (const b of S.bullets) {
    b.px = b.x; b.py = b.y;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;
    let gone = false;
    for (const z of S.zombies) {
      if (z.dead) continue;
      if (segCircle(b.px, b.py, b.x, b.y, z.x, z.y, z.r + 2)) {
        hitZombie(S, z, b.dmg, b.vx, b.vy);
        gone = true;
        break;
      }
    }
    if (gone) { b.life = 0; continue; }
    if (isBlocked(S.world, b.x, b.y, 2) || isBlocked(S.world, b.px, b.py, 2)) b.life = 0;
  }
  S.bullets = S.bullets.filter(b => b.life > 0);
}

function updateGrenades(S, dt) {
  for (const g of S.grenades) {
    g.t += dt;
    g.fuse -= dt;
    const drag = Math.pow(0.02, dt);
    g.vx *= drag; g.vy *= drag;
    g.x += g.vx * dt; g.y += g.vy * dt;
    g.spin += dt * 9;
    if (isBlocked(S.world, g.x, g.y, 4)) { g.vx *= -0.2; g.vy *= -0.2; }
    if (g.fuse <= 0) {
      if (g.kind === 'frag') explodeFrag(S, g.x, g.y);
      else makeSmoke(S, g.x, g.y);
    }
  }
  S.grenades = S.grenades.filter(g => g.fuse > 0);
  for (const s of S.smokes) s.life -= dt;
  S.smokes = S.smokes.filter(s => s.life > 0);
}

function explodeFrag(S, x, y) {
  const R = 190;
  S.shake = Math.max(S.shake, 11);
  S.decals.push({ x, y, r: 46, rot: S.rng() * TAU, alpha: 0.4 });
  if (S.decals.length > GFX.decalCap) S.decals.shift();
  for (const z of S.zombies) {
    if (z.dead) continue;
    const dx = z.x - x, dy = z.y - y;
    const d = Math.hypot(dx, dy);
    if (d > R + z.r) continue;
    const f = 1 - Math.max(0, d - z.r) / R;
    const dmg = Math.round(42 + 96 * f);
    const nx = dx / (d || 1), ny = dy / (d || 1);
    hitZombie(S, z, dmg, nx * 260, ny * 260);
  }
  for (const p of S.players) {
    if (!p.alive) continue;
    const pd = Math.hypot(p.x - x, p.y - y);
    if (pd < R) {
      const f = 1 - pd / R;
      const selfDmg = Math.round(62 * Math.pow(f, 1.15));
      if (selfDmg > 0) damagePlayer(S, p, selfDmg, { x, y });
    }
  }
}

function updatePickups(S, dt) {
  for (const k of S.pickups) {
    k.life -= dt;
    k.bob += dt * 3;
    if (k.life <= 0) continue;
    for (const p of S.players) {
      if (!p.alive) continue;
      if (Math.hypot(p.x - k.x, p.y - k.y) < 30) {
        if (k.type === 'ammo') {
          if (addAmmo(p)) k.life = 0;
        } else if (p.medkits < 5) {
          p.medkits++;
          k.life = 0;
        }
      }
    }
  }
  S.pickups = S.pickups.filter(k => k.life > 0);

  for (const c of S.crates) {
    if (c.taken) continue;
    for (const p of S.players) {
      if (!p.alive) continue;
      if (Math.hypot(p.x - c.x, p.y - c.y) < 34) {
        if (c.type === 'ammo') {
          if (!addAmmo(p)) continue;
        } else {
          if (p.medkits >= 5) continue;
          p.medkits++;
        }
        c.taken = true;
        break;
      }
    }
  }

  for (const c of S.weaponCaches) {
    if (c.taken) continue;
    for (const p of S.players) {
      if (!p.alive) continue;
      if (Math.hypot(p.x - c.x, p.y - c.y) < 40) {
        c.taken = true;
        giveWeapon(S, p, c.id, c.x, c.y);
        break;
      }
    }
  }

  for (const c of S.bossCaches) {
    if (c.taken) continue;
    if (c.msgCd > 0) c.msgCd -= dt;
    for (const p of S.players) {
      if (!p.alive) continue;
      if (Math.hypot(p.x - c.x, p.y - c.y) < 48) {
        if (!c.locked) openBossCache(S, p, c);
        break;
      }
    }
  }
}

function openBossCache(S, p, c) {
  c.taken = true;
  for (const w of p.arsenal) {
    const def = WEAPONS[w.id];
    w.reserve = Math.min(def.maxReserve, w.reserve + def.box * 2);
  }
  p.medkits = Math.min(5, p.medkits + 2);
  if (!p.arsenal.some(w => w.id === 'rifle')) giveWeapon(S, p, 'rifle', c.x, c.y);
  else if (!p.arsenal.some(w => w.id === 'shotgun')) giveWeapon(S, p, 'shotgun', c.x, c.y);
  addToast(S, 'SUPPLIES SECURED', '#f0d78a');
  S.shake = Math.max(S.shake, 3);
}

function updateParticles(S, dt) {
  for (const q of S.particles) {
    q.life -= dt;
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.text) {
      q.vy *= Math.pow(0.2, dt);
    } else {
      const drag = Math.pow(0.0008, dt);
      q.vx *= drag; q.vy *= drag;
    }
  }
  S.particles = S.particles.filter(q => q.life > 0);
}

/* ------------------------------------------------------------
   one tick
   inputs: [{ id, mx, my, aim, fire, sprint, reload, medkit, flashlight, swap }]
   ------------------------------------------------------------ */
function step(S, dt, inputs) {
  if (S.mode !== 'playing') return S;
  S.time += dt;
  S.tick++;
  S.darkness = dayPhase(S.time).d;

  for (const input of inputs || []) {
    const p = S.players.find(q => q.id === input.id);
    if (!p || !p.alive) continue;

    let mx = input.mx || 0, my = input.my || 0;
    const ml = Math.hypot(mx, my);
    if (ml > 0) { mx /= ml; my /= ml; }
    const sprinting = !!input.sprint && ml > 0;
    const spd = p.baseSpeed * (sprinting ? p.sprintMul : 1);
    p.x += mx * spd * dt; p.y += my * spd * dt;
    if (ml > 0) p.walkPhase += dt * (sprinting ? 13 : 8);
    p.x = clamp(p.x, p.r + 6, WORLD.w - p.r - 6);
    p.y = clamp(p.y, p.r + 6, WORLD.h - p.r - 6);
    collideWorld(S.world, p, 2);

    if (typeof input.aim === 'number') p.angle = input.aim;

    p.fireCd = Math.max(0, p.fireCd - dt);
    p.muzzle = Math.max(0, p.muzzle - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    if (p.reloading > 0) {
      p.reloading -= dt;
      if (p.reloading <= 0) finishReload(p);
    }

    if (input.swap !== undefined && input.swap !== null) {
      const id = input.swap;
      const i = p.arsenal.findIndex(w => w.id === id);
      if (i >= 0) switchWeapon(p, i);
    }
    if (input.reload) tryReload(S, p);
    if (input.medkit) useMedkit(S, p);
    if (input.fire) tryShoot(S, p);
  }

  updateBullets(S, dt);
  updateGrenades(S, dt);
  updateZombies(S, dt);
  updatePickups(S, dt);
  updateParticles(S, dt);
  updateSpawner(S, dt);

  for (const t of S.toasts) t.life -= dt;
  S.toasts = S.toasts.filter(t => t.life > 0);

  S.shake *= Math.pow(0.02, dt);
  if (S.shake < 0.05) S.shake = 0;
  S.damageFlash = Math.max(0, S.damageFlash - dt * 1.6);

  if (S.players.every(p => !p.alive)) S.mode = 'dead';
  return S;
}

/* a stable summary of the state, for comparing two runs */
function checksum(S) {
  let h = 2166136261 >>> 0;
  const mix = v => {
    const x = Math.round(v * 1000) | 0;
    h = Math.imul(h ^ (x & 0xff), 16777619) >>> 0;
    h = Math.imul(h ^ ((x >> 8) & 0xff), 16777619) >>> 0;
    h = Math.imul(h ^ ((x >> 16) & 0xff), 16777619) >>> 0;
  };
  mix(S.wave); mix(S.time); mix(S.kills);
  for (const p of S.players) { mix(p.x); mix(p.y); mix(p.hp); mix(p.arsenal[p.cur].mag); }
  for (const z of S.zombies) { mix(z.x); mix(z.y); mix(z.hp); mix(z.type); }
  for (const b of S.bullets) { mix(b.x); mix(b.y); }
  return h >>> 0;
}

function summary(S) {
  return {
    time: +S.time.toFixed(2),
    wave: S.wave,
    kills: S.kills,
    hp: S.players.map(p => Math.round(p.hp)),
    alive: S.players.filter(p => p.alive).length,
    zombies: S.zombies.length,
    bullets: S.bullets.length,
    pickups: S.pickups.length,
    mode: S.mode,
    checksum: checksum(S)
  };
}

module.exports = {
  TAU, clamp, lerp, mulberry32, dayPhase, segCircle,
  WAVE_DUR, DAY_CYCLE, STEP, MAX_Z, WORLD, WEAPONS, ZTYPE,
  genWorld, createState, step, checksum, summary, newPlayer
};
