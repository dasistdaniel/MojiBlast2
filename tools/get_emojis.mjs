// Lädt die im Spiel verwendeten Emojis als PNG (Noto Emoji von Google, Apache 2.0) nach emoji/.
// Damit sehen die Bilder auf jedem Gerät gleich aus. Aufruf im Projektordner: node tools/get_emojis.mjs
import fs from 'node:fs';

const CDN = 'https://fonts.gstatic.com/s/e/notoemoji/latest';
const LICENSE = 'https://raw.githubusercontent.com/googlefonts/noto-emoji/main/third_party/color_emoji/LICENSE';
// Spielfiguren und große Kulissen werden größer gezeichnet: dafür 512 px statt 128 px
const BIG = new Set(['🦊', '🐻', '🐱', '🐰', '🐼', '🦄', '🎡', '🎠', '🎪']);
const SOURCES = ['index.html', 'game.js', 'words.js', 'audio.js'];
const SKIP = new Set(['↔']);                         // nur in Kommentaren
const RE = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu;

const found = new Set();
for (const f of SOURCES) for (const m of fs.readFileSync(f, 'utf8').matchAll(RE)) if (!SKIP.has(m[0])) found.add(m[0]);

const cps = e => [...e].map(c => c.codePointAt(0));
const hex = list => list.map(n => n.toString(16)).join('_');
fs.mkdirSync('emoji', { recursive: true });

const keys = [];
for (const e of found) {
  const key = cps(e).filter(n => n !== 0xfe0f).map(n => n.toString(16)).join('-');
  const out = `emoji/${key}.png`;
  if (!fs.existsSync(out)) {
    // mit und ohne Varianten-Selektor (fe0f) versuchen
    const names = [hex(cps(e).filter(n => n !== 0xfe0f)), hex(cps(e))];
    let ok = false;
    for (const n of new Set(names)) {
      const res = await fetch(`${CDN}/${n}/${BIG.has(e) ? 512 : 128}.png`);
      if (res.ok) { fs.writeFileSync(out, Buffer.from(await res.arrayBuffer())); ok = true; break; }
    }
    if (!ok) { console.warn('fehlt:', e, key); continue; }
  }
  keys.push(key);
}
fs.writeFileSync('emoji/list.json', JSON.stringify(keys.sort()) + '\n');
if (!fs.existsSync('emoji/LICENSE')) fs.writeFileSync('emoji/LICENSE', Buffer.from(await (await fetch(LICENSE)).arrayBuffer()));
console.log(keys.length, 'Emojis');
