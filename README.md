# MojiBlast 2 🎈

**Buchstaben-Lernspiel auf dem Jahrmarkt** – für Kinder in Klasse 1–2.

Oben steht ein Emoji mit seinem Namen, aber ein Buchstabe fehlt (🐄 `K ? H`). Drei Luftballons mit Buchstaben schweben heran. Schieß den Ballon mit dem richtigen Buchstaben ab!

## Spielen

Lokal: `python -m http.server 8766` im Ordner starten und `http://localhost:8766` öffnen (oder `index.html` direkt öffnen). Kein Build, keine Abhängigkeiten. Läuft am PC und auf dem Handy/Tablet (Querformat), als App installierbar (PWA).

## Steuerung

| | PC | Handy/Tablet (Querformat) |
|---|---|---|
| Zielen & schießen | Ballon anklicken | Ballon antippen |
| Fliegen | ⬆️⬇️ / W S | linke Bildschirmhälfte ziehen |
| Schießen | Leertaste / F | 🔥 (halten = Dauerfeuer) |
| Wort nochmal vorlesen | R | Emoji/Wort oben antippen |
| Ton an/aus | M | 🔊 |
| Pause | Esc / P | ⏸️ |

## Regeln

- 3 ❤️ zum Start, alle 10 richtigen Antworten gibt es ein Bonus-Herz (max. 5)
- Richtiger Ballon: +10 Punkte, ab einer Serie Bonuspunkte 🔥
- Falscher Ballon oder Ballons erreichen den Schützen: −1 ❤️, der richtige Buchstabe wird gezeigt
- Das Wort wird vorgelesen (vorgefertigte Aufnahmen in `audio/words/`, abschaltbar)
- Mit jedem Treffer schweben die Ballons etwas schneller

## Einstellungen (Titelbildschirm)

- **Wo fehlt der Buchstabe?** Anfang · Mitte · Ende (kombinierbar)
- **Wörter:** kurz (3–4 Buchstaben) · mittel (5–6) · lang (7+)
- **🗣️ Vorlesen** an/aus

Laute wie SCH, CH, AU, EI, IE, ST-Doppelbuchstaben (LL, FF …) werden nie auseinandergerissen. Falsche Buchstaben sind Verwechsler (B/D, M/N, E/F …) bzw. andere Vokale.

## Technik

- `index.html`, `style.css` – Bühne (16:9), Titel-, Pause- und Ergebnis-Bildschirm
- `words.js` – Wortliste mit Emojis, Regeln für Lückenpositionen
- `game.js` – Spiellogik, Aufgabengenerator, Zeichnen auf dem Canvas
- `audio.js` – Soundeffekte, Jahrmarkt-Musik (WebAudio) und Wort-Aufnahmen
- `tools/gen_voice.py` – erzeugt die Wort-Aufnahmen (`pip install edge-tts`, deutsche Stimme)
- `sw.js`, `manifest.json`, `icons/` – PWA

Neue Wörter: in `words.js` ein Paar `['WORT', '🙂']` in `WORDS` ergänzen (GROSSBUCHSTABEN, eindeutiges Emoji), dann `python tools/gen_voice.py` ausführen.
