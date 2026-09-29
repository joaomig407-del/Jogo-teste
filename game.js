(() => {
'use strict';
const TOTAL_WAVES = 5, MAG = 12, HALF = 30, EYE = 1.7, PR = 0.45;
const $ = id => document.getElementById(id);

// ---------- Cena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fb4d9);
scene.fog = new THREE.Fog(0x8fb4d9, 25, 80);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 150);
camera.rotation.order = 'YXZ';
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xffffff, 0x556677, 0.75));
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(20, 40, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, far: 100 });
scene.add(sun);

// Chão com textura gerada por código
const fc = document.createElement('canvas'); fc.width = fc.height = 128;
const fg = fc.getContext('2d');
fg.fillStyle = '#4a5560'; fg.fillRect(0, 0, 128, 128);
fg.fillStyle = '#566270'; fg.fillRect(0, 0, 64, 64); fg.fillRect(64, 64, 64, 64);
fg.strokeStyle = '#39424b'; fg.strokeRect(0, 0, 128, 128);
const floorTex = new THREE.CanvasTexture(fc);
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
floorTex.repeat.set(HALF / 2, HALF / 2);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshLambertMaterial({ map: floorTex }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
scene.add(floor);

// Paredes e obstáculos (visual + colisão)
const colliders = [], wallMeshes = [];
function addBox(x, z, w, d, h, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, h / 2, z); m.castShadow = m.receiveShadow = true;
  scene.add(m); wallMeshes.push(m);
  colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
}
addBox(0, -HALF - 1, 64, 2, 6, 0x39444f);
addBox(0, HALF + 1, 64, 2, 6, 0x39444f);
addBox(-HALF - 1, 0, 2, 60, 6, 0x39444f);
addBox(HALF + 1, 0, 2, 60, 6, 0x39444f);
[[-12,-10,4,4,2.6,0x8a6d3b],[13,-14,5,3,2.6,0x8a6d3b],[0,-4,8,2,3,0x5d7a6b],[-18,6,3,8,3,0x5d7a6b],
 [18,4,3,8,3,0x5d7a6b],[-6,10,3,3,1.8,0x8a6d3b],[8,12,3,3,1.8,0x8a6d3b],[0,-20,10,2,3,0x5d7a6b],
 [-22,-22,4,4,2.6,0x8a6d3b],[22,-22,4,4,2.6,0x8a6d3b]].forEach(o => addBox(...o));
scene.updateMatrixWorld(true);

function resolve(p, r) {
  for (const b of colliders) {
    const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cz = Math.max(b.z0, Math.min(p.z, b.z1));
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
    else {
      const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bt = b.z1 - p.z, m = Math.min(l, rr, t, bt);
      if (m === l) p.x = b.x0 - r; else if (m === rr) p.x = b.x1 + r; else if (m === t) p.z = b.z0 - r; else p.z = b.z1 + r;
    }
  }
}

// ---------- Arma do jogador ----------
const gun = new THREE.Group();
const gunMat = new THREE.MeshLambertMaterial({ color: 0x22262b });
const gBody = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.5), gunMat);
const gBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), new THREE.MeshLambertMaterial({ color: 0x0f1114 }));
gBarrel.position.set(0, 0.03, -0.35);
const gGrip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.09), gunMat);
gGrip.position.set(0, -0.13, 0.12);
const flashMesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffdd66 }));
flashMesh.position.set(0, 0.03, -0.55); flashMesh.visible = false;
const flashLight = new THREE.PointLight(0xffcc66, 0, 8);
flashLight.position.set(0, 0.03, -0.7);
gun.add(gBody, gBarrel, gGrip, flashMesh, flashLight);
gun.position.set(0.24, -0.22, -0.5);
camera.add(gun);

// ---------- Estado ----------
const player = { pos: new THREE.Vector3(0, 0, 24), yaw: 0, pitch: 0, hp: 100, ammo: MAG, reserve: 96, cool: 0, reload: 0, bob: 0 };
const wave = { n: 0, queue: 0, spawnT: 0, done: false, nextT: 0, maxAlive: 4 };
let state = 'menu', score = 0, cd = 3, enemies = [], hurtA = 0, hitT = 0, flashT = 0, recoil = 0, lockReq = 0, menuYaw = 0, bannerTimer;
const keys = {}, mouse = { down: false }, fx = [];
const ray = new THREE.Raycaster(); ray.far = 100;
const losRay = new THREE.Raycaster();

// ---------- Sons (gerados por código) ----------
let ac = null;
function initAudio() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { ac = null; } }
function tone(f0, f1, dur, type, vol) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur);
}
function noise(dur, vol) {
  if (!ac) return;
  const n = (ac.sampleRate * dur) | 0, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ac.createBufferSource(), g = ac.createGain(); g.gain.value = vol;
  s.buffer = b; s.connect(g); g.connect(ac.destination); s.start();
}
const sfx = {
  shot() { noise(0.12, 0.35); tone(180, 50, 0.1, 'square', 0.15); },
  enemyShot() { noise(0.1, 0.12); tone(120, 50, 0.1, 'sawtooth', 0.06); },
  hit() { tone(900, 600, 0.05, 'square', 0.1); },
  kill() { tone(400, 100, 0.25, 'triangle', 0.2); },
  hurt() { tone(150, 60, 0.2, 'sawtooth', 0.25); },
  reload() { tone(300, 500, 0.08, 'square', 0.08); setTimeout(() => tone(500, 300, 0.08, 'square', 0.08), 1000); },
  wave() { tone(440, 880, 0.4, 'triangle', 0.15); }
};

// ---------- Efeitos ----------
function addFx(obj, t) { scene.add(obj); fx.push({ obj, t }); }
function tracer(a, b, color) {
  addFx(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color })), 0.07);
}
function spark(p) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffdd88 }));
  m.position.copy(p); addFx(m, 0.12);
}
function clearFx() { fx.forEach(f => { scene.remove(f.obj); f.obj.geometry.dispose(); f.obj.material.dispose(); }); fx.length = 0; }

// ---------- Inimigos ----------
const geo = { body: new THREE.BoxGeometry(0.8, 1.1, 0.5), legs: new THREE.BoxGeometry(0.7, 0.7, 0.4), head: new THREE.SphereGeometry(0.28, 12, 10), gun: new THREE.BoxGeometry(0.1, 0.1, 0.6) };
const mats = { legs: new THREE.MeshLambertMaterial({ color: 0x2c2c2c }), head: new THREE.MeshLambertMaterial({ color: 0xffcf9f }), gun: new THREE.MeshLambertMaterial({ color: 0x111111 }) };
const SPAWNS = [[-24,-24],[24,-24],[0,-26],[-26,0],[26,0],[-14,-18],[14,-18],[-24,14],[24,14]];

function spawnEnemy() {
  let opts = SPAWNS.filter(s => Math.hypot(s[0] - player.pos.x, s[1] - player.pos.z) > 14);
  if (!opts.length) opts = SPAWNS;
  const s = opts[(Math.random() * opts.length) | 0];
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xc0392b });
  const body = new THREE.Mesh(geo.body, bodyMat); body.position.y = 1.0;
  const legs = new THREE.Mesh(geo.legs, mats.legs); legs.position.y = 0.35;
  const head = new THREE.Mesh(geo.head, mats.head); head.position.y = 1.85;
  const eg = new THREE.Mesh(geo.gun, mats.gun); eg.position.set(0.35, 1.25, 0.45);
  [body, legs, head, eg].forEach(m => { m.castShadow = true; g.add(m); });
  g.position.set(s[0], 0, s[1]);
  const e = { g, bodyMat, hitMeshes: [body, legs, head], hp: 60 + 6 * (wave.n - 1), dead: false, deathT: 0, alert: false, age: 0,
    cool: 0.8 + Math.random(), speed: 2.8 + 0.25 * wave.n, strafe: 1, strafeT: 0, stuck: 0, detour: 0, detT: 0, flash: 0 };
  body.userData = { enemy: e, head: false }; legs.userData = { enemy: e, head: false }; head.userData = { enemy: e, head: true };
  scene.add(g); g.updateMatrixWorld(true);
  enemies.push(e);
}
const aliveCount = () => enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
function enemyMeshes() { const a = []; for (const e of enemies) if (!e.dead) a.push(...e.hitMeshes); return a; }

const _o = new THREE.Vector3(), _d = new THREE.Vector3();
function hasLOS(e) {
  _o.set(e.g.position.x, 1.6, e.g.position.z);
  _d.set(player.pos.x - _o.x, EYE - 1.6, player.pos.z - _o.z);
  const len = _d.length(); _d.normalize();
  losRay.set(_o, _d); losRay.far = len;
  return losRay.intersectObjects(wallMeshes, false).length === 0;
}

function enemyShoot(e, dist) {
  e.cool = Math.max(0.6, 1.5 - wave.n * 0.14) + Math.random() * 0.5;
  const from = e.g.localToWorld(new THREE.Vector3(0.35, 1.25, 0.7));
  const hit = Math.random() < Math.max(0.15, 0.6 - dist * 0.013 + wave.n * 0.03);
  const to = new THREE.Vector3(player.pos.x, EYE - 0.3, player.pos.z);
  if (!hit) { to.x += (Math.random() - 0.5) * 3; to.y += (Math.random() - 0.5) * 2; to.z += (Math.random() - 0.5) * 3; }
  tracer(from, to, 0xff5544); sfx.enemyShot();
  if (hit) hurt(5 + wave.n);
}

function updateEnemy(e, dt) {
  const p = e.g.position, dx = player.pos.x - p.x, dz = player.pos.z - p.z, dist = Math.hypot(dx, dz) || 0.001;
  e.age += dt;
  if (dist < 34 || e.age > 6) e.alert = true;
  if (e.flash > 0) { e.flash -= dt; if (e.flash <= 0) e.bodyMat.emissive.setHex(0); }
  e.g.rotation.y = Math.atan2(dx, dz);
  if (!e.alert) return;
  const los = hasLOS(e);
  let mx = 0, mz = 0;
  if (dist < 6) { mx = -dx / dist; mz = -dz / dist; }
  else if (!los || dist > 14) {
    const a = e.detT > 0 ? e.detour : 0, c = Math.cos(a), s = Math.sin(a);
    mx = (dx * c - dz * s) / dist; mz = (dx * s + dz * c) / dist;
  } else {
    e.strafeT -= dt;
    if (e.strafeT <= 0) { e.strafe = Math.random() < 0.5 ? -1 : 1; e.strafeT = 1 + Math.random() * 1.5; }
    mx = (-dz / dist) * e.strafe * 0.7; mz = (dx / dist) * e.strafe * 0.7;
  }
  e.detT -= dt;
  const bx = p.x, bz = p.z, st = e.speed * dt;
  p.x += mx * st; p.z += mz * st;
  for (const o of enemies) {
    if (o === e || o.dead) continue;
    const ox = p.x - o.g.position.x, oz = p.z - o.g.position.z, d = Math.hypot(ox, oz);
    if (d < 1 && d > 0.001) { p.x += (ox / d) * (1 - d) * 0.5; p.z += (oz / d) * (1 - d) * 0.5; }
  }
  resolve(p, 0.5);
  if ((mx || mz) && Math.hypot(p.x - bx, p.z - bz) < st * 0.4) {
    e.stuck += dt;
    if (e.stuck > 0.35) { e.detour = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.8); e.detT = 1.3; e.stuck = 0; }
  } else e.stuck = 0;
  e.cool -= dt;
  if (los && dist < 36 && e.cool <= 0) enemyShoot(e, dist);
}

function damageEnemy(e, dmg, head) {
  e.hp -= dmg; e.alert = true; e.flash = 0.1; e.bodyMat.emissive.setHex(0x888888); hitT = 0.15;
  if (e.hp <= 0) { e.dead = true; e.deathT = 0; score += 100 + (head ? 50 : 0); player.reserve = Math.min(120, player.reserve + 2); sfx.kill(); }
  else sfx.hit();
}

// ---------- Jogador: tiro, recarga, dano ----------
function shoot() {
  if (player.cool > 0 || player.reload > 0 || state !== 'playing') return;
  if (player.ammo <= 0) { startReload(); return; }
  player.ammo--; player.cool = 0.14; flashT = 0.05; recoil = 1; sfx.shot();
  for (const e of enemies) if (Math.hypot(e.g.position.x - player.pos.x, e.g.position.z - player.pos.z) < 45) e.alert = true;
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = ray.intersectObjects(wallMeshes.concat(enemyMeshes()), false);
  let end;
  if (hits.length) {
    const h = hits[0]; end = h.point;
    if (h.object.userData.enemy) damageEnemy(h.object.userData.enemy, h.object.userData.head ? 60 : 30, h.object.userData.head);
    else spark(h.point);
  } else end = ray.ray.at(60, new THREE.Vector3());
  const muzzle = new THREE.Vector3(); flashMesh.getWorldPosition(muzzle);
  tracer(muzzle, end, 0xffe08a);
  if (player.ammo === 0) startReload();
}
function startReload() {
  if (player.reload > 0 || player.ammo === MAG || player.reserve <= 0 || state !== 'playing') return;
  player.reload = 1.5; sfx.reload();
}
function hurt(d) {
  if (state !== 'playing') return;
  player.hp -= d; hurtA = 0.7; sfx.hurt();
  if (player.hp <= 0) { player.hp = 0; endGame(false); }
}

// ---------- Fluxo do jogo ----------
function showOverlay(id) {
  document.querySelectorAll('.overlay').forEach(o => o.classList.add('hidden'));
  if (id) $(id).classList.remove('hidden');
}
function banner(t) {
  const b = $('banner'); b.textContent = t; b.classList.add('show');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('show'), 1800);
}
function lock() {
  lockReq = performance.now();
  try { const r = renderer.domElement.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {}
}
function resetGame() {
  enemies.forEach(e => scene.remove(e.g)); enemies = []; clearFx();
  Object.assign(player, { hp: 100, ammo: MAG, reserve: 96, cool: 0, reload: 0, yaw: 0, pitch: 0, bob: 0 });
  player.pos.set(0, 0, 24);
  Object.assign(wave, { n: 0, queue: 0, done: false, nextT: 0 });
  score = 0; hurtA = 0; hitT = 0; mouse.down = false;
}
function startCountdown() {
  initAudio(); resetGame(); showOverlay(null);
  state = 'countdown'; cd = 3;
  $('hud').classList.remove('hidden'); $('countdown').classList.remove('hidden');
  lock();
}
function startWave(n) {
  wave.n = n; wave.queue = 3 + 2 * (n - 1); wave.spawnT = 0.5; wave.done = false; wave.maxAlive = Math.min(6, 3 + n);
  banner('ONDA ' + n + ' / ' + TOTAL_WAVES); sfx.wave();
}
function waveCleared() {
  wave.done = true; score += 200 * wave.n;
  if (wave.n >= TOTAL_WAVES) { endGame(true); return; }
  player.hp = Math.min(100, player.hp + 30); player.reserve = 96; player.ammo = MAG; player.reload = 0;
  wave.nextT = 3; banner('ONDA CONCLUÍDA!');
}
function endGame(win) {
  state = win ? 'win' : 'over'; mouse.down = false;
  document.exitPointerLock();
  $('hud').classList.add('hidden'); $('countdown').classList.add('hidden');
  $('finalWave').textContent = wave.n; $('finalScore').textContent = score; $('winScore').textContent = score;
  showOverlay(win ? 'win' : 'over');
}

// ---------- Atualização ----------
function updateHUD() {
  $('hpFill').style.width = player.hp + '%'; $('hpText').textContent = Math.ceil(player.hp);
  $('ammo').textContent = player.reload > 0 ? 'RECARREGANDO...' : player.ammo + ' / ' + player.reserve;
  $('enemiesLeft').textContent = aliveCount() + wave.queue; $('score').textContent = score; $('waveNum').textContent = Math.max(1, wave.n);
  $('hurt').style.opacity = hurtA; $('hitmarker').style.opacity = hitT > 0 ? 1 : 0;
}

function update(dt) {
  const active = state === 'playing' || state === 'countdown';
  const locked = document.pointerLockElement === renderer.domElement;
  $('pause').classList.toggle('hidden', !(active && !locked && performance.now() - lockReq > 500));
  gun.visible = active;

  for (let i = fx.length - 1; i >= 0; i--) {
    fx[i].t -= dt;
    if (fx[i].t <= 0) { const o = fx[i].obj; scene.remove(o); o.geometry.dispose(); o.material.dispose(); fx.splice(i, 1); }
  }

  if (!active) {
    menuYaw += dt * 0.15; camera.position.set(0, 6, 0); camera.rotation.set(-0.15, menuYaw, 0);
    return;
  }
  if (!locked) return;

  // Jogador
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const vx = -Math.sin(player.yaw) * f + Math.cos(player.yaw) * s, vz = -Math.cos(player.yaw) * f - Math.sin(player.yaw) * s;
  const l = Math.hypot(vx, vz), run = keys.ShiftLeft || keys.ShiftRight;
  if (l > 0) { const k = (run ? 9.5 : 6.5) * dt / l; player.pos.x += vx * k; player.pos.z += vz * k; player.bob += dt * (run ? 13 : 9); }
  resolve(player.pos, PR);
  player.pos.x = Math.max(-HALF + 0.5, Math.min(HALF - 0.5, player.pos.x));
  player.pos.z = Math.max(-HALF + 0.5, Math.min(HALF - 0.5, player.pos.z));
  camera.position.set(player.pos.x, EYE + (l > 0 ? Math.sin(player.bob) * 0.04 : 0), player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);

  player.cool -= dt;
  if (player.reload > 0) {
    player.reload -= dt;
    if (player.reload <= 0) { const take = Math.min(MAG - player.ammo, player.reserve); player.ammo += take; player.reserve -= take; player.reload = 0; }
  }
  if (mouse.down) shoot();

  recoil = Math.max(0, recoil - dt * 8);
  gun.position.z = -0.5 + recoil * 0.06;
  gun.position.y = -0.22 + (player.reload > 0 ? -0.08 : 0) + (l > 0 ? Math.sin(player.bob * 2) * 0.004 : 0);
  flashT -= dt; flashMesh.visible = flashT > 0; flashLight.intensity = flashT > 0 ? 2 : 0;
  hurtA = Math.max(0, hurtA - dt * 1.5); hitT -= dt;

  if (state === 'countdown') {
    cd -= dt; $('countdown').textContent = Math.max(1, Math.ceil(cd));
    if (cd <= 0) { state = 'playing'; $('countdown').classList.add('hidden'); startWave(1); }
    updateHUD(); return;
  }

  // Ondas
  if (wave.done) {
    wave.nextT -= dt;
    if (wave.nextT <= 0 && state === 'playing') startWave(wave.n + 1);
  } else {
    if (wave.queue > 0 && aliveCount() < wave.maxAlive) {
      wave.spawnT -= dt;
      if (wave.spawnT <= 0) { spawnEnemy(); wave.queue--; wave.spawnT = 1; }
    }
    if (wave.queue === 0 && aliveCount() === 0) waveCleared();
  }

  // Inimigos
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) {
      e.deathT += dt; e.g.rotation.x = -Math.min(e.deathT * 4, 1) * Math.PI / 2;
      if (e.deathT > 1.2) { scene.remove(e.g); enemies.splice(i, 1); }
    } else updateEnemy(e, dt);
  }
  if (state === 'playing') updateHUD();
}

// ---------- Entrada ----------
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyR') startReload();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('mousedown', e => {
  if (e.button === 0 && document.pointerLockElement === renderer.domElement) { mouse.down = true; shoot(); }
});
addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement || (state !== 'playing' && state !== 'countdown')) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - e.movementY * 0.0022));
});
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('blur', () => { mouse.down = false; for (const k in keys) keys[k] = false; });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
});
$('btnPlay').onclick = startCountdown;
$('btnAgain').onclick = startCountdown;
$('btnAgain2').onclick = startCountdown;
$('pause').onclick = lock;

// ---------- Loop ----------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  update(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);
})();
