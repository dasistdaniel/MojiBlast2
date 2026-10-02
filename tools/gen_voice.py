"""Erzeugt die Sprachdateien (audio/words/*.mp3) für alle Wörter aus words.js.
Benötigt: pip install edge-tts (Internet). Aufruf im Projektordner: python tools/gen_voice.py"""
import asyncio, re, pathlib
import edge_tts

VOICE, RATE = 'de-DE-AmalaNeural', '-15%'
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'words.js').read_text(encoding='utf-8')
words = re.findall(r"\['([A-ZÄÖÜ]+)',", src[src.index('const WORDS = ['):src.index('];')])

def slug(w):
    return w.lower().replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue')

async def one(w, sem):
    out = root / 'audio' / 'words' / f'{slug(w)}.mp3'
    if out.exists():
        return
    async with sem:
        await edge_tts.Communicate(w.capitalize(), VOICE, rate=RATE).save(str(out))

async def main():
    sem = asyncio.Semaphore(5)
    await asyncio.gather(*(one(w, sem) for w in words))
    print(len(words), 'Wörter')

asyncio.run(main())
