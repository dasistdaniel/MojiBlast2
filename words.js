'use strict';
// MojiBlast 2 – Wortliste: [Wort in GROSSBUCHSTABEN, Emoji]
// Nur eindeutige Bilder, die auch auf älteren Geräten dargestellt werden.

// Wörter nach Themen: Das Stickeralbum zeigt pro Thema eine Seite
const GROUPS = [
  {
    id: 'tiere', name: 'Tiere', icon: '🐘',
    words: [
      ['KUH', '🐄'], ['BÄR', '🐻'], ['HUND', '🐶'], ['KATZE', '🐱'], ['MAUS', '🐭'], ['HASE', '🐰'],
      ['FUCHS', '🦊'], ['PFERD', '🐴'], ['SCHAF', '🐑'], ['ZIEGE', '🐐'], ['HAHN', '🐓'], ['HUHN', '🐔'],
      ['ENTE', '🦆'], ['EULE', '🦉'], ['ADLER', '🦅'], ['FISCH', '🐟'], ['HAI', '🦈'], ['WAL', '🐳'],
      ['KRABBE', '🦀'], ['FROSCH', '🐸'], ['SCHLANGE', '🐍'], ['AFFE', '🐒'], ['LÖWE', '🦁'], ['TIGER', '🐯'],
      ['ELEFANT', '🐘'], ['GIRAFFE', '🦒'], ['ZEBRA', '🦓'], ['PANDA', '🐼'], ['IGEL', '🦔'], ['BIENE', '🐝'],
      ['SCHNECKE', '🐌'], ['SPINNE', '🕷️'], ['PINGUIN', '🐧'], ['SCHWEIN', '🐷'], ['DELFIN', '🐬'], ['OKTOPUS', '🐙'],
      ['KÄNGURU', '🦘'], ['KAMEL', '🐫'], ['RATTE', '🐀'], ['KROKODIL', '🐊'], ['DINO', '🦖'], ['DRACHE', '🐉'],
      ['EINHORN', '🦄'],
    ],
  },
  {
    id: 'essen', name: 'Essen', icon: '🍎',
    words: [
      ['APFEL', '🍎'], ['BIRNE', '🍐'], ['BANANE', '🍌'], ['KIRSCHE', '🍒'], ['ERDBEERE', '🍓'], ['TRAUBE', '🍇'],
      ['MELONE', '🍉'], ['ZITRONE', '🍋'], ['ORANGE', '🍊'], ['PIZZA', '🍕'], ['BROT', '🍞'], ['KÄSE', '🧀'],
      ['EIS', '🍦'], ['KEKS', '🍪'], ['TORTE', '🎂'], ['KUCHEN', '🍰'], ['MILCH', '🥛'], ['TOMATE', '🍅'],
      ['KAROTTE', '🥕'], ['MAIS', '🌽'], ['PILZ', '🍄'], ['NUDELN', '🍝'], ['HONIG', '🍯'], ['POPCORN', '🍿'],
      ['BONBON', '🍬'], ['ANANAS', '🍍'], ['KIWI', '🥝'],
    ],
  },
  {
    id: 'fahrzeuge', name: 'Fahrzeuge', icon: '🚗',
    words: [
      ['AUTO', '🚗'], ['BUS', '🚌'], ['ZUG', '🚂'], ['BOOT', '⛵'], ['FLUGZEUG', '✈️'], ['RAKETE', '🚀'],
      ['FAHRRAD', '🚲'], ['TRAKTOR', '🚜'],
    ],
  },
  {
    id: 'natur', name: 'Natur', icon: '🌳',
    words: [
      ['BAUM', '🌳'], ['TULPE', '🌷'], ['ROSE', '🌹'], ['SONNE', '☀️'], ['MOND', '🌙'], ['STERN', '⭐'],
      ['WOLKE', '☁️'], ['BLITZ', '⚡'], ['FEUER', '🔥'], ['BLUME', '🌸'],
    ],
  },
  {
    id: 'dinge', name: 'Dinge', icon: '🎸',
    words: [
      ['HAUS', '🏠'], ['BURG', '🏰'], ['ZELT', '⛺'], ['BALL', '⚽'], ['BUCH', '📖'], ['STIFT', '✏️'],
      ['SCHERE', '✂️'], ['KRONE', '👑'], ['GITARRE', '🎸'], ['TROMMEL', '🥁'], ['GESCHENK', '🎁'], ['BALLON', '🎈'],
      ['BRILLE', '👓'], ['HUT', '🎩'], ['SOCKE', '🧦'], ['SCHUH', '👟'], ['HOSE', '👖'], ['KLEID', '👗'],
      ['HERZ', '❤️'], ['KERZE', '🕯️'], ['TELEFON', '📞'], ['KAMERA', '📷'], ['GLOCKE', '🔔'], ['BESEN', '🧹'],
      ['ROBOTER', '🤖'], ['GEIST', '👻'], ['BETT', '🛏️'],
    ],
  },
  {
    id: 'koerper', name: 'Körper', icon: '✋',
    words: [
      ['ZAHN', '🦷'], ['NASE', '👃'], ['MUND', '👄'], ['OHR', '👂'], ['AUGE', '👁️'], ['HAND', '✋'],
    ],
  },
];
const WORDS = GROUPS.flatMap(g => g.words);
const GROUP_OF = Object.fromEntries(GROUPS.flatMap(g => g.words.map(([w]) => [w, g.id])));

// Buchstabenpaare, die Kinder gern verwechseln – daraus kommen die falschen Ballons
const CONFUSABLE = ['BDPQ', 'MNW', 'EF', 'ILJ', 'OQ', 'UVW', 'GC', 'SZ', 'TF', 'HK', 'AÄ', 'OÖ', 'UÜ'];
const VOWELS = 'AEIOU';
const CONSONANTS = 'BDFGHKLMNPRSTWZ';

const WORDSET = new Set(WORDS.map(w => w[0]));

// Buchstaben, die zusammen einen Laut bilden (SCH, AU, EI, …) oder doppelt stehen, werden nicht einzeln abgefragt
function blockedIndices(word) {
  const blocked = new Set();
  const re = /SCH|CH|CK|PF|QU|AU|EU|EI|IE|ÄU|NG|TZ|PH|TH|(.)\1/g;
  let m;
  while ((m = re.exec(word))) for (let i = m.index; i < m.index + m[0].length; i++) blocked.add(i);
  return blocked;
}

// Lückenpositionen eines Wortes für die gewählten Lückenarten ('start' | 'mid' | 'end')
function gapPositions(word, gaps) {
  const blocked = blockedIndices(word), last = word.length - 1, out = [];
  for (let i = 0; i <= last; i++) {
    if (blocked.has(i)) continue;
    const kind = i === 0 ? 'start' : i === last ? 'end' : 'mid';
    if (gaps.includes(kind)) out.push(i);
  }
  return out;
}

const lengthClass = word => (word.length <= 4 ? 'short' : word.length <= 6 ? 'medium' : 'long');

// Laute aus mehreren Buchstaben: im Modus „Laute“ fehlt der ganze Laut (SCH, AU, EI …)
const SOUND_RE = /SCH|CH|CK|PF|AU|EU|EI|IE|ÄU|TZ/g;
const SOUND_ALT = {
  SCH: ['CH', 'SP', 'ST', 'S'], CH: ['SCH', 'K', 'CK', 'G'], CK: ['K', 'CH', 'G'], PF: ['F', 'P', 'PH'],
  AU: ['EU', 'EI', 'AI'], EU: ['AU', 'EI', 'ÄU'], EI: ['IE', 'AU', 'EU', 'AI'], IE: ['EI', 'I', 'EE'],
  'ÄU': ['EU', 'AU', 'EI'], TZ: ['Z', 'ZZ', 'TS'],
};

// Lücken eines Wortes als { from, len }: einzelne Buchstaben (Anfang/Mitte/Ende) und/oder ganze Laute
function gapSpans(word, gaps) {
  const out = gapPositions(word, gaps.filter(g => g !== 'sound')).map(i => ({ from: i, len: 1 }));
  if (gaps.includes('sound')) for (const m of word.matchAll(SOUND_RE)) out.push({ from: m.index, len: m[0].length });
  return out;
}

const shuffleList = a => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Zwei falsche Antworten: bei Buchstaben Vokal ↔ Vokal bzw. verwechselbare Paare (B/D, M/N …), bei Lauten ähnliche Laute.
// prefer: früher verwechselte Antworten, die bevorzugt wieder auftauchen. Nie eine Antwort, die ein zweites Wort ergibt.
function makeDistractors(word, from, len, prefer = []) {
  const answer = word.slice(from, from + len);
  const pool = [];
  if (len > 1) pool.push(...(SOUND_ALT[answer] || []));
  else {
    const base = answer === 'Ä' ? 'A' : answer === 'Ö' ? 'O' : answer === 'Ü' ? 'U' : answer;
    if (VOWELS.includes(base)) pool.push(...VOWELS);
    else {
      for (const g of CONFUSABLE) if (g.includes(base)) pool.push(...g, ...g);
      pool.push(...CONSONANTS);
    }
  }
  const out = [];
  for (const c of prefer.slice(0, 1).concat(shuffleList(pool))) {
    if (c === answer || out.includes(c)) continue;
    if (len === 1 && c === (answer === 'Ä' ? 'A' : answer === 'Ö' ? 'O' : answer === 'Ü' ? 'U' : answer)) continue;
    if (WORDSET.has(word.slice(0, from) + c + word.slice(from + len))) continue;
    out.push(c);
    if (out.length === 2) break;
  }
  return out;
}

// Sprachdatei eines Wortes (erzeugt mit tools/gen_voice.py)
const wordAudio = word => `audio/words/${word.toLowerCase().replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue')}.mp3`;
