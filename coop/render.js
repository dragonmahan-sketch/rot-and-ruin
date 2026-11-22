/* ROT & RUIN — co-op renderer.
   Generated from the game's own drawing code by tools/build-render.py.
   Every drawing function below is copied verbatim from files/game/index.html,
   so the co-op client looks like the game. Do not hand-edit: change the game
   or the generator and rebuild. The game file is never modified.
*/
(function (global) {
'use strict';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* the map is generated from a fixed seed in the game, so the co-op client can
   rebuild exactly the same buildings, trees, rocks, cars and blood */
const buildings = [], trees = [], rocks = [], cars = [], worldDecals = [];
const obstacles = [];   // genWorld registers solid things here as it builds the map
const genRng = mulberry32(0xC0FFEE);
const gr = (a, b) => a + genRng() * (b - a);

let ctx = null, VW = 1, VH = 1, DPR = 1;
let clock = 0, view = null, self = null;
let grassPat = null, roadPat = null;
let lightCv = null, lightCtx = null;

const WORLD = { w: 5600, h: 5600 };
const ROAD_H = { x0: 0, x1: WORLD.w, y0: 2000, y1: 2245 };
const ROAD_V = { x0: 2900, x1: 3120, y0: 0, y1: WORLD.h };
const ROADS = [ROAD_H, ROAD_V];
const ZCOLORS = [
  { body: '#5f7a45', bodyDark: '#3a4f28', skin: '#7d8f5c' },
  { body: '#816542', bodyDark: '#523e24', skin: '#9c875f' },
  { body: '#74494a', bodyDark: '#472a2b', skin: '#8a615c' }
];

function rr(x, y, w, h, r){
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function inRoad(x, y){
  return (x > ROAD_H.x0 && x < ROAD_H.x1 && y > ROAD_H.y0 && y < ROAD_H.y1) ||
         (x > ROAD_V.x0 && x < ROAD_V.x1 && y > ROAD_V.y0 && y < ROAD_V.y1);
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh){
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function circleRect(cx, cy, r, rx, ry, rw, rh){
  const nx = clamp(cx, rx, rx + rw), ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

function overlapsRoad(x, y, w, h, m){
  m = m || 0;
  for(const r of ROADS){
    if(rectsOverlap(x - m, y - m, w + 2 * m, h + 2 * m, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0)) return true;
  }
  return false;
}

function genWorld(){
  const cx = WORLD.w / 2, cy = WORLD.h / 2;

  // buildings
  let guard = 0;
  while(buildings.length < 30 && guard++ < 2000){
    const w = gr(160, 380), h = gr(140, 300);
    const x = gr(160, WORLD.w - 160 - w), y = gr(160, WORLD.h - 160 - h);
    if(overlapsRoad(x, y, w, h, 60)) continue;
    if(circleRect(cx, cy, 430, x, y, w, h)) continue;
    if(buildings.some(b => rectsOverlap(x - 80, y - 80, w + 160, h + 160, b.x, b.y, b.w, b.h))) continue;
    const details = [];
    const n = 1 + Math.floor(genRng() * 3);
    for(let i = 0; i < n; i++){
      details.push({
        x: x + gr(18, Math.max(24, w - 80)),
        y: y + gr(18, Math.max(24, h - 76)),
        w: gr(22, 54), h: gr(18, 42)
      });
    }
    const b = { shape: 'rect', kind: 'building', x, y, w, h, details };
    buildings.push(b); obstacles.push(b);
  }

  // trees
  let tg = 0;
  while(trees.length < 560 && tg++ < 9000){
    const x = gr(70, WORLD.w - 70), y = gr(70, WORLD.h - 70);
    const r = gr(13, 25);
    if(inRoad(x, y)) continue;
    if(Math.hypot(x - cx, y - cy) < 330 + r) continue;
    if(buildings.some(b => circleRect(x, y, r + 26, b.x, b.y, b.w, b.h))) continue;
    if(trees.some(t => {
      const dx = x - t.x, dy = y - t.y;
      return dx * dx + dy * dy < (r + t.r + 14) * (r + t.r + 14);
    })) continue;
    const t = { shape: 'circle', kind: 'tree', x, y, r, seed: genRng() };
    trees.push(t); obstacles.push(t);
  }

  // rocks
  let rg = 0;
  while(rocks.length < 120 && rg++ < 3000){
    const x = gr(80, WORLD.w - 80), y = gr(80, WORLD.h - 80);
    const r = gr(9, 20);
    if(inRoad(x, y)) continue;
    if(Math.hypot(x - cx, y - cy) < 320 + r) continue;
    if(buildings.some(b => circleRect(x, y, r + 12, b.x, b.y, b.w, b.h))) continue;
    if(trees.some(t => {
      const dx = x - t.x, dy = y - t.y;
      return dx * dx + dy * dy < (r + t.r + 8) * (r + t.r + 8);
    })) continue;
    const o = { shape: 'circle', kind: 'rock', x, y, r, seed: genRng() };
    rocks.push(o); obstacles.push(o);
  }

  // wrecked cars along the roads
  const CAR_COLORS = ['#586470', '#6a5344', '#4c6252', '#5b4c60', '#6e6a58'];
  let cg = 0;
  while(cars.length < 18 && cg++ < 800){
    const horiz = genRng() < 0.5;
    let x, y, w, h;
    if(horiz){
      w = gr(52, 72); h = 28;
      x = gr(180, WORLD.w - 180 - w);
      y = gr(ROAD_H.y0 + 34, ROAD_H.y1 - 34 - h);
    } else {
      w = 28; h = gr(52, 72);
      x = gr(ROAD_V.x0 + 34, ROAD_V.x1 - 34 - w);
      y = gr(180, WORLD.h - 180 - h);
    }
    if(cars.some(c => rectsOverlap(x - 50, y - 50, w + 100, h + 100, c.x, c.y, c.w, c.h))) continue;
    const car = {
      shape: 'rect', kind: 'car', x, y, w, h,
      color: CAR_COLORS[Math.floor(genRng() * CAR_COLORS.length)],
      rust: genRng()
    };
    cars.push(car); obstacles.push(car);
  }

  // old blood
  for(let i = 0; i < 240; i++){
    const x = gr(100, WORLD.w - 100), y = gr(100, WORLD.h - 100);
    const r = gr(6, 26);
    if(buildings.some(b => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h)) continue;
    worldDecals.push({ x, y, r, rot: genRng() * TAU, alpha: 0.10 + genRng() * 0.16 });
  }
}

function scalePattern(pat, TEX){
  // More detail in the tile, same tile size on screen.
  if(!pat || TEX === 1 || !pat.setTransform || typeof DOMMatrix === 'undefined') return pat;
  try { pat.setTransform(new DOMMatrix([1 / TEX, 0, 0, 1 / TEX, 0, 0])); } catch(err){}
  return pat;
}

function makePatterns(){
  // Build textures at display resolution so the ground stays sharp on high-DPI screens.
  const TEX = Math.min(2, Math.max(1, Math.round(DPR)));
  const area = TEX * TEX;
  const S = 512 * TEX;
  const gc = document.createElement('canvas'); gc.width = gc.height = S;
  const g = gc.getContext('2d');
  g.fillStyle = '#22311d'; g.fillRect(0, 0, S, S);
  const r = mulberry32(7);
  for(let i = 0; i < 240 * area; i++){
    const x = r() * S, y = r() * S, rad = (10 + r() * 48) * TEX;
    const cr = 28 + Math.floor(r() * 18), cg2 = 50 + Math.floor(r() * 22), cb = 24 + Math.floor(r() * 14);
    g.fillStyle = 'rgba(' + cr + ',' + cg2 + ',' + cb + ',' + (0.20 + r() * 0.34).toFixed(3) + ')';
    g.beginPath(); g.ellipse(x, y, rad, rad * (0.5 + r() * 0.6), r() * Math.PI, 0, TAU); g.fill();
  }
  for(let i = 0; i < 1300 * area; i++){
    const x = r() * S, y = r() * S;
    g.fillStyle = r() < 0.5 ? 'rgba(126,168,86,0.13)' : 'rgba(10,18,8,0.22)';
    g.fillRect(x, y, (1 + r() * 2) * TEX, (2 + r() * 3) * TEX);
  }
  grassPat = scalePattern(ctx.createPattern(gc, 'repeat'), TEX);

  const A = 256 * TEX;
  const ac = document.createElement('canvas'); ac.width = ac.height = A;
  const a = ac.getContext('2d');
  a.fillStyle = '#26262a'; a.fillRect(0, 0, A, A);
  const r2 = mulberry32(11);
  for(let i = 0; i < 1100 * area; i++){
    const x = r2() * A, y = r2() * A, s = (1 + r2() * 2) * TEX;
    a.fillStyle = r2() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.20)';
    a.fillRect(x, y, s, s);
  }
  roadPat = scalePattern(ctx.createPattern(ac, 'repeat'), TEX);
}

function drawGround(v){
  ctx.fillStyle = grassPat;
  ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);

  ctx.fillStyle = roadPat;
  for(const r of ROADS){
    const x0 = Math.max(r.x0, v.x0), x1 = Math.min(r.x1, v.x1);
    const y0 = Math.max(r.y0, v.y0), y1 = Math.min(r.y1, v.y1);
    if(x1 > x0 && y1 > y0) ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  // dirt shoulders
  ctx.fillStyle = 'rgba(10,14,9,0.35)';
  ctx.fillRect(ROAD_H.x0, ROAD_H.y0 - 9, ROAD_H.x1 - ROAD_H.x0, 9);
  ctx.fillRect(ROAD_H.x0, ROAD_H.y1, ROAD_H.x1 - ROAD_H.x0, 9);
  ctx.fillRect(ROAD_V.x0 - 9, ROAD_V.y0, 9, ROAD_V.y1 - ROAD_V.y0);
  ctx.fillRect(ROAD_V.x1, ROAD_V.y0, 9, ROAD_V.y1 - ROAD_V.y0);

  // lane markings
  ctx.strokeStyle = 'rgba(205,190,120,0.32)';
  ctx.lineWidth = 5;
  ctx.setLineDash([40, 36]);
  ctx.beginPath();
  ctx.moveTo(Math.max(v.x0, ROAD_H.x0), (ROAD_H.y0 + ROAD_H.y1) / 2);
  ctx.lineTo(Math.min(v.x1, ROAD_H.x1), (ROAD_H.y0 + ROAD_H.y1) / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo((ROAD_V.x0 + ROAD_V.x1) / 2, Math.max(v.y0, ROAD_V.y0));
  ctx.lineTo((ROAD_V.x0 + ROAD_V.x1) / 2, Math.min(v.y1, ROAD_V.y1));
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawSplat(d){
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.rotate(d.rot);
  ctx.fillStyle = 'rgba(84,12,10,' + d.alpha + ')';
  ctx.beginPath(); ctx.ellipse(0, 0, d.r, d.r * 0.62, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(d.r * 0.85, d.r * 0.2, d.r * 0.22, d.r * 0.16, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawDecals(v){
  for(const d of worldDecals){
    if(d.x + d.r < v.x0 || d.x - d.r > v.x1 || d.y + d.r < v.y0 || d.y - d.r > v.y1) continue;
    drawSplat(d);
  }
  for(const d of view.decals){
    if(d.x + d.r < v.x0 || d.x - d.r > v.x1 || d.y + d.r < v.y0 || d.y - d.r > v.y1) continue;
    drawSplat(d);
  }
}

function drawObstacles(v){
  // buildings
  for(const b of buildings){
    if(b.x + b.w < v.x0 - 20 || b.x > v.x1 + 20 || b.y + b.h < v.y0 - 20 || b.y > v.y1 + 20) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    rr(b.x + 12, b.y + 16, b.w, b.h, 6); ctx.fill();
    ctx.fillStyle = '#202325';
    rr(b.x, b.y, b.w, b.h, 5); ctx.fill();
    ctx.fillStyle = '#2a2e30';
    rr(b.x + 7, b.y + 7, b.w - 14, b.h - 14, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(150,170,150,0.07)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 12, b.y + 12, b.w - 24, b.h - 24);
    for(const d of b.details){
      ctx.fillStyle = '#1a1d1e';
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.fillStyle = '#343a3b';
      ctx.fillRect(d.x + 2, d.y + 2, Math.max(0, d.w - 4), Math.max(0, d.h - 4));
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      for(let yy = d.y + 7; yy < d.y + d.h - 3; yy += 6){
        ctx.beginPath(); ctx.moveTo(d.x + 4, yy); ctx.lineTo(d.x + d.w - 4, yy); ctx.stroke();
      }
    }
    ctx.strokeStyle = '#0d0f0f';
    ctx.lineWidth = 3;
    rr(b.x, b.y, b.w, b.h, 5); ctx.stroke();
  }
  // cars
  for(const c of cars){
    if(c.x + c.w < v.x0 - 20 || c.x > v.x1 + 20 || c.y + c.h < v.y0 - 20 || c.y > v.y1 + 20) continue;
    const cxp = c.x + c.w / 2, cyp = c.y + c.h / 2;
    ctx.save();
    ctx.translate(cxp, cyp);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    rr(-c.w / 2 + 4, -c.h / 2 + 6, c.w, c.h, 6); ctx.fill();
    ctx.fillStyle = c.color;
    rr(-c.w / 2, -c.h / 2, c.w, c.h, 6); ctx.fill();
    ctx.fillStyle = 'rgba(160,200,210,0.16)';
    if(c.w > c.h) ctx.fillRect(-c.w / 2 + 11, -c.h / 2 + 4, c.w * 0.26, c.h - 8);
    else ctx.fillRect(-c.w / 2 + 4, -c.h / 2 + 11, c.w - 8, c.h * 0.26);
    ctx.fillStyle = 'rgba(80,45,28,0.35)';
    if(c.w > c.h){
      ctx.fillRect(-c.w / 2 + c.w * 0.6, -c.h / 2 + 4, 8, c.h - 8);
    } else {
      ctx.fillRect(-c.w / 2 + 4, -c.h / 2 + c.h * 0.6, c.w - 8, 8);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 2;
    rr(-c.w / 2, -c.h / 2, c.w, c.h, 6); ctx.stroke();
    ctx.restore();
  }
  // trees
  for(const t of trees){
    if(t.x + t.r * 2 < v.x0 || t.x - t.r * 2 > v.x1 || t.y + t.r * 2 < v.y0 || t.y - t.r * 2 > v.y1) continue;
    const r = t.r;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(t.x + 8, t.y + 10, r * 1.02, r * 0.78, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a2a15';
    ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#22371b';
    ctx.beginPath(); ctx.arc(t.x - r * 0.34, t.y - r * 0.16, r * 0.64, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(t.x + r * 0.32, t.y + r * 0.18, r * 0.58, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2c4522';
    ctx.beginPath(); ctx.arc(t.x - r * 0.32, t.y - r * 0.32, r * 0.42, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(155,205,120,0.13)';
    ctx.beginPath(); ctx.arc(t.x - r * 0.38, t.y - r * 0.38, r * 0.2, 0, TAU); ctx.fill();
  }
  // rocks
  for(const o of rocks){
    if(o.x + o.r < v.x0 || o.x - o.r > v.x1 || o.y + o.r < v.y0 || o.y - o.r > v.y1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(o.x + 4, o.y + 5, o.r, o.r * 0.72, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a3d3a';
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4b4f4a';
    ctx.beginPath(); ctx.arc(o.x - o.r * 0.24, o.y - o.r * 0.26, o.r * 0.6, 0, TAU); ctx.fill();
  }
}

function drawPickups(v){
  for(const k of view.pickups){
    if(k.life <= 0) continue;
    if(k.x + 24 < v.x0 || k.x - 24 > v.x1 || k.y + 24 < v.y0 || k.y - 24 > v.y1) continue;
    const bob = Math.sin(k.bob) * 2;
    const fade = k.life < 6 ? (0.35 + 0.65 * Math.abs(Math.sin(k.life * 8))) : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(k.x, k.y + bob);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(2, 7 - bob, 10, 4, 0, 0, TAU); ctx.fill();
    if(k.type === 'ammo'){
      ctx.fillStyle = '#4f5a32';
      rr(-9, -8, 18, 15, 2); ctx.fill();
      ctx.fillStyle = '#d9b25a';
      for(let i = 0; i < 3; i++) ctx.fillRect(-6 + i * 5, -6, 2.5, 11);
      ctx.strokeStyle = '#252a17'; ctx.lineWidth = 1.5;
      rr(-9, -8, 18, 15, 2); ctx.stroke();
    } else {
      ctx.fillStyle = '#dfe7e0';
      rr(-8, -8, 16, 16, 2); ctx.fill();
      ctx.fillStyle = '#b8392f';
      ctx.fillRect(-2, -6, 4, 12);
      ctx.fillRect(-6, -2, 12, 4);
      ctx.strokeStyle = '#8b9a8c'; ctx.lineWidth = 1.5;
      rr(-8, -8, 16, 16, 2); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawZombies(v){
  for(const z of view.zombies){
    const pad = z.boss ? 90 : 60;
    if(z.x + pad < v.x0 || z.x - pad > v.x1 || z.y + pad < v.y0 || z.y - pad > v.y1) continue;
    if(z.boss){ drawBoss(z); continue; }
    const col = ZCOLORS[z.type];
    const bob = Math.sin(z.bob) * 1.5;
    ctx.save();
    ctx.translate(z.x, z.y + bob);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.ellipse(3, z.r * 0.7, z.r * 0.9, z.r * 0.55, 0, 0, TAU); ctx.fill();
    ctx.rotate(z.angle);
    const flash = z.flash > 0;
    ctx.fillStyle = flash ? '#ffdede' : col.skin;
    ctx.beginPath(); ctx.arc(z.r * 0.78, -z.r * 0.72, z.r * 0.26, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.78, z.r * 0.72, z.r * 0.26, 0, TAU); ctx.fill();
    ctx.fillStyle = flash ? '#ffecec' : col.body;
    ctx.beginPath(); ctx.arc(0, 0, z.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = flash ? '#ffffff' : col.bodyDark;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = flash ? '#ffffff' : col.skin;
    ctx.beginPath(); ctx.arc(z.r * 0.38, 0, z.r * 0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c0342c';
    ctx.beginPath(); ctx.arc(z.r * 0.72, -z.r * 0.18, 1.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.72, z.r * 0.18, 1.6, 0, TAU); ctx.fill();
    ctx.restore();

    if(z.hp < z.maxHp){
      const w = z.r * 2.1, hx = z.x - w / 2, hy = z.y - z.r - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(hx, hy, w, 4);
      ctx.fillStyle = '#b8392f';
      ctx.fillRect(hx, hy, w * Math.max(0, z.hp / z.maxHp), 4);
    }
  }
}

function drawBoss(z){
  const bob = Math.sin(z.bob) * 1.2;
  ctx.save();
  ctx.translate(z.x, z.y + bob);
  ctx.fillStyle = 'rgba(180,40,30,' + (0.07 + 0.05 * Math.sin(clock * 2.5)).toFixed(3) + ')';
  ctx.beginPath(); ctx.arc(0, 0, z.r * 2.1, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.ellipse(5, z.r * 0.7, z.r, z.r * 0.55, 0, 0, TAU); ctx.fill();
  ctx.rotate(z.angle);
  const flash = z.flash > 0;
  ctx.fillStyle = flash ? '#ffdede' : '#8a615c';
  ctx.beginPath(); ctx.arc(z.r * 0.85, -z.r * 0.78, z.r * 0.24, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(z.r * 0.85, z.r * 0.78, z.r * 0.24, 0, TAU); ctx.fill();
  ctx.fillStyle = flash ? '#ffecec' : '#5e3333';
  ctx.beginPath(); ctx.arc(0, 0, z.r, 0, TAU); ctx.fill();
  ctx.strokeStyle = flash ? '#ffffff' : '#2f1616';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#c9b79a';
  for(let i = 0; i < 8; i++){
    ctx.save();
    ctx.rotate(i / 8 * TAU);
    ctx.beginPath();
    ctx.moveTo(z.r * 0.72, 0);
    ctx.lineTo(z.r * 1.28, 4.5);
    ctx.lineTo(z.r * 1.28, -4.5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = flash ? '#ffffff' : '#8b6a5a';
  ctx.beginPath(); ctx.arc(z.r * 0.42, 0, z.r * 0.52, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2b1414';
  ctx.fillRect(z.r * 0.6, -6, z.r * 0.3, 12);
  ctx.fillStyle = '#ff5a3c';
  ctx.beginPath(); ctx.arc(z.r * 0.78, -z.r * 0.2, 3.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(z.r * 0.78, z.r * 0.2, 3.2, 0, TAU); ctx.fill();
  ctx.restore();

  const w = z.r * 2.4, hx = z.x - w / 2, hy = z.y - z.r - 18;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(hx, hy, w, 6);
  ctx.fillStyle = '#d94339';
  ctx.fillRect(hx, hy, w * Math.max(0, z.hp / z.maxHp), 6);
}

function drawBossCaches(v){
  for(const c of view.bossCaches){
    if(c.taken) continue;
    if(c.x + 60 < v.x0 || c.x - 60 > v.x1 || c.y + 60 < v.y0 || c.y - 60 > v.y1) continue;
    const pulse = 0.5 + 0.5 * Math.sin(clock * 3 + c.x * 0.01);
    const col = c.locked ? '192,70,48' : '240,215,120';
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.fillStyle = 'rgba(' + col + ',' + (0.08 + 0.10 * pulse).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(0, 0, 52, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    rr(-20, -8, 50, 42, 4); ctx.fill();
    ctx.fillStyle = '#4b3d26';
    rr(-26, -20, 52, 40, 4); ctx.fill();
    ctx.strokeStyle = c.locked ? '#7a3a2a' : '#a98b4a';
    ctx.lineWidth = 3;
    rr(-26, -20, 52, 40, 4); ctx.stroke();
    ctx.strokeStyle = c.locked ? '#8a4a34' : '#c9a75c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-26, -8); ctx.lineTo(26, -8);
    ctx.moveTo(-26, 8); ctx.lineTo(26, 8);
    ctx.stroke();
    if(c.locked){
      ctx.fillStyle = '#d9b25a';
      rr(-6, -2, 12, 12, 2); ctx.fill();
      ctx.strokeStyle = '#d9b25a';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, -2, 5, Math.PI, 0); ctx.stroke();
    } else {
      ctx.fillStyle = '#f4e6a6';
      ctx.fillRect(-10, -18, 20, 3);
      ctx.fillStyle = 'rgba(255,240,170,' + (0.3 + 0.5 * pulse).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(0, -24, 4, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

function drawSurvivor(p){
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath(); ctx.ellipse(3, 6, p.r * 0.95, p.r * 0.62, 0, 0, TAU); ctx.fill();
  ctx.rotate(p.angle);
  const step = Math.sin(p.walkPhase) * 2;
  ctx.fillStyle = '#28323a';
  ctx.beginPath(); ctx.ellipse(-1, -7 + step * 0.5, 6, 4.4, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-1, 7 - step * 0.5, 6, 4.4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = (p.invuln > 0 && Math.floor(clock * 24) % 2) ? '#c99087' : '#37525f';
  ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#1b282f';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#2a3b25';
  rr(-p.r * 0.95, -6, 7, 12, 2); ctx.fill();
  ctx.fillStyle = '#15181a';
  ctx.fillRect(6, -2.5, 22, 5);
  ctx.fillStyle = '#242a2b';
  ctx.fillRect(10, 1.5, 6, 6);
  ctx.fillStyle = '#37525f';
  ctx.beginPath(); ctx.arc(12, -5, 4.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(12, 5, 4.2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e2bf98';
  ctx.beginPath(); ctx.arc(4, 0, 7, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3b2f22';
  ctx.beginPath(); ctx.arc(1.5, 0, 5.4, Math.PI * 0.25, Math.PI * 1.75); ctx.fill();
  if(p.muzzle > 0){
    ctx.fillStyle = 'rgba(255,232,150,' + (p.muzzle / 0.055 * 0.9).toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(28, -4.5); ctx.lineTo(44, 0); ctx.lineTo(28, 4.5);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawBullets(){
  ctx.lineCap = 'round';
  for(const b of view.bullets){
    const tx = b.px, ty = b.py;
    ctx.strokeStyle = 'rgba(255,224,150,0.9)';
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

function drawNight(camX, camY){
  const d = view.dark;
  if(!lightCv){
    lightCv = document.createElement('canvas');
    lightCtx = lightCv.getContext('2d');
  }
  const w = Math.max(1, Math.floor(VW * DPR));
  const h = Math.max(1, Math.floor(VH * DPR));
  if(lightCv.width !== w || lightCv.height !== h){
    lightCv.width = w; lightCv.height = h;
  }
  const g = lightCtx;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.clearRect(0, 0, VW, VH);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgba(3,7,14,' + (0.88 * d).toFixed(3) + ')';
  g.fillRect(0, 0, VW, VH);
  g.globalCompositeOperation = 'destination-out';

  const p = self;
  const px = p.x - camX, py = p.y - camY;

  const halo = g.createRadialGradient(px, py, 12, px, py, 175);
  halo.addColorStop(0, 'rgba(0,0,0,1)');
  halo.addColorStop(0.55, 'rgba(0,0,0,0.75)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = halo;
  g.beginPath(); g.arc(px, py, 175, 0, TAU); g.fill();

  if(view.light){
    const a = p.angle, len = 560;
    g.save();
    g.beginPath();
    g.moveTo(px, py);
    g.arc(px, py, len, a - 0.34, a + 0.34);
    g.closePath();
    g.clip();
    const beam = g.createRadialGradient(px, py, 26, px, py, len);
    beam.addColorStop(0, 'rgba(0,0,0,1)');
    beam.addColorStop(0.5, 'rgba(0,0,0,0.92)');
    beam.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = beam;
    g.fillRect(px - len, py - len, len * 2, len * 2);
    g.restore();

    g.save();
    g.beginPath();
    g.moveTo(px, py);
    g.arc(px, py, len * 0.8, a - 0.16, a + 0.16);
    g.closePath();
    g.clip();
    const core = g.createRadialGradient(px, py, 10, px, py, len * 0.8);
    core.addColorStop(0, 'rgba(0,0,0,0.9)');
    core.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = core;
    g.fillRect(px - len, py - len, len * 2, len * 2);
    g.restore();
  }

  if(p.muzzle > 0){
    const mx = px + Math.cos(p.angle) * 44;
    const my = py + Math.sin(p.angle) * 44;
    const flash = g.createRadialGradient(mx, my, 2, mx, my, 130);
    flash.addColorStop(0, 'rgba(0,0,0,1)');
    flash.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = flash;
    g.beginPath(); g.arc(mx, my, 130, 0, TAU); g.fill();
  }

  g.globalCompositeOperation = 'source-over';
  ctx.drawImage(lightCv, 0, 0, VW, VH);

  if(view.light){
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(p.angle);
    const lg = ctx.createLinearGradient(0, 0, 560, 0);
    lg.addColorStop(0, 'rgba(255,238,190,' + (0.09 * d).toFixed(3) + ')');
    lg.addColorStop(1, 'rgba(255,238,190,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 560, -0.30, 0.30);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function panel(x, y, w, h){
  ctx.fillStyle = 'rgba(6,10,6,0.55)';
  rr(x, y, w, h, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(143,212,106,0.14)';
  ctx.lineWidth = 1;
  rr(x, y, w, h, 6); ctx.stroke();
}
/* drawNight works in screen space from the camera; the game's version reads
   G.player, this one takes the local survivor */
function drawNightCam(camX, camY) {
  const savedSelf = self;
  drawNight(camX, camY);
  self = savedSelf;
}

/* the game's night pass is copied above; it already reads self/view through
   the substitutions applied at build time */


/* ---------- snapshot -> the shapes the copied draw code expects ---------- */

function adapt(snapshot, prev, now) {
  const flashIds = new Set(snapshot.flash || []);
  const zombies = (snapshot.zombies || []).map(z => ({
    id: z.id, x: z.x, y: z.y, r: z.r, type: z.ty,
    angle: z.a, bob: (z.id * 1.7) % TAU, hp: z.hp, maxHp: z.m,
    flash: flashIds.has(z.id) ? 0.08 : 0, boss: !!z.b
  }));
  const pickups = (snapshot.pickups || []).map(k => ({
    id: k.id, x: k.x, y: k.y, type: k.ty, life: 1, bob: (k.id * 2.3) % TAU
  }));
  const bossCaches = (snapshot.bossCaches || []).map(c => ({
    id: c.id, x: c.x, y: c.y, locked: c.locked, taken: false
  }));
  const bullets = (snapshot.bullets || []).map(b => ({
    id: b.id, x: b.x, y: b.y,
    px: b.px === undefined ? b.x : b.px,
    py: b.py === undefined ? b.y : b.py
  }));
  return {
    zombies, pickups, bossCaches, bullets,
    decals: snapshot.decals || [],
    dark: snapshot.dark || 0,
    light: true
  };
}

/* ---------- public API ---------- */

function init(canvas, opts) {
  opts = opts || {};
  ctx = canvas.getContext('2d');
  DPR = Math.min(opts.dprCap || 2, global.devicePixelRatio || 1);
  if (!buildings.length) {
    genWorld();
    genRng();
  }
  return api;
}

function resize(w, h) {
  VW = w; VH = h;
}

function draw(snapshot, selfId, cam, time) {
  if (!ctx || !snapshot) return;
  clock = time || clock + 0.016;
  self = (snapshot.players || []).find(p => p.id === selfId) || null;
  if (self) {
    self.r = 13;
    self.angle = self.a;
    self.muzzle = 0;
    self.invuln = 0;
    self.walkPhase = 0;
  }
  view = adapt(snapshot, null, clock);

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#0b100a';
  ctx.fillRect(0, 0, VW, VH);

  const camX = cam.x - VW / 2, camY = cam.y - VH / 2;
  const v = { x0: camX, y0: camY, x1: camX + VW, y1: camY + VH };

  ctx.save();
  ctx.translate(-camX, -camY);
  drawGround(v);
  drawDecals(v);
  drawBossCaches(v);
  drawObstacles(v);
  drawPickups(v);
  drawZombies(v);
  drawBullets();
  for (const p of snapshot.players) {
    if (!p.alive) continue;
    drawSurvivor({
      x: p.x, y: p.y, r: 13, angle: p.a, walkPhase: 0,
      invuln: 0, muzzle: 0
    });
  }
  ctx.restore();

  if (view.dark > 0.01 && self) {
    drawNightCam(camX, camY);
  }
}

const api = {
  init, resize, draw,
  world: { buildings, trees, rocks, cars, worldDecals, WORLD, ROADS },
  buildPatterns: function () { makePatterns(); },
  ready: false
};
global.RTRender = api;
})(typeof window !== 'undefined' ? window : globalThis);
