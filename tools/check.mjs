// Prüft Wortliste, Dateien und Aufgabenlogik. Aufruf im Projektordner: node tools/check.mjs
// Läuft auch als Pre-Commit-Hook (.githooks/pre-commit) und bricht bei Fehlern ab.
import fs from 'node:fs';
import vm from 'node:vm';

const errors = [];
const fail = msg => errors.push(msg);
const exists = f => fs.existsSync(f);

// words.js ist reine Daten/Logik (läuft auch im Service Worker) und lässt sich daher einzeln laden
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('words.js', 'utf8') + '\n;this.api = { WORDS, GROUPS, GROUP_OF, WORDSET, gapSpans, makeDistractors, lengthClass, wordAudio, SOUND_ALT, SOUND_RE };', ctx);
const { WORDS, GROUPS, GROUP_OF, WORDSET, gapSpans, makeDistractors, lengthClass, wordAudio, SOUND_ALT } = ctx.api;

const RE = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu;
const emojiKey = e => [...e].map(c => c.codePointAt(0)).filter(cp => cp !== 0xfe0f).map(cp => cp.toString(16)).join('-');

// ---- Wörter ----
const seen = new Set();
for (const [word, emoji] of WORDS) {
  if (!/^[A-ZÄÖÜ]{2,}$/.test(word)) fail(`Wort nicht in GROSSBUCHSTABEN: ${word}`);
  if (seen.has(word)) fail(`Wort doppelt: ${word}`);
  seen.add(word);
  if (!emoji || [...emoji.matchAll(RE)].length !== 1) fail(`${word}: genau ein Emoji erwartet (${emoji})`);
  if (!exists(wordAudio(word))) fail(`${word}: Aufnahme fehlt (${wordAudio(word)}) – python tools/gen_voice.py`);
  if (!exists(`emoji/${emojiKey(emoji)}.png`)) fail(`${word}: Emoji-Bild fehlt (${emoji}) – node tools/get_emojis.mjs`);
  if (!GROUP_OF[word]) fail(`${word}: keinem Thema zugeordnet`);
}
if (WORDS.length !== WORDSET.size) fail('WORDSET passt nicht zu WORDS');
for (const g of GROUPS) if (!g.words.length) fail(`Thema ${g.id} ist leer`);

// ---- genug Wörter je Modus ----
for (const gaps of [['start'], ['mid'], ['end'], ['sound'], ['start', 'mid', 'end', 'sound']])
  for (const len of ['short', 'medium', 'long']) {
    const n = WORDS.filter(([w]) => lengthClass(w) === len && gapSpans(w, gaps).length).length;
    if (n < 5) fail(`Zu wenige Wörter für ${gaps.join('+')} / ${len}: ${n}`);
  }

// ---- falsche Antworten: immer zwei, verschieden, nie ein zweites gültiges Wort ----
let tasks = 0;
for (const [word] of WORDS) {
  for (const { from, len } of gapSpans(word, ['start', 'mid', 'end', 'sound'])) {
    const answer = word.slice(from, from + len);
    for (let i = 0; i < 12; i++) {
      const prefer = i % 3 === 0 ? ['Q', 'X', 'ST'] : i % 3 === 1 ? ['B', 'D'] : [];
      const d = makeDistractors(word, from, len, prefer);
      tasks++;
      if (d.length !== 2 || d[0] === d[1] || d.includes(answer)) { fail(`${word}[${from},${len}]: falsche Antworten ${JSON.stringify(d)}`); break; }
      if (d.some(c => WORDSET.has(word.slice(0, from) + c + word.slice(from + len)))) { fail(`${word}[${from},${len}]: Antwort ergibt ein zweites Wort ${JSON.stringify(d)}`); break; }
    }
  }
}
for (const [word] of WORDS) for (const m of word.matchAll(ctx.api.SOUND_RE)) if (!SOUND_ALT[m[0]]) fail(`${word}: keine Ersatz-Laute für ${m[0]}`);

// ---- Emoji-Bilder: alles, was im Code vorkommt, hat eine Datei ----
const list = JSON.parse(fs.readFileSync('emoji/list.json', 'utf8'));
for (const k of list) if (!exists(`emoji/${k}.png`)) fail(`emoji/list.json nennt fehlende Datei: ${k}`);
for (const f of ['index.html', 'game.js', 'words.js', 'audio.js'])
  for (const m of fs.readFileSync(f, 'utf8').matchAll(RE)) {
    if (m[0] === '↔') continue;               // nur in Kommentaren
    if (!list.includes(emojiKey(m[0]))) fail(`${f}: Emoji ${m[0]} fehlt in emoji/ – node tools/get_emojis.mjs`);
  }

// ---- Dateien, die index.html und der Service Worker brauchen ----
const html = fs.readFileSync('index.html', 'utf8');
for (const m of html.matchAll(/(?:src|href)="([^":?]+)(?:\?[^"]*)?"/g)) if (!m[1].startsWith('data') && !exists(m[1])) fail(`index.html verweist auf fehlende Datei: ${m[1]}`);
const sw = fs.readFileSync('sw.js', 'utf8');
const filesBlock = sw.slice(sw.indexOf('const FILES = ['), sw.indexOf('];', sw.indexOf('const FILES = [')));
for (const m of filesBlock.matchAll(/'([^']+)'/g)) if (m[1] !== './' && !exists(m[1])) fail(`sw.js: Datei fehlt: ${m[1]}`);
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
for (const i of manifest.icons) if (!exists(i.src)) fail(`manifest.json: Icon fehlt: ${i.src}`);

if (errors.length) {
  console.error(`✗ ${errors.length} Problem(e):\n` + errors.map(e => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log(`✓ ${WORDS.length} Wörter in ${GROUPS.length} Themen, ${tasks} Aufgaben geprüft, ${list.length} Emoji-Bilder, alle Dateien vorhanden`);
