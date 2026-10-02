'use strict';
// MojiBlast 2 – Ton: Soundeffekte, Jahrmarkt-Orgelmusik und Sprachausgabe der Wörter.
// Alles wird per WebAudio / Browser-Sprachausgabe erzeugt (keine Dateien).

const Sound = (() => {
  let ac = null, noiseBuf = null, muted = false;
  let master = null, sfxBus = null, musicBus = null, echo = null;
  try { muted = localStorage.getItem('mojiBlast2.muted') === '1'; } catch (e) { /* egal */ }

  // ---------- Grundgerüst ----------
  function audio() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ac.destination);
      sfxBus = gainTo(master, 1);
      musicBus = gainTo(master, 0.5);
      // Echo für die Melodie
      const d = ac.createDelay(1), fb = ac.createGain(), wet = ac.createGain(), lp = ac.createBiquadFilter();
      d.delayTime.value = 60 / BPM * 0.75; fb.gain.value = 0.25; wet.gain.value = 0.3;
      lp.type = 'lowpass'; lp.frequency.value = 2600;
      d.connect(lp).connect(fb).connect(d);
      lp.connect(wet).connect(musicBus);
      echo = d;
    }
    if (ac.state === 'suspended' && !document.hidden) ac.resume();
    return ac;
  }

  function gainTo(dest, v) {
    const g = ac.createGain();
    g.gain.value = v;
    g.connect(dest);
    return g;
  }

  function whiteNoise() {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  // ---------- Soundeffekte ----------
  function tone({ type = 'square', f0, f1 = f0, dur = 0.1, vol = 0.1, delay = 0 }) {
    const a = audio(); if (!a || muted) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise({ dur = 0.15, vol = 0.2, freq = 2000, delay = 0 }) {
    const a = audio(); if (!a || muted) return;
    const t = a.currentTime + delay;
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = whiteNoise();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(100, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(sfxBus);
    s.start(t); s.stop(t + dur + 0.02);
  }

  const arp = (notes, type, gap, dur, vol) =>
    notes.forEach((f, i) => tone({ type, f0: f, f1: f * 0.99, dur, vol, delay: i * gap }));

  const SFX = {
    laser:    () => { tone({ type: 'sine', f0: 400, f1: 1100, dur: 0.1, vol: 0.09 }); noise({ dur: 0.08, vol: 0.08, freq: 5000 }); },
    boom:     () => { noise({ dur: 0.09, vol: 0.4, freq: 7000 }); tone({ type: 'sine', f0: 700, f1: 160, dur: 0.07, vol: 0.14 }); },
    correct:  () => arp([523, 659, 784, 1047], 'triangle', 0.07, 0.2, 0.13),
    wrong:    () => { tone({ type: 'triangle', f0: 330, f1: 150, dur: 0.35, vol: 0.12 }); },
    shield:   () => { tone({ type: 'sine', f0: 700, f1: 260, dur: 0.3, vol: 0.12 }); },
    shieldup: () => arp([660, 880, 1320], 'sine', 0.08, 0.2, 0.12),
    timeout:  () => arp([440, 349], 'triangle', 0.16, 0.2, 0.1),
    gameover: () => arp([392, 330, 262, 196], 'triangle', 0.2, 0.36, 0.1),
    record:   () => arp([523, 659, 784, 1047, 1319, 1568], 'triangle', 0.1, 0.3, 0.12),
    whoosh:   () => { noise({ dur: 0.5, vol: 0.08, freq: 3000 }); tone({ type: 'sine', f0: 500, f1: 900, dur: 0.4, vol: 0.04 }); },
    sticker:  () => arp([784, 988, 1175, 1568], 'sine', 0.06, 0.2, 0.11),
    click:    () => tone({ type: 'sine', f0: 900, f1: 1300, dur: 0.06, vol: 0.06 }),
    deny:     () => arp([220, 165], 'triangle', 0.08, 0.1, 0.08),
  };

  // ---------- Musik: fröhlicher Jahrmarkt-Marsch, C-Dur, 116 BPM, Schritt = Sechzehntel ----------
  const BPM = 116, STEP = 60 / BPM / 4;
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);

  // Akkord-Grundtöne je Takt (MIDI): C F G C | C F G C
  const ROOTS = [48, 53, 55, 48, 48, 53, 55, 48];
  // Melodie als Achtel (MIDI, null = Pause)
  const MELODY = [
    [76, 79, 76, 72, 76, 79, 84, 79],
    [81, 77, 81, 84, 81, 77, 81, null],
    [83, 79, 83, 86, 83, 79, 83, null],
    [84, 79, 76, 79, 72, null, 72, null],
    [72, 76, 79, 76, 72, 76, 79, 84],
    [81, null, 77, 81, 84, 81, 77, null],
    [83, 86, 83, 79, 74, 79, 83, 86],
    [84, null, 79, null, 76, null, 72, null],
  ];

  function env(g, t, vol, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  // „Oom“: Bass auf 1 und 3 (Grundton), die 5. Stufe auf 2 und 4
  function bass(note, t, dur) {
    const o = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'triangle';
    o.frequency.value = midi(note - 12);
    lp.type = 'lowpass'; lp.frequency.value = 600;
    env(g, t, 0.3, dur);
    o.connect(lp).connect(g).connect(musicBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // „Pah“: kurzer Dreiklang
  function chord(root, t, dur) {
    const g = ac.createGain(), lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1800;
    env(g, t, 0.09, dur);
    lp.connect(g).connect(musicBus);
    for (const n of [root + 12, root + 16, root + 19]) {
      const o = ac.createOscillator();
      o.type = 'square';
      o.frequency.value = midi(n);
      o.connect(lp);
      o.start(t); o.stop(t + dur + 0.02);
    }
  }

  // Dreh-Orgel-Melodie mit leichtem Vibrato
  function lead(note, t, dur) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain(), s = ac.createGain();
    const lfo = ac.createOscillator(), lfoG = ac.createGain();
    o.type = 'square'; o2.type = 'triangle';
    o.frequency.value = midi(note); o2.frequency.value = midi(note);
    o.detune.value = 5; o2.detune.value = -5;
    lfo.frequency.value = 5.5; lfoG.gain.value = 9;
    lfo.connect(lfoG); lfoG.connect(o.detune); lfoG.connect(o2.detune);
    lp.type = 'lowpass'; lp.frequency.value = 2400;
    env(g, t, 0.045, dur);
    s.gain.value = 0.5;
    o.connect(lp); o2.connect(lp);
    lp.connect(g).connect(musicBus);
    g.connect(s).connect(echo);
    for (const x of [o, o2, lfo]) { x.start(t); x.stop(t + dur + 0.02); }
  }

  // Schellenring / Tamburin
  function hat(t, accent) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    const dur = accent ? 0.09 : 0.04;
    s.buffer = whiteNoise();
    f.type = 'highpass'; f.frequency.value = 7500;
    g.gain.setValueAtTime(accent ? 0.07 : 0.035, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(musicBus);
    s.start(t); s.stop(t + dur + 0.02);
  }

  function playStep(step, t) {
    const bar = Math.floor(step / 16) % 8, s = step % 16, root = ROOTS[bar];
    if (s === 0 || s === 8) bass(root, t, STEP * 3);
    if (s === 4 || s === 12) { bass(root + 7, t, STEP * 2.5); chord(root, t, STEP * 2); }
    if (s % 4 === 0) hat(t, s % 8 === 4);
    if (s % 2 === 0) {
      const n = MELODY[bar][s / 2];
      if (n !== null) lead(n, t, STEP * 1.9);
    }
  }

  let musicTimer = null, nextT = 0, step = 0;

  function schedule() {
    if (!ac) return;
    // großzügiger Vorlauf, damit ruckelnde Frames auf schwachen Geräten die Musik nicht ausbremsen
    while (nextT < ac.currentTime + 0.35) {
      playStep(step, nextT);
      nextT += STEP;
      step = (step + 1) % (16 * 8);
    }
  }

  // ---------- Sprachausgabe: vorgefertigte Aufnahmen, klingt auf jedem Gerät gleich ----------
  let voice = null;
  const clips = new Map();
  const clip = word => {
    let a = clips.get(word);
    if (!a) { a = new Audio(wordAudio(word)); a.preload = 'auto'; clips.set(word, a); }
    return a;
  };

  return {
    play(name) { if (SFX[name]) SFX[name](); },
    unlock() { audio(); },
    startMusic() {
      if (musicTimer || !audio()) return;
      step = 0;
      nextT = ac.currentTime + 0.08;
      schedule();
      musicTimer = setInterval(schedule, 50);
    },
    stopMusic() {
      clearInterval(musicTimer);
      musicTimer = null;
    },
    say(word) {
      if (muted) return;
      this.hush();
      voice = clip(word);
      voice.currentTime = 0;
      voice.play().catch(() => { /* Browser blockt Ton vor der ersten Eingabe */ });
    },
    hush() { if (voice) voice.pause(); },
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('mojiBlast2.muted', muted ? '1' : '0'); } catch (e) { /* egal */ }
      if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ac.currentTime, 0.05);
      if (muted) this.hush();
      if (!muted) { this.unlock(); this.play('click'); }
      return muted;
    },
  };
})();
