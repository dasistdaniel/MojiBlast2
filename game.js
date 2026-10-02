'use strict';
// MojiBlast 2 – Buchstaben-Jahrmarkt: Emoji und Wort mit Lücke, den fehlenden Buchstaben-Ballon abschießen

// ---------- Konstanten ----------
const W = 960, H = 540;                  // logische Spielfläche, wird auf die Bühne skaliert
const LANES = [180, 320, 450];           // Flugbahnen der drei Ballons
const HERO_X = 90, HERO_MIN = 140, HERO_MAX = 470;
const HERO_SPEED = 420, BULLET_SPEED = 950, FIRE_COOLDOWN = 0.28;
const MUZZLE_DX = 66;                    // Mündung der Konfettikanone
const BALLOON_RX = 42, BALLOON_RY = 52;
const STOP_X = 800, ENTER_EASE = 4, HOLD_TIME = 2.2; // Ballons schweben ein und warten, bis das Kind gelesen hat
const START_HEARTS = 3, MAX_HEARTS = 5, BONUS_EVERY = 10;
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const TEXT_FONT = '"Arial Rounded MT Bold","Segoe UI","Trebuchet MS",system-ui,sans-serif';
const BALLOON_COLORS = [
  { base: '#ff4f6a', light: '#ff9aa9', dark: '#b81f3b' },
  { base: '#3fa9ff', light: '#9bd4ff', dark: '#1a69b8' },
  { base: '#3ecf72', light: '#9cf0b9', dark: '#1c8a47' },
  { base: '#ffc93f', light: '#ffe69a', dark: '#c78f0a' },
  { base: '#b66bff', light: '#dcb4ff', dark: '#7a2fc4' },
  { base: '#ff8a3f', light: '#ffc29a', dark: '#c4560f' },
];
const CONFETTI = ['#ff4f6a', '#3fa9ff', '#3ecf72', '#ffc93f', '#b66bff', '#ff8a3f', '#ffffff'];
const GAP_NAMES = { start: 'Anfang', mid: 'Mitte', end: 'Ende' };
const LEN_NAMES = { short: 'kurze', medium: 'mittlere', long: 'lange' };
const GAP_ORDER = ['start', 'mid', 'end'], LEN_ORDER = ['short', 'medium', 'long'];

// ---------- Hilfen ----------
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* egal */ }
}

// ---------- Einstellungen & Rekorde ----------
const settings = load('mojiBlast2.settings', { gaps: ['start'], lens: ['short'], speak: true });
if (!Array.isArray(settings.gaps) || !settings.gaps.length) settings.gaps = ['start'];
if (!Array.isArray(settings.lens) || !settings.lens.length) settings.lens = ['short'];
settings.speak = settings.speak !== false;

const modeKey = () => `${GAP_ORDER.filter(g => settings.gaps.includes(g)).join('-')}.${LEN_ORDER.filter(l => settings.lens.includes(l)).join('-')}`;
const hsKey = () => `mojiBlast2.hs.${modeKey()}`;
const modeName = () =>
  `Lücke: ${GAP_ORDER.filter(g => settings.gaps.includes(g)).map(g => GAP_NAMES[g]).join(' & ')} · ` +
  `${LEN_ORDER.filter(l => settings.lens.includes(l)).map(l => LEN_NAMES[l]).join(' & ')} Wörter`;

// ---------- Aufgaben ----------
// zwei falsche Buchstaben: Vokal ↔ Vokal, bei Konsonanten gern verwechselbare Paare (B/D, M/N …)
function distractors(word, idx) {
  const answer = word[idx];
  const base = answer === 'Ä' ? 'A' : answer === 'Ö' ? 'O' : answer === 'Ü' ? 'U' : answer;
  const pool = [];
  if (VOWELS.includes(base)) pool.push(...VOWELS);
  else {
    for (const g of CONFUSABLE) if (g.includes(base)) pool.push(...g, ...g);
    pool.push(...CONSONANTS);
  }
  const out = [];
  for (const c of shuffle(pool)) {
    if (c === answer || c === base || out.includes(c)) continue;
    const alt = word.slice(0, idx) + c + word.slice(idx + 1);
    if (WORDSET.has(alt)) continue;      // sonst gäbe es zwei richtige Wörter
    out.push(c);
    if (out.length === 2) break;
  }
  return out;
}

const recent = [];
function makeTask() {
  let pool = WORDS.filter(([w]) => settings.lens.includes(lengthClass(w)) && gapPositions(w, settings.gaps).length);
  const fresh = pool.filter(([w]) => !recent.includes(w));
  if (fresh.length) pool = fresh;
  const [word, emoji] = pick(pool);
  recent.push(word);
  if (recent.length > 12) recent.shift();
  const idx = pick(gapPositions(word, settings.gaps));
  const answer = word[idx];
  return { word, emoji, idx, answer, answers: shuffle([answer, ...distractors(word, idx)]) };
}

// ---------- Spielzustand ----------
const G = {
  state: 'title',      // title | play | paused | over
  phase: 'fly',        // fly | success | reveal | dying
  phaseT: 0,
  task: null,
  balloons: [], bullets: [], parts: [], texts: [],
  hero: { y: 320, targetY: null, cool: 0, blink: 0, dead: false },
  hearts: START_HEARTS, score: 0, streak: 0, bestStreak: 0, correct: 0, wrong: 0,
  speed: 22, shake: 0, time: 0,
};

const input = { up: false, down: false, keyFire: false, fireQueued: false, touchFire: false, pointerId: null };

// Lichtpunkte im Hintergrund
const lights = Array.from({ length: 60 }, (_, i) => {
  const layer = i % 3;
  return { x: Math.random() * W, y: Math.random() * H, layer, size: 2 + layer * 1.2, speed: 8 + layer * 14 };
});
// Karussell, Riesenrad & Co. ziehen langsam am Horizont vorbei
const props = [
  { emoji: '🎡', x: 700, y: 400, size: 150, speed: 7 },
  { emoji: '🎠', x: 280, y: 440, size: 100, speed: 10 },
  { emoji: '🎪', x: 1000, y: 430, size: 120, speed: 8 },
];
const clouds = [
  { x: 150, y: 150, size: 80, speed: 5 }, { x: 560, y: 90, size: 60, speed: 4 }, { x: 860, y: 230, size: 70, speed: 6 },
];

function balloonSpeed() {
  return 22 + Math.min(G.correct, 30) * 0.6;
}

// ---------- Spielablauf ----------
function startGame() {
  if (G.state === 'play') return;
  Object.assign(G, {
    state: 'play', phase: 'fly', phaseT: 0, task: null,
    balloons: [], bullets: [], parts: [], texts: [],
    hearts: START_HEARTS, score: 0, streak: 0, bestStreak: 0, correct: 0, wrong: 0, shake: 0, aim: null,
  });
  Object.assign(G.hero, { y: 320, targetY: null, cool: 0.3, blink: 0, dead: false });
  showOverlay(null);
  $('hudButtons').classList.remove('hidden');
  $('btnFire').classList.remove('hidden');
  input.fireQueued = false;
  Sound.unlock();
  Sound.startMusic();
  newTask();
}

function sayWord() {
  if (settings.speak && G.task) Sound.say(G.task.word);
}

function newTask() {
  G.task = makeTask();
  const colors = shuffle(BALLOON_COLORS.slice());
  // Reste der vorigen Welle schweben davon, die neue Welle kommt von rechts
  const leaving = G.balloons.filter(b => b.state === 'flee' || b.state === 'fade');
  const wave = G.task.answers.map((letter, i) => ({
    x: W + 120, baseY: LANES[i], y: LANES[i], letter, color: colors[i],
    state: 'fly', move: 'enter', hold: HOLD_TIME, t: Math.random() * 6, alpha: 1,
  }));
  G.balloons = leaving.concat(wave);
  G.speed = balloonSpeed();
  G.aim = null;
  Sound.play('whoosh');
  setTimeout(() => { if (G.state === 'play' && G.phase === 'fly') sayWord(); }, 350);
  G.phase = 'fly';
}

function setPhase(phase, t) { G.phase = phase; G.phaseT = t; }

function shoot() {
  G.hero.cool = FIRE_COOLDOWN;
  G.bullets.push({ x: HERO_X + MUZZLE_DX, y: G.hero.y + 14, color: pick(CONFETTI) });
  Sound.play('laser');
}

function hitBalloon(b) {
  const t = G.task;
  b.state = 'dead';
  if (b.letter === t.answer) {
    G.streak++;
    G.bestStreak = Math.max(G.bestStreak, G.streak);
    G.correct++;
    const pts = 10 + Math.min(G.streak - 1, 5) * 2;
    G.score += pts;
    pop(b, CONFETTI, 40);
    floatText(b.x - 20, b.y - 60, `+${pts}`, '#ffd84f', 40);
    if (G.streak >= 3) floatText(b.x - 20, b.y + 60, `🔥 ${G.streak}er-Serie!`, '#ff9f4f', 26);
    Sound.play('boom');
    Sound.play('correct');
    if (G.correct % BONUS_EVERY === 0 && G.hearts < MAX_HEARTS) {
      G.hearts++;
      floatText(HERO_X + 40, G.hero.y - 70, '+❤️', '#ff6b8a', 40);
      Sound.play('shieldup');
    }
    for (const o of G.balloons) if (o.state === 'fly') o.state = 'flee';
    setPhase('success', 1.7);
    sayWord();
  } else {
    G.wrong++;
    G.streak = 0;
    pop(b, ['#999999', '#bbbbbb', '#777777'], 20, '💨');
    floatText(b.x, b.y - 10, 'Ups!', '#ff6b8a', 44);
    Sound.play('boom');
    Sound.play('wrong');
    loseHeart();
  }
}

function balloonsArrived() {
  G.wrong++;
  G.streak = 0;
  Sound.play('timeout');
  floatText(W / 2, 150, `Gesucht war: ${G.task.answer}`, '#ffd84f', 34);
  loseHeart();
  if (G.phase === 'fly') {
    for (const b of G.balloons) if (b.state === 'fly') b.state = b.letter === G.task.answer ? 'show' : 'fade';
    setPhase('reveal', 2.6);
    sayWord();
  }
}

function loseHeart() {
  G.hearts--;
  G.shake = 0.35;
  G.hero.blink = 1;
  Sound.play('shield');
  explode(HERO_X, G.hero.y, ['#ff6b8a', '#ffb3c4'], 14);
  if (G.hearts <= 0) die();
}

function die() {
  G.hero.dead = true;
  G.shake = 0.5;
  explode(HERO_X, G.hero.y, ['#ff6b8a', '#ffc93f', '#ffffff'], 40);
  Sound.stopMusic();
  // zum Lernen: richtigen Buchstaben noch einmal zeigen
  for (const b of G.balloons) if (b.state === 'fly') b.state = b.letter === G.task.answer ? 'show' : 'fade';
  setPhase('dying', 2.4);
  sayWord();
}

function endPhase() {
  if (G.phase === 'success') newTask();
  else if (G.phase === 'reveal') {
    for (const b of G.balloons) if (b.state === 'show') b.state = 'flee';
    newTask();
  } else if (G.phase === 'dying') gameOver();
}

function gameOver() {
  G.state = 'over';
  $('hudButtons').classList.add('hidden');
  $('btnFire').classList.add('hidden');
  const best = load(hsKey(), 0);
  const record = G.score > best;
  if (record) save(hsKey(), G.score);
  $('overMode').textContent = modeName();
  $('overScore').textContent = `⭐ ${G.score} Punkte`;
  $('overStats').textContent = `✅ ${G.correct} richtig · ❌ ${G.wrong} falsch · 🔥 beste Serie ${G.bestStreak}`;
  $('overBest').textContent = record && G.score > 0 ? '🏆 Neuer Rekord!' : `🏆 Rekord: ${best}`;
  Sound.play(record && G.score > 0 ? 'record' : 'gameover');
  G.overAt = performance.now();
  showOverlay('over');
}

function pause() {
  if (G.state !== 'play') return;
  G.state = 'paused';
  Sound.stopMusic();
  Sound.hush();
  showOverlay('pause');
}

function resume() {
  if (G.state !== 'paused') return;
  G.state = 'play';
  showOverlay(null);
  if (!G.hero.dead) Sound.startMusic();
}

function toMenu() {
  G.state = 'title';
  G.balloons = []; G.bullets = []; G.parts = []; G.texts = [];
  G.hero.dead = false;
  Sound.stopMusic();
  Sound.hush();
  $('hudButtons').classList.add('hidden');
  $('btnFire').classList.add('hidden');
  updateTitle();
  showOverlay('title');
}

function showOverlay(id) {
  for (const o of ['title', 'pause', 'over']) $(o).classList.toggle('hidden', o !== id);
}

// ---------- Effekte ----------
function explode(x, y, colors, n) {
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 260;
    const life = 0.5 + Math.random() * 0.7;
    G.parts.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 40, life, max: life, color: pick(colors), size: 3 + Math.random() * 5, spin: Math.random() * 6 });
  }
}

function pop(b, colors, n, fx = '✨') {
  explode(b.x, b.y, colors, n);
  G.parts.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.45, max: 0.45, emoji: fx, size: 70 });
}

function floatText(x, y, text, color, size) {
  G.texts.push({ x, y, sprite: textSprite(text, color, size), life: 1.3, max: 1.3 });
}

// ---------- Update ----------
function update(dt) {
  G.time += dt;
  for (const s of lights) {
    s.x -= s.speed * dt;
    if (s.x < 0) { s.x += W; s.y = Math.random() * H; }
  }
  for (const p of props) {
    p.x -= p.speed * dt;
    if (p.x < -p.size) p.x = W + p.size;
  }
  for (const c of clouds) {
    c.x -= c.speed * dt;
    if (c.x < -c.size) { c.x = W + c.size; c.y = rand(70, 260); }
  }
  if (G.state !== 'play') return;

  const h = G.hero;
  if (!h.dead) {
    const dir = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (G.aim && (G.aim.state !== 'fly' || G.phase !== 'fly')) G.aim = null;
    if (dir) { h.targetY = null; G.aim = null; h.y += dir * HERO_SPEED * dt; }
    else {
      if (G.aim) h.targetY = G.aim.y - 14;   // angetippten Ballon verfolgen (Kanone sitzt etwas tiefer)
      if (h.targetY !== null) {
        const d = h.targetY - h.y, step = HERO_SPEED * 1.8 * dt;
        h.y += Math.abs(d) <= step ? d : Math.sign(d) * step;
      }
    }
    h.y = clamp(h.y, HERO_MIN, HERO_MAX);
    h.cool -= dt;
    // Zielen per Antippen: schießen, sobald die Kanone auf der Höhe des Ballons ist
    if (G.aim && Math.abs(h.y + 14 - G.aim.y) < 16 && h.cool <= 0) { G.aim = null; shoot(); }
    // kurzes Antippen wird gemerkt, auch wenn es zwischen zwei Frames endet
    if ((input.fireQueued || input.keyFire || input.touchFire) && h.cool <= 0) { input.fireQueued = false; shoot(); }
  }
  h.blink = Math.max(0, h.blink - dt);
  G.shake = Math.max(0, G.shake - dt);

  for (const b of G.bullets) b.x += BULLET_SPEED * dt;

  for (const b of G.balloons) {
    b.t += dt;
    if (b.state === 'fly' && G.phase === 'fly') {
      if (b.move === 'enter') {
        // schnell herein, dann sanft abbremsen
        b.x += (STOP_X - b.x) * Math.min(1, dt * ENTER_EASE);
        if (b.x - STOP_X < 2) { b.x = STOP_X; b.move = 'hold'; }
      } else if (b.move === 'hold') {
        b.hold -= dt;
        if (b.hold <= 0) b.move = 'approach';
      } else b.x -= G.speed * dt;
      b.y = b.baseY + Math.sin(b.t * 2) * 12;
    } else if (b.state === 'flee') {
      b.y -= 260 * dt;
      b.x += Math.sin(b.t * 3) * 20 * dt;
      b.alpha -= dt * 1.1;
    } else if (b.state === 'fade') {
      b.y -= 60 * dt;
      b.alpha -= dt * 1.5;
    } else if (b.state === 'show') {
      b.y = b.baseY + Math.sin(b.t * 2) * 12;
    }
  }

  // Treffer prüfen (großzügige Hitbox für Kinderfinger)
  if (G.phase === 'fly') {
    for (const bu of G.bullets) {
      for (const b of G.balloons) {
        if (b.state !== 'fly' || bu.hit) continue;
        if (bu.x > b.x - BALLOON_RX - 8 && bu.x < b.x + BALLOON_RX && Math.abs(bu.y - b.y) < BALLOON_RY + 10) {
          bu.hit = true;
          hitBalloon(b);
          if (G.phase !== 'fly') break;
        }
      }
      if (G.phase !== 'fly') break;
    }
  }
  G.bullets = G.bullets.filter(b => !b.hit && b.x < W + 30);

  // Ballons haben den Schützen erreicht
  if (G.phase === 'fly' && G.balloons.some(b => b.state === 'fly' && b.x - BALLOON_RX <= HERO_X + 36)) balloonsArrived();

  G.balloons = G.balloons.filter(b => b.state !== 'dead' && b.alpha > 0);

  for (const p of G.parts) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.97; p.vy = p.vy * 0.97 + 120 * dt;
    p.life -= dt;
  }
  G.parts = G.parts.filter(p => p.life > 0);
  for (const t of G.texts) { t.y -= 30 * dt; t.life -= dt; }
  G.texts = G.texts.filter(t => t.life > 0);

  if (G.phase !== 'fly') {
    G.phaseT -= dt;
    if (G.phaseT <= 0) endPhase();
  }
}

// ---------- Zeichnen ----------
const canvas = $('game'), ctx = canvas.getContext('2d');
let dpr = 1;

// Emojis jedes Frame neu zu setzen ist auf schwachen Geräten teuer – besonders groß und halbtransparent.
// Deshalb wird jedes Emoji (und jeder Flugtext) einmal in ein kleines Bild gezeichnet und danach nur noch kopiert.
const sprites = new Map();
let spriteScale = 1;

function resize() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  spriteScale = canvas.width / W;
  sprites.clear();
}

// Zeichenfläche für ein Sprite; als ImageBitmap lässt es sich am schnellsten kopieren
function spriteCanvas(w, h) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
const toBitmap = c => (c.transferToImageBitmap ? c.transferToImageBitmap() : c);

function sprite(e, size) {
  const key = `${e}|${size}`;
  let img = sprites.get(key);
  if (!img) {
    const box = Math.max(1, Math.ceil(size * 1.4 * spriteScale));
    const c = spriteCanvas(box, box), g = c.getContext('2d');
    g.font = `${size * spriteScale}px ${EMOJI_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(e, box / 2, box / 2);
    img = toBitmap(c);
    sprites.set(key, img);
  }
  return img;
}

// renderSize: Größe des zwischengespeicherten Bildes (für Emojis, die beim Zeichnen wachsen)
function emoji(e, x, y, size, alpha = 1, renderSize = size) {
  const d = size * 1.4;
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite(e, renderSize), x - d / 2, y - d / 2, d, d);
  ctx.globalAlpha = 1;
}

function textSprite(text, color, size) {
  const s = spriteScale, font = `900 ${size * s}px ${TEXT_FONT}, ${EMOJI_FONT}`;
  ctx.font = font;
  const c = spriteCanvas(Math.ceil(ctx.measureText(text).width + 12 * s), Math.ceil(size * 1.5 * s));
  const g = c.getContext('2d');
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 5 * s;
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(40,10,60,0.7)';
  g.fillStyle = color;
  g.strokeText(text, c.width / 2, c.height / 2);
  g.fillText(text, c.width / 2, c.height / 2);
  return { w: c.width / s, h: c.height / s, img: toBitmap(c) };
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBackground() {
  // Abendhimmel über dem Rummel
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#4b2a8c');
  g.addColorStop(0.55, '#c8587f');
  g.addColorStop(1, '#ffb27a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (const c of clouds) emoji('☁️', c.x, c.y, c.size, 0.45);
  for (const p of props) emoji(p.emoji, p.x, p.y, p.size, 0.8);
  for (const s of lights) {
    ctx.globalAlpha = 0.25 + s.layer * 0.12;
    ctx.fillStyle = '#fff7d6';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawBunting();
  // Tresen der Schießbude
  ctx.fillStyle = '#8b4a2b';
  ctx.fillRect(0, 512, W, 28);
  ctx.fillStyle = '#c47a45';
  ctx.fillRect(0, 512, W, 6);
}

// Wimpelkette am oberen Rand
function drawBunting() {
  const n = 16, step = W / n;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(W / 2, 46, W, 0);
  ctx.stroke();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = t * W, y = 2 * t * (1 - t) * 46;   // Punkt auf der Kurve
    ctx.fillStyle = BALLOON_COLORS[i % BALLOON_COLORS.length].base;
    ctx.beginPath();
    ctx.moveTo(x - step * 0.3, y);
    ctx.lineTo(x + step * 0.3, y);
    ctx.lineTo(x, y + 30);
    ctx.fill();
  }
}

function drawHero() {
  const h = G.hero;
  const y = G.state === 'title' ? 320 + Math.sin(G.time * 2) * 10 : h.y;
  if (h.blink > 0 && Math.floor(h.blink * 12) % 2 === 0) return;
  // Konfettikanone
  const kx = HERO_X + 22, ky = y + 6;
  ctx.fillStyle = '#ff5f7e';
  roundRect(kx, ky, 46, 20, 6);
  ctx.fill();
  ctx.fillStyle = '#ffd84f';
  ctx.fillRect(kx + 12, ky, 6, 20);
  ctx.fillRect(kx + 30, ky, 6, 20);
  ctx.fillStyle = '#3a2a5c';
  roundRect(kx + 42, ky - 3, 10, 26, 4);
  ctx.fill();
  if (h.dead) {
    ctx.save();
    ctx.translate(HERO_X, y);
    ctx.rotate(-0.5);
    emoji('🦊', 0, 0, 70, 0.8);
    ctx.restore();
    emoji('💫', HERO_X, y - 44, 34);
  } else emoji('🦊', HERO_X, y, 70);
}

function drawBalloon(b) {
  const alpha = Math.max(0, b.alpha), show = b.state === 'show';
  const pulse = show ? 1 + Math.sin(G.time * 8) * 0.07 : 1;
  const c = b.color;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(b.x, b.y);
  ctx.scale(pulse, pulse);
  // Schnur
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, BALLOON_RY + 6);
  ctx.quadraticCurveTo(Math.sin(b.t * 3) * 14, BALLOON_RY + 40, Math.sin(b.t * 3 + 1.5) * -8, BALLOON_RY + 70);
  ctx.stroke();
  // Körper
  const g = ctx.createRadialGradient(-14, -20, 6, 0, 0, BALLOON_RY + 8);
  g.addColorStop(0, c.light);
  g.addColorStop(0.55, c.base);
  g.addColorStop(1, c.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, BALLOON_RX, BALLOON_RY, 0, 0, Math.PI * 2);
  ctx.fill();
  // Knoten
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.moveTo(0, BALLOON_RY - 2);
  ctx.lineTo(-7, BALLOON_RY + 9);
  ctx.lineTo(7, BALLOON_RY + 9);
  ctx.fill();
  // Glanzlicht
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.ellipse(-17, -26, 7, 13, -0.5, 0, Math.PI * 2);
  ctx.fill();
  if (show) {
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(0, 0, BALLOON_RX + 6, BALLOON_RY + 6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Buchstabe
  ctx.font = `900 64px ${TEXT_FONT}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = c.dark;
  ctx.strokeText(b.letter, 0, 4);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(b.letter, 0, 4);
  ctx.restore();
  ctx.globalAlpha = 1;
}

// Emoji + Wort mit Lücke
const TILE_W = 58, TILE_GAP = 8;
function drawHud() {
  const t = G.task;
  if (t) {
    const solved = G.phase !== 'fly';
    const color = G.phase === 'success' ? '#4ade80' : '#ffd84f';
    const n = t.word.length;
    const wordW = n * TILE_W + (n - 1) * TILE_GAP;
    const panelW = Math.max(320, wordW + 150), panelH = 92, px = W / 2 - panelW / 2, py = 12;
    ctx.fillStyle = 'rgba(40,14,70,0.92)';
    roundRect(px, py, panelW, panelH, 24);
    ctx.fill();
    ctx.strokeStyle = solved ? color : 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    ctx.stroke();
    const bounce = G.phase === 'success' ? Math.abs(Math.sin(G.time * 9)) * 8 : 0;
    emoji(t.emoji, px + 56, py + panelH / 2 - bounce, 64);
    const x0 = px + 110;
    ctx.font = `900 54px ${TEXT_FONT}`;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (TILE_W + TILE_GAP), cx = x + TILE_W / 2, cy = py + panelH / 2;
      if (i === t.idx) {
        ctx.fillStyle = solved ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.22)';
        roundRect(x, cy - 33, TILE_W, 66, 12);
        ctx.fill();
        if (!solved) {
          ctx.strokeStyle = `rgba(255,216,79,${0.6 + Math.sin(G.time * 6) * 0.4})`;
          ctx.lineWidth = 4;
          ctx.stroke();
          ctx.fillStyle = '#ffd84f';
          ctx.fillText('?', cx, cy + 3);
        } else {
          ctx.fillStyle = color;
          ctx.fillText(t.answer, cx, cy + 3);
        }
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillText(t.word[i], cx, cy + 3);
      }
    }
    // Lautsprecher-Hinweis: Antippen spricht das Wort
    ctx.font = `20px ${EMOJI_FONT}`;
    ctx.globalAlpha = 0.7;
    ctx.fillText('🔈', px + panelW - 22, py + 22);
    ctx.globalAlpha = 1;
  }
  // Herzen
  for (let i = 0; i < Math.max(START_HEARTS, G.hearts); i++)
    emoji('❤️', 35 + i * 36, 38, 30, i < G.hearts ? 1 : 0.2);
  // Punkte und Serie
  ctx.textAlign = 'left';
  ctx.font = `900 30px ${TEXT_FONT}`;
  emoji('⭐', 35, 80, 28);
  ctx.fillStyle = '#ffd84f';
  ctx.fillText(String(G.score), 56, 82);
  if (G.streak >= 3) {
    emoji('🔥', 165, 80, 26);
    ctx.fillStyle = '#ff9f4f';
    ctx.fillText(String(G.streak), 184, 82);
  }
  ctx.textAlign = 'center';
}

function draw() {
  const scale = canvas.width / W;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (G.shake > 0) ctx.translate((Math.random() - 0.5) * 14 * G.shake, (Math.random() - 0.5) * 14 * G.shake);

  drawBackground();
  if (G.state === 'title') { drawHero(); return; }

  for (const b of G.balloons) drawBalloon(b);
  if (G.aim) {
    // Zielmarkierung um den angetippten Ballon
    const a = G.aim, rad = 60 + Math.sin(G.time * 10) * 4;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -G.time * 40;
    ctx.beginPath();
    ctx.arc(a.x, a.y, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const b of G.bullets) {
    ctx.fillStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  drawHero();

  for (const p of G.parts) {
    const k = p.life / p.max;
    if (p.emoji) { emoji(p.emoji, p.x, p.y, p.size * (1.4 - k * 0.4), k, p.size * 1.4); continue; }
    ctx.globalAlpha = k;
    ctx.fillStyle = p.color;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.spin + G.time * 8);
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  for (const t of G.texts) {
    ctx.globalAlpha = Math.min(1, t.life / t.max * 2);
    ctx.drawImage(t.sprite.img, t.x - t.sprite.w / 2, t.y - t.sprite.h / 2, t.sprite.w, t.sprite.h);
  }
  ctx.globalAlpha = 1;

  drawHud();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

// ---------- Titelbildschirm ----------
function updateTitle() {
  for (const b of document.querySelectorAll('[data-gap]'))
    b.setAttribute('aria-pressed', settings.gaps.includes(b.dataset.gap));
  for (const b of document.querySelectorAll('[data-len]'))
    b.setAttribute('aria-pressed', settings.lens.includes(b.dataset.len));
  $('btnSpeak').setAttribute('aria-pressed', settings.speak);
  $('titleBest').textContent = `🏆 Rekord: ${load(hsKey(), 0)}`;
}

// Mehrfachauswahl, mindestens ein Eintrag bleibt gewählt
function bindMulti(attr, list) {
  for (const b of document.querySelectorAll(`[data-${attr}]`)) {
    b.addEventListener('click', () => {
      const v = b.dataset[attr], on = settings[list].includes(v);
      if (on && settings[list].length === 1) {
        b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
        Sound.play('deny');
        return;
      }
      settings[list] = on ? settings[list].filter(x => x !== v) : settings[list].concat(v);
      save('mojiBlast2.settings', settings);
      Sound.play('click');
      updateTitle();
    });
  }
}
bindMulti('gap', 'gaps');
bindMulti('len', 'lens');

$('btnSpeak').addEventListener('click', () => {
  settings.speak = !settings.speak;
  save('mojiBlast2.settings', settings);
  Sound.play('click');
  if (settings.speak) Sound.say('KATZE');
  updateTitle();
});

// ---------- Eingabe ----------
$('btnStart').addEventListener('click', startGame);
$('btnAgain').addEventListener('click', startGame);
$('btnMenu').addEventListener('click', toMenu);
$('btnResume').addEventListener('click', resume);
$('btnPauseMenu').addEventListener('click', toMenu);
$('btnPause').addEventListener('click', () => (G.state === 'play' ? pause() : resume()));

const updateMuteIcon = () => { $('btnMute').textContent = Sound.muted ? '🔇' : '🔊'; };
$('btnMute').addEventListener('click', () => { Sound.toggle(); updateMuteIcon(); });
updateMuteIcon();
// HUD-Knöpfe nicht fokussiert lassen, sonst lösen Leertaste/Enter sie erneut aus
for (const b of document.querySelectorAll('#hudButtons button')) b.addEventListener('click', () => b.blur());

const KEYS_UP = ['ArrowUp', 'KeyW'], KEYS_DOWN = ['ArrowDown', 'KeyS'], KEYS_FIRE = ['Space', 'KeyF'];

window.addEventListener('keydown', e => {
  if (KEYS_UP.includes(e.code)) input.up = true;
  if (KEYS_DOWN.includes(e.code)) input.down = true;
  if (KEYS_FIRE.includes(e.code)) { input.keyFire = true; if (!e.repeat) input.fireQueued = true; }
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();

  if (e.repeat) return;
  if (e.code === 'KeyM') { Sound.toggle(); updateMuteIcon(); }
  if (e.code === 'KeyR' && G.state === 'play') sayWord();
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (G.state === 'play') pause(); else if (G.state === 'paused') resume();
  }
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    if (G.state === 'title') startGame();
    else if (G.state === 'paused') resume();
    else if (G.state === 'over' && performance.now() - G.overAt > 700) startGame();
  }
  if (e.code === 'Space' && G.state === 'title') startGame();
});

window.addEventListener('keyup', e => {
  if (KEYS_UP.includes(e.code)) input.up = false;
  if (KEYS_DOWN.includes(e.code)) input.down = false;
  if (KEYS_FIRE.includes(e.code)) input.keyFire = false;
});

// Ballon antippen/anklicken = Kanone zielt und schießt automatisch.
// Sonst Maus: Klicken/Ziehen steuert. Touch: linke Hälfte ziehen = fliegen, rechte Hälfte halten = schießen
const firePointers = new Set();
function pointerY(e) {
  const rect = canvas.getBoundingClientRect();
  return (e.clientY - rect.top) / rect.height * H;
}
function pointerX(e) {
  const rect = canvas.getBoundingClientRect();
  return (e.clientX - rect.left) / rect.width * W;
}
// Antippen rechts vom Schützen wählt den Ballon der nächstgelegenen Bahn – Kinderfinger müssen nicht genau treffen
function balloonAt(x, y) {
  if (G.phase !== 'fly' || x < HERO_X + 70) return null;
  let best = null;
  for (const b of G.balloons)
    if (b.state === 'fly' && Math.abs(y - b.y) < 75 && (!best || Math.abs(y - b.y) < Math.abs(y - best.y))) best = b;
  return best;
}
canvas.addEventListener('pointerdown', e => {
  if (G.state !== 'play') return;
  // Antippen von Emoji/Wort oben spricht das Wort noch einmal
  if (pointerY(e) < 104 && Math.abs(pointerX(e) - W / 2) < 260) { sayWord(); return; }
  const target = G.hero.dead ? null : balloonAt(pointerX(e), pointerY(e));
  if (target) {
    G.aim = target;
    G.hero.targetY = target.y - 14;
    return;
  }
  canvas.setPointerCapture(e.pointerId);
  const rect = canvas.getBoundingClientRect();
  if (e.pointerType !== 'mouse' && e.clientX > rect.left + rect.width / 2) {
    firePointers.add(e.pointerId);
    input.touchFire = true; input.fireQueued = true;
    return;
  }
  input.pointerId = e.pointerId;
  G.aim = null;
  G.hero.targetY = pointerY(e);
});
canvas.addEventListener('pointermove', e => {
  if (G.state !== 'play') { canvas.style.cursor = ''; return; }
  if (e.pointerId === input.pointerId) G.hero.targetY = pointerY(e);
  else if (e.pointerType === 'mouse') canvas.style.cursor = balloonAt(pointerX(e), pointerY(e)) ? 'pointer' : 'crosshair';
});
const pointerEnd = e => {
  if (firePointers.delete(e.pointerId)) { input.touchFire = firePointers.size > 0; return; }
  if (e.pointerId !== input.pointerId) return;
  input.pointerId = null;
};
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);

const fire = $('btnFire');
fire.addEventListener('pointerdown', e => { e.preventDefault(); input.touchFire = true; input.fireQueued = true; fire.classList.add('down'); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave'])
  fire.addEventListener(ev, () => { input.touchFire = false; fire.classList.remove('down'); });

window.addEventListener('blur', () => { firePointers.clear(); Object.assign(input, { up: false, down: false, keyFire: false, touchFire: false }); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// ---------- Als App (PWA) ----------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // Version aus game.js?v=… übernehmen: jede neue Version installiert einen neuen Service Worker
  const version = new URL(document.currentScript.src).searchParams.get('v') || 'dev';
  navigator.serviceWorker.register(`sw.js?v=${version}`).catch(() => { /* ohne Offline-Modus weiter */ });
}

let installPrompt = null;
const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  $('btnInstall').hidden = false;
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  $('btnInstall').hidden = true;
});
$('btnInstall').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  try { await installPrompt.userChoice; } catch (e) { /* egal */ }
  installPrompt = null;
  $('btnInstall').hidden = true;
});
// iPhone/iPad kennen kein Installations-Ereignis: Hinweis auf das Teilen-Menü.
// iPads melden sich seit iPadOS 13 als „Macintosh“, erkennbar am Touchscreen.
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
$('installHint').hidden = standalone || !ios;

// ---------- Start ----------
resize();
updateTitle();
requestAnimationFrame(frame);
