'use strict';
// MojiBlast 2 – Wortliste: [Wort in GROSSBUCHSTABEN, Emoji]
// Nur eindeutige Bilder, die auch auf älteren Geräten dargestellt werden.

const WORDS = [
  // Tiere
  ['KUH', '🐄'], ['BÄR', '🐻'], ['HUND', '🐶'], ['KATZE', '🐱'], ['MAUS', '🐭'], ['HASE', '🐰'],
  ['FUCHS', '🦊'], ['PFERD', '🐴'], ['SCHAF', '🐑'], ['ZIEGE', '🐐'], ['HAHN', '🐓'], ['HUHN', '🐔'],
  ['ENTE', '🦆'], ['EULE', '🦉'], ['ADLER', '🦅'], ['FISCH', '🐟'], ['HAI', '🦈'], ['WAL', '🐳'],
  ['KRABBE', '🦀'], ['FROSCH', '🐸'], ['SCHLANGE', '🐍'], ['AFFE', '🐒'], ['LÖWE', '🦁'], ['TIGER', '🐯'],
  ['ELEFANT', '🐘'], ['GIRAFFE', '🦒'], ['ZEBRA', '🦓'], ['PANDA', '🐼'], ['IGEL', '🦔'], ['BIENE', '🐝'],
  ['SCHNECKE', '🐌'], ['SPINNE', '🕷️'], ['PINGUIN', '🐧'], ['SCHWEIN', '🐷'], ['DELFIN', '🐬'], ['OKTOPUS', '🐙'],
  ['KÄNGURU', '🦘'], ['KAMEL', '🐫'], ['RATTE', '🐀'], ['KROKODIL', '🐊'], ['DINO', '🦖'], ['DRACHE', '🐉'],
  ['EINHORN', '🦄'],
  // Essen & Trinken
  ['APFEL', '🍎'], ['BIRNE', '🍐'], ['BANANE', '🍌'], ['KIRSCHE', '🍒'], ['ERDBEERE', '🍓'], ['TRAUBE', '🍇'],
  ['MELONE', '🍉'], ['ZITRONE', '🍋'], ['ORANGE', '🍊'], ['PIZZA', '🍕'], ['BROT', '🍞'], ['KÄSE', '🧀'],
  ['EIS', '🍦'], ['KEKS', '🍪'], ['TORTE', '🎂'], ['KUCHEN', '🍰'], ['MILCH', '🥛'], ['TOMATE', '🍅'],
  ['KAROTTE', '🥕'], ['MAIS', '🌽'], ['PILZ', '🍄'], ['NUDELN', '🍝'], ['HONIG', '🍯'], ['POPCORN', '🍿'],
  ['BONBON', '🍬'], ['ANANAS', '🍍'], ['KIWI', '🥝'],
  // Fahrzeuge
  ['AUTO', '🚗'], ['BUS', '🚌'], ['ZUG', '🚂'], ['BOOT', '⛵'], ['FLUGZEUG', '✈️'], ['RAKETE', '🚀'],
  ['FAHRRAD', '🚲'], ['TRAKTOR', '🚜'],
  // Natur & Wetter
  ['BAUM', '🌳'], ['TULPE', '🌷'], ['ROSE', '🌹'], ['SONNE', '☀️'], ['MOND', '🌙'], ['STERN', '⭐'],
  ['WOLKE', '☁️'], ['BLITZ', '⚡'], ['FEUER', '🔥'], ['BLUME', '🌸'],
  // Dinge
  ['HAUS', '🏠'], ['BURG', '🏰'], ['ZELT', '⛺'], ['BALL', '⚽'], ['BUCH', '📖'], ['STIFT', '✏️'],
  ['SCHERE', '✂️'], ['KRONE', '👑'], ['GITARRE', '🎸'], ['TROMMEL', '🥁'], ['GESCHENK', '🎁'], ['BALLON', '🎈'],
  ['BRILLE', '👓'], ['HUT', '🎩'], ['SOCKE', '🧦'], ['SCHUH', '👟'], ['HOSE', '👖'], ['KLEID', '👗'],
  ['HERZ', '❤️'], ['KERZE', '🕯️'], ['TELEFON', '📞'], ['KAMERA', '📷'], ['GLOCKE', '🔔'], ['BESEN', '🧹'],
  ['ROBOTER', '🤖'], ['GEIST', '👻'], ['BETT', '🛏️'],
  // Körper
  ['ZAHN', '🦷'], ['NASE', '👃'], ['MUND', '👄'], ['OHR', '👂'], ['AUGE', '👁️'], ['HAND', '✋'],
];

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

// Sprachdatei eines Wortes (erzeugt mit tools/gen_voice.py)
const wordAudio = word => `audio/words/${word.toLowerCase().replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue')}.mp3`;
