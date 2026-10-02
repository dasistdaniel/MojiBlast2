'use strict';
// MojiBlast 2 – Buchstaben-Jahrmarkt: Emoji und Wort mit Lücke, den fehlenden Buchstaben-Ballon abschießen

// ---------- Konstanten ----------
const W = 960, H = 540;                  // logische Spielfläche, wird auf die Bühne skaliert
const LANES = [180, 320, 450];           // Flugbahnen der drei Ballons
const HERO_X = 90, HERO_MIN = 140, HERO_MAX = 470;
const HERO_SPEED = 420, BULLET_SPEED = 950, FIRE_COOLDOWN = 0.28;
const MUZZLE_DX = 48;                    // Konfetti kommt vorn aus dem Tier
const BALLOON_RX = 42, BALLOON_RY = 52;
const STOP_X = 800, ENTER_EASE = 4, HOLD_TIME = 1.2; // Ballons schweben ein und warten, bis das Kind gelesen hat
const START_HEARTS = 3, MAX_HEARTS = 5, BONUS_EVERY = 10;
const TEXT_FONT = 'Andika,"Arial Rounded MT Bold","Segoe UI","Trebuchet MS",system-ui,sans-serif';
const BALLOON_COLORS = [
  { base: '#ff4f6a', light: '#ff9aa9', dark: '#b81f3b' },
  { base: '#3fa9ff', light: '#9bd4ff', dark: '#1a69b8' },
  { base: '#3ecf72', light: '#9cf0b9', dark: '#1c8a47' },
  { base: '#ffc93f', light: '#ffe69a', dark: '#c78f0a' },
  { base: '#b66bff', light: '#dcb4ff', dark: '#7a2fc4' },
  { base: '#ff8a3f', light: '#ffc29a', dark: '#c4560f' },
];
const CONFETTI = ['#ff4f6a', '#3fa9ff', '#3ecf72', '#ffc93f', '#b66bff', '#ff8a3f', '#ffffff'];
const GAP_NAMES = { start: 'Anfang', mid: 'Mitte', end: 'Ende', sound: 'Laute' };
const LEN_NAMES = { short: 'kurze', medium: 'mittlere', long: 'lange' };
const GAP_ORDER = ['start', 'mid', 'end', 'sound'], LEN_ORDER = ['short', 'medium', 'long'];
const AVATARS = ['🦊', '🐻', '🐱', '🐰', '🐼', '🦄'];
const FACES_LEFT = ['🦄'];
const GOLD_MIN_GAP = 7;                  // mindestens so viele Aufgaben zwischen zwei Geschenk-Ballons
const DAILY_N = 10;                      // Wörter pro Tagesrunde
const GOLD = { base: '#ffc93f', light: '#fff2b0', dark: '#c78f0a' };
// Stufen für den Automatik-Modus: von leicht (Anfang, kurze Wörter) bis alles
const LEVELS = [
  { gaps: ['start'], lens: ['short'] },
  { gaps: ['start', 'end'], lens: ['short'] },
  { gaps: ['start', 'mid', 'end'], lens: ['short'] },
  { gaps: ['start', 'end'], lens: ['short', 'medium'] },
  { gaps: ['start', 'mid', 'end'], lens: ['short', 'medium'] },
  { gaps: ['start', 'mid', 'end'], lens: ['medium', 'long'] },
  { gaps: ['start', 'mid', 'end'], lens: ['short', 'medium', 'long'] },
  { gaps: ['sound'], lens: ['short', 'medium', 'long'] },
  { gaps: ['start', 'mid', 'end', 'sound'], lens: ['short', 'medium', 'long'] },
];
const EMOJI_OF = Object.fromEntries(WORDS);

// ---------- Hilfen ----------
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- Emoji-Bilder ----------
// Ein Emoji (auch mit Varianten-Selektor) → Dateiname in emoji/, z. B. 🦊 → 1f98a
const EMOJI_RE = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu;
const emojiKey = e => [...e].map(c => c.codePointAt(0)).filter(cp => cp !== 0xfe0f).map(cp => cp.toString(16)).join('-');
const emojiImages = new Map();     // key → { img, ok } für das Canvas
const emojiMissing = new Set();    // Emojis ohne Bilddatei bleiben als Schrift-Emoji stehen

// Emojis in Texten der Seite durch <img> ersetzen; fehlt die Datei, bleibt das Schrift-Emoji
function emojify(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue.search(EMOJI_RE) >= 0) texts.push(n);
  for (const node of texts) {
    const text = node.nodeValue, frag = document.createDocumentFragment();
    let last = 0;
    for (const m of text.matchAll(EMOJI_RE)) {
      if (m.index > last) frag.append(text.slice(last, m.index));
      const key = emojiKey(m[0]);
      if (emojiMissing.has(key)) frag.append(m[0]);
      else {
        const img = document.createElement('img');
        img.className = 'emo';
        img.alt = m[0];
        img.draggable = false;
        img.src = `emoji/${key}.png`;
        img.addEventListener('error', () => { emojiMissing.add(key); img.replaceWith(m[0]); }, { once: true });
        frag.append(img);
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.append(text.slice(last));
    node.replaceWith(frag);
  }
}

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

// ---------- Profile & Fortschritt ----------
// Jedes Kind wählt ein Tier-Emoji; Einstellungen, Rekorde, Sticker und Lernstand liegen pro Profil im Browser.
const profileKey = av => `mojiBlast2.p.${av}`;
let profileId = load('mojiBlast2.profile', AVATARS[0]);
if (!AVATARS.includes(profileId)) profileId = AVATARS[0];
let P = null;

// Datum als lokaler Tag (nicht UTC), „gestern“ per Kalender statt 24 Stunden abziehen (Zeitumstellung)
const dateKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const yesterdayKey = () => { const d = new Date(); return dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)); };

function newProfile(migrate) {
  const p = {
    auto: true, level: 1, hist: [], gaps: ['start'], lens: ['short'], speak: true,
    letters: {}, counts: {}, conf: {}, confN: {}, stickers: [], hs: {}, daily: { last: null, streak: 0, stars: 0 },
  };
  if (migrate) {  // Einstellungen und Rekorde aus der Version vor den Profilen übernehmen
    const old = load('mojiBlast2.settings', null);
    if (old) {
      p.auto = false;
      if (Array.isArray(old.gaps)) p.gaps = old.gaps;
      if (Array.isArray(old.lens)) p.lens = old.lens;
      p.speak = old.speak !== false;
    }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith('mojiBlast2.hs.')) p.hs[k.slice('mojiBlast2.hs.'.length)] = load(k, 0);
      }
    } catch (e) { /* egal */ }
  }
  return p;
}

function loadProfile(av) {
  profileId = av;
  save('mojiBlast2.profile', av);
  const raw = load(profileKey(av), null);
  P = Object.assign(newProfile(av === AVATARS[0] && !raw), raw || {});
  P.daily = Object.assign({ last: null, streak: 0, stars: 0 }, P.daily);
  if (!Array.isArray(P.gaps) || !P.gaps.length) P.gaps = ['start'];
  if (!Array.isArray(P.lens) || !P.lens.length) P.lens = ['short'];
  if (!Array.isArray(P.hist)) P.hist = [];
  if (!Array.isArray(P.stickers)) P.stickers = [];
  P.level = clamp(Number(P.level) || 1, 1, LEVELS.length);
  P.speak = P.speak !== false;
  if (!raw) {
    saveProfile();
    // alte Schlüssel aus der Zeit vor den Profilen entfernen, damit sie nach einem Zurücksetzen nicht wieder auftauchen
    if (av === AVATARS[0]) try {
      const old = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k === 'mojiBlast2.settings' || k.startsWith('mojiBlast2.hs.')) old.push(k); }
      for (const k of old) localStorage.removeItem(k);
    } catch (e) { /* egal */ }
  }
}
const saveProfile = () => save(profileKey(profileId), P);

const activeConfig = () => (P.auto ? LEVELS[P.level - 1] : { gaps: P.gaps, lens: P.lens });
const modeKey = () => `${GAP_ORDER.filter(g => P.gaps.includes(g)).join('-')}.${LEN_ORDER.filter(l => P.lens.includes(l)).join('-')}`;
const hsKey = () => (P.auto ? 'auto' : modeKey());
const modeName = () => (P.auto ? `🤖 Automatisch · Stufe ${P.level}` :
  `Lücke: ${GAP_ORDER.filter(g => P.gaps.includes(g)).map(g => GAP_NAMES[g]).join(' & ')} · ` +
  `${LEN_ORDER.filter(l => P.lens.includes(l)).map(l => LEN_NAMES[l]).join(' & ')} Wörter`);

// ---------- Lernstand ----------
// Pro Buchstabe ein Wert 0…1 („wie sicher“): richtig im ersten Versuch steigt, Fehler senkt.
// Schwache Buchstaben kommen öfter dran; im Automatik-Modus steigt die Stufe nach 9 von 10 richtig.
const mastery = L => (L in P.letters ? P.letters[L] : 0.35);

function noteResult(letter, ok) {
  if (G.noted) return;               // pro Aufgabe nur einmal werten
  G.noted = true;
  const m = mastery(letter);
  P.letters[letter] = Math.round((ok ? m + (1 - m) * 0.3 : m * 0.55) * 1000) / 1000;
  const c = P.counts[letter] || [0, 0];
  P.counts[letter] = [c[0] + 1, c[1] + (ok ? 1 : 0)];
  if (P.auto) {
    P.hist.push(ok);
    if (P.hist.length > 10) P.hist.shift();
    if (P.hist.length >= 10) {
      const good = P.hist.filter(Boolean).length;
      if (good >= 9 && P.level < LEVELS.length) {
        P.level++; P.hist = [];
        floatText(W / 2, 250, `⬆️ Stufe ${P.level}!`, '#4ade80', 46);
        Sound.play('shieldup');
      } else if (good <= 5 && P.level > 1) { P.level--; P.hist = []; }
    }
  }
  saveProfile();
}

// ---------- Sticker ----------
function unlockSticker(word) {
  if (P.stickers.includes(word)) return false;
  P.stickers.push(word);
  G.newStickers.push(word);
  // Album-Seite voll? Einmalig feiern
  const group = GROUPS.find(g => g.id === GROUP_OF[word]);
  if (group.words.every(([w]) => P.stickers.includes(w))) {
    G.newBadges.push(group.name);
    floatText(W / 2, 205, `🏅 ${group.name} komplett!`, '#ffd84f', 36);
    Sound.play('record');
  }
  saveProfile();
  return true;
}

function unlockRandomSticker() {
  const locked = WORDS.filter(([w]) => !P.stickers.includes(w));
  if (!locked.length) return null;
  const [w] = pick(locked);
  unlockSticker(w);
  return w;
}

// ---------- Aufgaben ----------
// Falsche Antworten (Logik in words.js); früher verwechselte Antworten dieses Kindes kommen bevorzugt wieder
const distractors = (word, from, len) => makeDistractors(word, from, len, P.conf[word.slice(from, from + len)] || []);

function weightedPick(cands) {
  let r = Math.random() * cands.reduce((sum, c) => sum + c.wt, 0);
  for (const c of cands) { r -= c.wt; if (r <= 0) return c; }
  return cands[cands.length - 1];
}

const recent = [];
function makeTask() {
  const { gaps, lens } = activeConfig();
  let pool = WORDS.filter(([w]) => lens.includes(lengthClass(w)) && gapSpans(w, gaps).length);
  const fresh = pool.filter(([w]) => !recent.includes(w));
  if (fresh.length) pool = fresh;
  const cands = [];
  for (const [word, emoji] of pool)
    for (const span of gapSpans(word, gaps))
      cands.push({ word, emoji, span, wt: 0.4 + 2.2 * (1 - mastery(word.slice(span.from, span.from + span.len))) });
  const { word, emoji, span } = weightedPick(cands);
  recent.push(word);
  if (recent.length > 12) recent.shift();
  const { from, len } = span, answer = word.slice(from, from + len);
  return { word, emoji, from, len, answer, answers: shuffle([answer, ...distractors(word, from, len)]) };
}

// ---------- Spielzustand ----------
const G = {
  state: 'title',      // title | play | paused | over
  phase: 'fly',        // fly | success | reveal | dying
  phaseT: 0,
  task: null,
  mode: 'free',        // free | daily
  balloons: [], golds: [], bullets: [], parts: [], texts: [],
  hero: { y: 320, targetY: null, cool: 0, blink: 0, dead: false },
  hearts: START_HEARTS, score: 0, streak: 0, bestStreak: 0, correct: 0, wrong: 0,
  errors: 0, done: 0, sinceGold: 0, noted: false, taskErr: false, newStickers: [], newBadges: [],
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
  { emoji: '🎢', x: 420, y: 420, size: 130, speed: 4, alpha: 0.4 },       // fern
  { emoji: '🏰', x: 880, y: 440, size: 90, speed: 5, alpha: 0.4 },
  { emoji: '🎡', x: 700, y: 400, size: 150, speed: 7, alpha: 0.8 },
  { emoji: '🎠', x: 280, y: 440, size: 100, speed: 10, alpha: 0.8 },
  { emoji: '🎪', x: 1000, y: 430, size: 120, speed: 8, alpha: 0.8 },
];
// Kleine Ballons steigen im Hintergrund auf, ab und zu fliegt ein Vogel vorbei und es gibt Feuerwerk
const newBgBalloon = anywhere => ({ x: rand(30, W - 30), y: anywhere ? rand(0, H) : H + 40, r: rand(9, 17), vy: 10 + Math.random() * 14, ph: Math.random() * 6.28, c: pick(BALLOON_COLORS) });
const bgBalloons = Array.from({ length: 10 }, () => newBgBalloon(true));
const birds = [];
let birdTimer = 4;
const fireworks = [];
let fireworkTimer = 3;
const clouds = [
  { x: 150, y: 150, size: 80, speed: 5 }, { x: 560, y: 90, size: 60, speed: 4 }, { x: 860, y: 230, size: 70, speed: 6 },
];

function balloonSpeed() {
  return 22 + Math.min(G.correct, 30) * 0.6;
}

// ---------- Spielablauf ----------
function startGame(mode = 'free') {
  if (G.state === 'play') return;
  Object.assign(G, {
    mode, state: 'play', phase: 'fly', phaseT: 0, task: null,
    balloons: [], golds: [], bullets: [], parts: [], texts: [],
    hearts: START_HEARTS, score: 0, streak: 0, bestStreak: 0, correct: 0, wrong: 0, errors: 0, done: 0, sinceGold: 0,
    shake: 0, aim: null, newStickers: [], newBadges: [], noted: false, taskErr: false,
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
  if (P.speak && G.task) Sound.say(G.task.word);
}

function newTask() {
  G.task = makeTask();
  G.noted = false;
  G.taskErr = false;
  const colors = shuffle(BALLOON_COLORS.slice());
  // Reste der vorigen Welle schweben davon, die neue Welle kommt von rechts
  const leaving = G.balloons.filter(b => b.state === 'flee' || b.state === 'fade');
  const wave = G.task.answers.map((letter, i) => ({
    x: W + 120, baseY: LANES[i], y: LANES[i], letter, color: colors[i],
    state: 'fly', move: 'enter', t: Math.random() * 6, alpha: 1,
    // jeder Ballon fliegt etwas anders: eigene Wartezeit, Tempo, Wippen und leichtes Schlingern
    hold: HOLD_TIME * (0.85 + Math.random() * 0.4), spd: 0.85 + Math.random() * 0.3,
    amp: 8 + Math.random() * 10, freq: 1.5 + Math.random() * 1.1, wob: 4 + Math.random() * 8, ph: Math.random() * 6.28,
  }));
  G.balloons = leaving.concat(wave);
  // ab und zu schwebt ein goldener Geschenk-Ballon zwischen den Bahnen vorbei (gehört nicht zur Aufgabe)
  G.sinceGold++;
  if (!G.golds.length && G.sinceGold >= GOLD_MIN_GAP && Math.random() < 0.15) {
    G.sinceGold = 0;
    G.golds.push({ x: W + 90, baseY: pick([250, 385]) + rand(-15, 15), y: 250, t: 0, alpha: 1, state: 'fly', gift: true, color: GOLD });
  }
  G.speed = balloonSpeed();
  G.aim = null;
  Sound.play('whoosh');
  setTimeout(() => { if (G.state === 'play' && G.phase === 'fly') sayWord(); }, 350);
  G.phase = 'fly';
}

function setPhase(phase, t) { G.phase = phase; G.phaseT = t; }

function shoot() {
  G.hero.cool = FIRE_COOLDOWN;
  G.bullets.push({ x: HERO_X + MUZZLE_DX, y: G.hero.y, color: pick(CONFETTI) });
  Sound.play('laser');
}

function mistake() {
  G.wrong++;
  G.errors++;
  G.streak = 0;
  G.taskErr = true;
  if (G.mode === 'free') loseHeart();  // in der Tagesrunde gibt es keine Herzen, nur Sterne am Ende
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
    noteResult(t.answer, !G.taskErr);
    if (unlockSticker(t.word)) {
      floatText(W / 2, 150, `🆕 Sticker ${t.emoji}`, '#ffd84f', 30);
      Sound.play('sticker');
    }
    if (G.mode === 'free' && G.correct % BONUS_EVERY === 0 && G.hearts < MAX_HEARTS) {
      G.hearts++;
      floatText(HERO_X + 40, G.hero.y - 70, '+❤️', '#ff6b8a', 40);
      Sound.play('shieldup');
    }
    for (const o of G.balloons) if (o.state === 'fly') o.state = 'flee';
    setPhase('success', 1.7);
    sayWord();
  } else {
    const seen = P.conf[t.answer] || [];
    P.conf[t.answer] = [b.letter, ...seen.filter(x => x !== b.letter)].slice(0, 3);
    P.confN[`${t.answer}>${b.letter}`] = (P.confN[`${t.answer}>${b.letter}`] || 0) + 1;
    saveProfile();
    pop(b, ['#999999', '#bbbbbb', '#777777'], 20, '💨');
    floatText(b.x, b.y - 10, 'Ups!', '#ff6b8a', 44);
    Sound.play('boom');
    Sound.play('wrong');
    mistake();
  }
}

function hitGold(g) {
  g.state = 'dead';
  pop(g, ['#ffd84f', '#fff2b0', '#ffffff'], 36, '🌟');
  const w = unlockRandomSticker();
  const pts = w ? 15 : 25;
  G.score += pts;
  Sound.play('boom');
  Sound.play('sticker');
  floatText(g.x, g.y - 60, w ? `🎁 ${EMOJI_OF[w]} Sticker!` : `🎁 +${pts}`, '#ffd84f', 36);
}

function balloonsArrived() {
  Sound.play('timeout');
  floatText(W / 2, 150, `Gesucht war: ${G.task.answer}`, '#ffd84f', 34);
  mistake();
  noteResult(G.task.answer, false);
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
  noteResult(G.task.answer, false);
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
  if (G.phase === 'success' || G.phase === 'reveal') {
    if (G.phase === 'reveal') for (const b of G.balloons) if (b.state === 'show') b.state = 'flee';
    G.done++;
    if (G.mode === 'daily' && G.done >= DAILY_N) finishDaily(); else newTask();
  } else if (G.phase === 'dying') gameOver();
}

function showResult(title, mode, score, stats, best) {
  G.state = 'over';
  $('hudButtons').classList.add('hidden');
  $('btnFire').classList.add('hidden');
  $('overTitle').textContent = title;
  $('overMode').textContent = mode;
  $('overScore').textContent = score;
  $('overStats').textContent = stats;
  $('overBest').textContent = best;
  const parts = [];
  if (G.newStickers.length) parts.push(`🆕 Neue Sticker: ${G.newStickers.map(w => EMOJI_OF[w]).join(' ')}`);
  if (G.newBadges.length) parts.push(`🏅 Seite komplett: ${G.newBadges.join(', ')}`);
  $('overStickers').textContent = parts.join(' · ');
  G.overAt = performance.now();
  showOverlay('over');
}

function gameOver() {
  const key = hsKey(), best = P.hs[key] || 0;
  const record = G.score > best;
  if (record) { P.hs[key] = G.score; saveProfile(); }
  showResult('🎈 Geschafft!', modeName(), `⭐ ${G.score} Punkte`,
    `✅ ${G.correct} richtig · ❌ ${G.wrong} falsch · 🔥 beste Serie ${G.bestStreak}`,
    record && G.score > 0 ? '🏆 Neuer Rekord!' : `🏆 Rekord: ${best}`);
  Sound.play(record && G.score > 0 ? 'record' : 'gameover');
}

// Tagesrunde: 10 Wörter, Sterne nach Fehlern; die erste Runde des Tages zählt für die Tage-Serie und bringt ein Geschenk
function finishDaily() {
  const today = dateKey(), first = P.daily.last !== today;
  const stars = G.errors <= 1 ? 3 : G.errors <= 3 ? 2 : 1;
  if (first) {
    P.daily.streak = P.daily.last === yesterdayKey() ? P.daily.streak + 1 : 1;
    P.daily.stars = stars;
  } else P.daily.stars = Math.max(P.daily.stars, stars);
  P.daily.last = today;
  const gift = first ? unlockRandomSticker() : null;
  saveProfile();
  Sound.stopMusic();
  const days = P.daily.streak;
  showResult('📅 Tagesrunde geschafft!', `Tagesrunde · ${DAILY_N} Wörter`,
    '⭐'.repeat(stars) + '☆'.repeat(3 - stars),
    `✅ ${G.correct} richtig · ❌ ${G.errors} Fehler · ⭐ ${G.score} Punkte`,
    `🔥 ${days} ${days === 1 ? 'Tag' : 'Tage'} in Folge${gift ? ` · 🎁 Tagesgeschenk ${EMOJI_OF[gift]}` : ''}`);
  Sound.play('record');
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
  G.balloons = []; G.golds = []; G.bullets = []; G.parts = []; G.texts = [];
  G.hero.dead = false;
  Sound.stopMusic();
  Sound.hush();
  $('hudButtons').classList.add('hidden');
  $('btnFire').classList.add('hidden');
  updateTitle();
  showOverlay('title');
}

function showOverlay(id) {
  for (const o of ['title', 'settings', 'album', 'parent', 'pause', 'over']) $(o).classList.toggle('hidden', o !== id);
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
  for (const b of bgBalloons) {
    b.y -= b.vy * dt;
    b.x += Math.sin(G.time * 0.8 + b.ph) * 8 * dt;
    if (b.y < -50) Object.assign(b, newBgBalloon(false));
  }
  birdTimer -= dt;
  if (birdTimer <= 0) { birds.push({ x: W + 40, y: rand(70, 230), vx: 40 + Math.random() * 30, t: 0 }); birdTimer = 7 + Math.random() * 8; }
  for (const b of birds) { b.t += dt; b.x -= b.vx * dt; }
  while (birds.length && birds[0].x < -50) birds.shift();
  fireworkTimer -= dt;
  if (fireworkTimer <= 0) {
    const cx = rand(120, W - 120), cy = rand(120, 260), color = pick(CONFETTI), n = 24;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, v = 70 + Math.random() * 50;
      fireworks.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.5, max: 1.5, color });
    }
    fireworkTimer = 6 + Math.random() * 7;
  }
  for (const f of fireworks) { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.97; f.vy = f.vy * 0.97 + 30 * dt; f.life -= dt; }
  while (fireworks.length && fireworks[0].life <= 0) fireworks.shift();
  if (G.state !== 'play') return;

  const h = G.hero;
  if (!h.dead) {
    const dir = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (G.aim && (G.aim.state !== 'fly' || G.phase !== 'fly')) G.aim = null;
    if (dir) { h.targetY = null; G.aim = null; h.y += dir * HERO_SPEED * dt; }
    else {
      if (G.aim) h.targetY = G.aim.y;   // angetippten Ballon verfolgen
      if (h.targetY !== null) {
        const d = h.targetY - h.y, step = HERO_SPEED * 1.8 * dt;
        h.y += Math.abs(d) <= step ? d : Math.sign(d) * step;
      }
    }
    h.y = clamp(h.y, HERO_MIN, HERO_MAX);
    h.cool -= dt;
    // Zielen per Antippen: schießen, sobald das Tier auf der Höhe des Ballons ist
    if (G.aim && Math.abs(h.y - G.aim.y) < 16 && h.cool <= 0) { G.aim = null; shoot(); }
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
      } else b.x -= G.speed * b.spd * dt;
      b.y = b.baseY + Math.sin(b.t * b.freq) * b.amp + Math.sin(b.t * 0.7 + b.ph) * b.wob;
    } else if (b.state === 'flee') {
      b.y -= 260 * dt;
      b.x += Math.sin(b.t * 3) * 20 * dt;
      b.alpha -= dt * 1.1;
    } else if (b.state === 'fade') {
      b.y -= 60 * dt;
      b.alpha -= dt * 1.5;
    } else if (b.state === 'show') {
      b.y = b.baseY + Math.sin(b.t * b.freq) * b.amp;
    }
  }

  for (const g of G.golds) {
    g.t += dt;
    g.x -= 70 * dt;
    g.y = g.baseY + Math.sin(g.t * 2) * 12;
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
  // Geschenk-Ballons zählen in jeder Phase; enge Hitbox, damit sie keine Schüsse auf Buchstaben-Ballons stehlen
  for (const bu of G.bullets)
    for (const g of G.golds)
      if (g.state === 'fly' && !bu.hit && bu.x > g.x - BALLOON_RX - 8 && bu.x < g.x + BALLOON_RX && Math.abs(bu.y - g.y) < 48) { bu.hit = true; hitGold(g); }
  G.golds = G.golds.filter(g => g.state === 'fly' && g.x > -70);
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

// Emojis kommen als Bilder aus emoji/ (Noto Emoji), damit sie auf jedem Gerät gleich aussehen.
// Flugtexte werden einmal in ein kleines Bild gezeichnet und danach nur noch kopiert.
let spriteScale = 1;

function resize() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  spriteScale = canvas.width / W;
}

// Zeichenfläche für ein Sprite; als ImageBitmap lässt es sich am schnellsten kopieren
function spriteCanvas(w, h) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
const toBitmap = c => (c.transferToImageBitmap ? c.transferToImageBitmap() : c);

// Bild eines Emojis; solange es lädt (oder fehlt), wird nichts gezeichnet
function emojiBitmap(e) {
  const key = emojiKey(e);
  let rec = emojiImages.get(key);
  if (!rec) {
    rec = { img: new Image(), ok: false };
    rec.img.onload = () => { rec.ok = true; };
    rec.img.onerror = () => emojiMissing.add(key);
    rec.img.src = `emoji/${key}.png`;
    emojiImages.set(key, rec);
  }
  return rec.ok ? rec.img : null;
}

function emoji(e, x, y, size, alpha = 1) {
  const img = emojiBitmap(e);
  if (!img) return;
  const d = size * 1.2;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x - d / 2, y - d / 2, d, d);
  ctx.globalAlpha = 1;
}

// Text mit eingestreuten Emojis (Flugtexte): Text als Schrift, Emojis als Bilder
function textSprite(text, color, size) {
  const s = spriteScale, font = `900 ${size * s}px ${TEXT_FONT}`, em = size * s * 1.15;
  ctx.font = font;
  const segs = [];
  let last = 0;
  for (const m of text.matchAll(EMOJI_RE)) {
    if (m.index > last) segs.push({ t: text.slice(last, m.index) });
    segs.push({ e: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ t: text.slice(last) });
  for (const g of segs) g.w = g.e ? em : ctx.measureText(g.t).width;
  const total = segs.reduce((sum, g) => sum + g.w, 0);
  const c = spriteCanvas(Math.ceil(total + 12 * s), Math.ceil(size * 1.5 * s));
  const g = c.getContext('2d');
  g.font = font;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.lineWidth = 5 * s;
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(40,10,60,0.7)';
  g.fillStyle = color;
  let x = 6 * s;
  for (const seg of segs) {
    if (seg.e) {
      const img = emojiBitmap(seg.e);
      if (img) g.drawImage(img, x, c.height / 2 - em / 2, em, em);
    } else {
      g.strokeText(seg.t, x, c.height / 2);
      g.fillText(seg.t, x, c.height / 2);
    }
    x += seg.w;
  }
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
  for (const f of fireworks) {
    ctx.globalAlpha = Math.max(0, f.life / f.max) * 0.75;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const p of props) emoji(p.emoji, p.x, p.y, p.size, p.alpha);
  // aufsteigende Hintergrund-Ballons
  for (const b of bgBalloons) {
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + b.r * 1.25);
    ctx.lineTo(b.x + Math.sin(G.time + b.ph) * 3, b.y + b.r * 3.2);
    ctx.stroke();
    ctx.fillStyle = b.c.base;
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, b.r, b.r * 1.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const b of birds) emoji('🐦', b.x, b.y + Math.sin(b.t * 4) * 7, 26, 0.65);
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
  // Seitenansicht-Emojis (🦄) schauen nach links und werden gespiegelt, damit sie auf die Ballons blicken
  ctx.save();
  ctx.translate(HERO_X, y);
  if (FACES_LEFT.includes(profileId)) ctx.scale(-1, 1);
  if (h.dead) ctx.rotate(-0.5);
  emoji(profileId, 0, 0, 70, h.dead ? 0.8 : 1);
  ctx.restore();
  if (h.dead) emoji('💫', HERO_X, y - 44, 34);
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
  if (b.gift) emoji('🎁', 0, 2, 50);
  else {
    ctx.font = `900 ${b.letter.length > 2 ? 40 : b.letter.length > 1 ? 50 : 64}px ${TEXT_FONT}`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8;
    ctx.strokeStyle = c.dark;
    ctx.strokeText(b.letter, 0, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(b.letter, 0, 4);
  }
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
      if (i >= t.from && i < t.from + t.len) {
        if (i === t.from) {
          // Lücke: bei Lauten ein breites Feld über alle fehlenden Buchstaben
          const gw = t.len * TILE_W + (t.len - 1) * TILE_GAP;
          ctx.fillStyle = solved ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.22)';
          roundRect(x, cy - 33, gw, 66, 12);
          ctx.fill();
          if (!solved) {
            ctx.strokeStyle = `rgba(255,216,79,${0.6 + Math.sin(G.time * 6) * 0.4})`;
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.fillStyle = '#ffd84f';
            ctx.fillText('?', x + gw / 2, cy + 3);
          }
        }
        if (solved) {
          ctx.fillStyle = color;
          ctx.fillText(t.word[i], cx, cy + 3);
        }
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillText(t.word[i], cx, cy + 3);
      }
    }
    // Lautsprecher-Hinweis: Antippen spricht das Wort
    emoji('🔈', px + panelW - 22, py + 22, 17, 0.7);
  }
  ctx.textAlign = 'left';
  ctx.font = `900 30px ${TEXT_FONT}`;
  if (G.mode === 'daily') {
    // Fortschritt der Tagesrunde statt Herzen
    emoji('📅', 35, 38, 30);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${Math.min(G.done + 1, DAILY_N)}/${DAILY_N}`, 58, 40);
  } else {
    for (let i = 0; i < Math.max(START_HEARTS, G.hearts); i++)
      emoji('❤️', 35 + i * 36, 38, 30, i < G.hearts ? 1 : 0.2);
  }
  // Punkte und Serie
  emoji('⭐', 35, 80, 28);
  ctx.fillStyle = '#ffd84f';
  ctx.fillText(String(G.score), 56, 82);
  if (G.streak >= 3) {
    emoji('🔥', 165, 80, 26);
    ctx.fillStyle = '#ff9f4f';
    ctx.fillText(String(G.streak), 184, 82);
  }
  if (G.mode === 'free' && P.auto) {
    ctx.font = `900 20px ${TEXT_FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    emoji('🎓', 40, 118, 17);
    ctx.fillText(`Stufe ${P.level}`, 56, 118);
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
  for (const g of G.golds) drawBalloon(g);
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
  for (const b of document.querySelectorAll('.avatar')) b.setAttribute('aria-pressed', b.dataset.av === profileId);
  const d = P.daily, today = dateKey();
  const streak = d.last === today || d.last === yesterdayKey() ? d.streak : 0;
  const days = streak > 1 ? ` · 🔥 ${streak} Tage` : '';
  $('titleDaily').textContent = d.last === today ? `📅 Heute geschafft ${'⭐'.repeat(d.stars)}${days}` : `📅 Tagesrunde wartet${days}`;
  $('titleBest').textContent = `🏆 Rekord: ${P.hs[hsKey()] || 0}`;
  $('btnAlbum').textContent = `📒 Sticker ${P.stickers.length}/${WORDS.length}`;
}

function updateSettings() {
  $('btnAuto').setAttribute('aria-pressed', P.auto);
  $('btnSpeak').setAttribute('aria-pressed', P.speak);
  for (const b of document.querySelectorAll('[data-gap]')) b.setAttribute('aria-pressed', P.gaps.includes(b.dataset.gap));
  for (const b of document.querySelectorAll('[data-len]')) b.setAttribute('aria-pressed', P.lens.includes(b.dataset.len));
  $('gapGroup').classList.toggle('dim', P.auto);
  $('lenGroup').classList.toggle('dim', P.auto);
  $('levelInfo').textContent = P.auto
    ? `Stufe ${P.level} von ${LEVELS.length} – wird leichter oder schwerer, je nach Können.`
    : 'Eigene Auswahl: Lücke und Wortlänge bleiben, wie eingestellt.';
}

// Mehrfachauswahl, mindestens ein Eintrag bleibt gewählt; eine eigene Wahl schaltet die Automatik aus
function bindMulti(attr, list) {
  for (const b of document.querySelectorAll(`[data-${attr}]`)) {
    b.addEventListener('click', () => {
      const v = b.dataset[attr], on = P[list].includes(v);
      if (on && P[list].length === 1) {
        b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
        Sound.play('deny');
        return;
      }
      P[list] = on ? P[list].filter(x => x !== v) : P[list].concat(v);
      P.auto = false;
      saveProfile();
      Sound.play('click');
      updateSettings();
    });
  }
}
bindMulti('gap', 'gaps');
bindMulti('len', 'lens');

$('btnAuto').addEventListener('click', () => { P.auto = !P.auto; saveProfile(); Sound.play('click'); updateSettings(); });
$('btnSpeak').addEventListener('click', () => {
  P.speak = !P.speak;
  saveProfile();
  Sound.play('click');
  if (P.speak) Sound.say('KATZE');
  updateSettings();
});

for (const av of AVATARS) {
  const b = document.createElement('button');
  b.className = 'chip avatar';
  b.dataset.av = av;
  b.textContent = av;
  b.setAttribute('aria-label', `Spieler ${av}`);
  b.addEventListener('click', () => { loadProfile(av); Sound.play('click'); updateTitle(); updateSettings(); });
  $('avatarRow').appendChild(b);
}

let albumCat = 'all';
function renderAlbum() {
  $('albumTitle').textContent = `📒 Meine Sticker ${P.stickers.length}/${WORDS.length}`;
  const have = list => list.filter(([w]) => P.stickers.includes(w)).length;
  // Themen-Seiten: eine volle Seite bekommt einen goldenen Rahmen
  const tabs = $('albumTabs');
  tabs.textContent = '';
  const tab = (id, icon, name, list) => {
    const got = have(list), full = got === list.length;
    const b = document.createElement('button');
    b.className = full && id !== 'all' ? 'chip small done' : 'chip small';
    b.textContent = `${icon} ${name} ${got}/${list.length}${full && id !== 'all' ? ' ⭐' : ''}`;
    b.setAttribute('aria-pressed', albumCat === id);
    b.addEventListener('click', () => { albumCat = id; Sound.play('click'); renderAlbum(); });
    tabs.appendChild(b);
  };
  tab('all', '📒', 'Alle', WORDS);
  for (const g of GROUPS) tab(g.id, g.icon, g.name, g.words);
  const group = GROUPS.find(g => g.id === albumCat);
  const grid = $('albumGrid');
  grid.textContent = '';
  for (const [word, emojiChar] of group ? group.words : WORDS) {
    const got = P.stickers.includes(word);
    const full = GROUPS.find(g => g.id === GROUP_OF[word]).words.every(([w]) => P.stickers.includes(w));
    const tile = document.createElement('button'), e = document.createElement('span'), name = document.createElement('small');
    tile.className = (got ? 'stk' : 'stk locked') + (full ? ' gold' : '');
    e.textContent = emojiChar;
    name.textContent = got ? word : '?';
    tile.append(e, name);
    if (got) tile.addEventListener('click', () => Sound.say(word));   // Antippen spricht das Wort
    grid.appendChild(tile);
  }
}

// ---------- Eltern-Ansicht ----------
// Pro Buchstabe/Laut: Sicherheit (rot → grün), richtig/versucht, dazu die häufigsten Verwechslungen
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'Ä', 'Ö', 'Ü'];
let resetArmed = null;
function renderParent() {
  $('parentTitle').textContent = `👪 Lernstand ${profileId}`;
  const d = P.daily, streak = d.last === dateKey() || d.last === yesterdayKey() ? d.streak : 0;
  $('parentInfo').textContent = `${P.auto ? `Stufe ${P.level} von ${LEVELS.length}` : 'Eigene Auswahl'} · 📒 ${P.stickers.length}/${WORDS.length} Sticker · 🔥 ${streak} Tage in Folge`;
  const grid = $('parentGrid');
  grid.textContent = '';
  for (const k of LETTERS.concat('|', Object.keys(SOUND_ALT))) {   // Laute immer zeigen, auch ungespielte, in eigener Reihe
    if (k === '|') { const br = document.createElement('div'); br.className = 'pbreak'; grid.appendChild(br); continue; }
    const c = P.counts[k], tile = document.createElement('div'), big = document.createElement('b'), small = document.createElement('small');
    tile.className = k.length > 1 ? 'ptile wide' : 'ptile';
    tile.style.background = c ? `hsl(${Math.round(mastery(k) * 120)} 55% 30%)` : 'rgba(255,255,255,0.1)';
    big.textContent = k;
    small.textContent = c ? `${c[1]}/${c[0]}` : '–';
    tile.append(big, small);
    grid.appendChild(tile);
  }
  const top = Object.entries(P.confN).sort((a, b) => b[1] - a[1]).slice(0, 6);
  $('parentConf').textContent = top.length
    ? `Oft verwechselt (gesucht → gewählt): ${top.map(([k, n]) => `${k.replace('>', '→')} ${n}×`).join(' · ')}`
    : 'Noch keine Verwechslungen aufgezeichnet.';
  $('btnReset').textContent = '🗑️ Profil zurücksetzen';
  resetArmed = null;
}

// ---------- Eingabe ----------
$('btnStart').addEventListener('click', () => startGame('free'));
$('btnDaily').addEventListener('click', () => startGame('daily'));
$('btnAgain').addEventListener('click', () => startGame(G.mode));
$('btnSettings').addEventListener('click', () => { updateSettings(); showOverlay('settings'); });
$('btnSettingsBack').addEventListener('click', () => { updateTitle(); showOverlay('title'); });
$('btnAlbum').addEventListener('click', () => { renderAlbum(); showOverlay('album'); });
$('btnAlbumBack').addEventListener('click', () => showOverlay('title'));
$('btnParent').addEventListener('click', () => { renderParent(); showOverlay('parent'); });
$('btnParentBack').addEventListener('click', () => { updateSettings(); showOverlay('settings'); });
// Zurücksetzen braucht zwei Antipper hintereinander, damit es nicht versehentlich passiert
$('btnReset').addEventListener('click', () => {
  if (!resetArmed) {
    $('btnReset').textContent = '⚠️ Wirklich löschen? Nochmal tippen';
    resetArmed = setTimeout(() => { resetArmed = null; $('btnReset').textContent = '🗑️ Profil zurücksetzen'; }, 4000);
    return;
  }
  clearTimeout(resetArmed);
  resetArmed = null;
  try { localStorage.removeItem(profileKey(profileId)); } catch (e) { /* egal */ }
  loadProfile(profileId);
  updateTitle();
  updateSettings();
  showOverlay('title');
});
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
  // Einstellungen und Album liegen über dem Titel: Tasten dürfen dort kein Spiel starten
  const onTitle = G.state === 'title' && !$('title').classList.contains('hidden');
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (G.state === 'play') pause(); else if (G.state === 'paused') resume();
    else if (G.state === 'title' && !onTitle) { updateTitle(); showOverlay('title'); }
  }
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    if (onTitle) startGame('free');
    else if (G.state === 'paused') resume();
    else if (G.state === 'over' && performance.now() - G.overAt > 700) startGame(G.mode);
  }
  if (e.code === 'Space' && onTitle) startGame('free');
});

window.addEventListener('keyup', e => {
  if (KEYS_UP.includes(e.code)) input.up = false;
  if (KEYS_DOWN.includes(e.code)) input.down = false;
  if (KEYS_FIRE.includes(e.code)) input.keyFire = false;
});

// Ballon antippen/anklicken = Tier zielt und schießt automatisch.
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
function goldAt(x, y) {
  if (x < HERO_X + 70) return null;
  return G.golds.find(g => g.state === 'fly' && Math.hypot(x - g.x, y - g.y) < 60) || null;
}
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
  const target = G.hero.dead ? null : goldAt(pointerX(e), pointerY(e)) || balloonAt(pointerX(e), pointerY(e));
  if (target) {
    G.aim = target;
    G.hero.targetY = target.y;
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
  else if (e.pointerType === 'mouse') canvas.style.cursor = goldAt(pointerX(e), pointerY(e)) || balloonAt(pointerX(e), pointerY(e)) ? 'pointer' : 'crosshair';
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
if (document.fonts) { document.fonts.load('900 40px Andika'); document.fonts.load('400 20px Andika'); }
// Emoji-Bilder vorladen (Wörter, Oberfläche) und Emojis in Seitentexten ersetzen, auch wenn sie später gesetzt werden
for (const [, e] of WORDS) emojiBitmap(e);
for (const e of ['🎡', '🎠', '🎪', '☁️', '❤️', '⭐', '🔥', '🌟', '✨', '💨', '🎁', '💫', '🔈', '🎓', ...AVATARS]) emojiBitmap(e);
new MutationObserver(muts => {
  for (const m of muts) for (const n of m.addedNodes) {
    if (n.nodeType === Node.TEXT_NODE) { if (n.parentNode) emojify(n.parentNode); } else if (n.nodeType === Node.ELEMENT_NODE) emojify(n);
  }
}).observe(document.body, { childList: true, subtree: true });
emojify(document.body);

loadProfile(profileId);
resize();
updateTitle();
updateSettings();
requestAnimationFrame(frame);
