"""Erzeugt docs/social-preview.png (1280x640) für die GitHub-Social-Preview.
Benötigt: pip install pillow fonttools brotli. Aufruf im Projektordner: python tools/make_social_preview.py"""
import math, os, tempfile, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from fontTools.ttLib import TTFont

W, H, S = 1280, 640, 2            # Zielgröße, S = Supersampling für glatte Kanten
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tmp = tempfile.mkdtemp()

def font(weight, size):
    ttf = os.path.join(tmp, f'andika-{weight}.ttf')
    if not os.path.exists(ttf):
        f = TTFont(os.path.join(root, 'fonts', f'andika-{weight}.woff2')); f.flavor = None; f.save(ttf)
    return ImageFont.truetype(ttf, size * S)

def emoji(key, size, alpha=1.0):
    img = Image.open(os.path.join(root, 'emoji', f'{key}.png')).convert('RGBA')
    img = img.resize((size * S, size * S), Image.LANCZOS)
    if alpha < 1:
        img.putalpha(img.getchannel('A').point(lambda a: int(a * alpha)))
    return img

def paste(base, img, cx, cy):
    base.alpha_composite(img, (int(cx * S - img.width / 2), int(cy * S - img.height / 2)))

# Hintergrund: Abendhimmel wie im Spiel
base = Image.new('RGBA', (W * S, H * S))
px = ImageDraw.Draw(base)
stops = [(0, (75, 42, 140)), (0.55, (200, 88, 127)), (1, (255, 178, 122))]
for y in range(H * S):
    t = y / (H * S)
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        if t0 <= t <= t1:
            k = (t - t0) / (t1 - t0)
            px.line([(0, y), (W * S, y)], fill=tuple(int(a + (b - a) * k) for a, b in zip(c0, c1)) + (255,))
            break

random.seed(7)
for _ in range(70):                                  # Lichtpunkte
    x, y, r = random.uniform(0, W), random.uniform(0, H), random.uniform(2, 5)
    px.ellipse([(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S], fill=(255, 247, 214, random.randint(50, 110)))

# Kulisse
paste(base, emoji('2601', 150, 0.45), 160, 120)
paste(base, emoji('2601', 110, 0.4), 760, 70)
paste(base, emoji('1f3a1', 330, 0.32), 905, 410)
paste(base, emoji('1f3a0', 160, 0.75), 770, 525)
paste(base, emoji('1f3aa', 150, 0.6), 1010, 535)

# Wimpelkette
colors = [(255, 79, 106), (63, 169, 255), (62, 207, 114), (255, 201, 63), (182, 107, 255), (255, 138, 63)]
px.line([(x * S, (2 * (x / W) * (1 - x / W) * 70) * S) for x in range(0, W + 1, 8)], fill=(255, 255, 255, 140), width=3 * S)
n = 22
for i in range(n):
    t = (i + 0.5) / n
    x, y = t * W, 2 * t * (1 - t) * 70
    px.polygon([((x - 24) * S, y * S), ((x + 24) * S, y * S), (x * S, (y + 46) * S)], fill=colors[i % len(colors)] + (255,))

# Tresen
px.rectangle([0, 598 * S, W * S, H * S], fill=(139, 74, 43, 255))
px.rectangle([0, 598 * S, W * S, 606 * S], fill=(196, 122, 69, 255))

# Titel
def text(xy, s, f, fill, stroke=0, stroke_fill=None, shadow=True):
    x, y = xy
    if shadow:
        sh = Image.new('RGBA', base.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).text((x * S + 4 * S, y * S + 6 * S), s, font=f, fill=(20, 5, 50, 150), stroke_width=stroke * S)
        base.alpha_composite(sh.filter(ImageFilter.GaussianBlur(6 * S)))
    ImageDraw.Draw(base).text((x * S, y * S), s, font=f, fill=fill, stroke_width=stroke * S, stroke_fill=stroke_fill)

big = font('700', 132)
x = 70
for part, col in (('Moji', (255, 255, 255, 255)), ('Blast', (255, 216, 79, 255)), (' 2', (255, 255, 255, 255))):
    text((x, 95), part, big, col)
    x += big.getlength(part) / S
paste(base, emoji('1f388', 120), x + 85, 160)

text((74, 262), 'Welcher Buchstabe fehlt?', font('700', 56), (255, 255, 255, 255))
text((74, 335), 'Buchstaben lernen auf dem Jahrmarkt', font('400', 40), (255, 235, 245, 255))

# Wort-Feld: 🐘 ELE?ANT
word = 'ELEFANT'; gap = 3
tile, tgap, pw, ph, ppx, ppy = 62, 8, 640, 118, 70, 430
panel = Image.new('RGBA', base.size, (0, 0, 0, 0))
ImageDraw.Draw(panel).rounded_rectangle([ppx * S, ppy * S, (ppx + pw) * S, (ppy + ph) * S], radius=28 * S, fill=(40, 14, 70, 235), outline=(255, 255, 255, 140), width=3 * S)
base.alpha_composite(panel)
paste(base, emoji('1f418', 92), ppx + 70, ppy + ph / 2)
tf = font('700', 62)
for i, ch in enumerate(word):
    tx = ppx + 140 + i * (tile + tgap)
    d = ImageDraw.Draw(base)
    if i == gap:
        d.rounded_rectangle([tx * S, (ppy + 20) * S, (tx + tile) * S, (ppy + ph - 20) * S], radius=12 * S, fill=(255, 255, 255, 56), outline=(255, 216, 79, 255), width=4 * S)
        ch, col = '?', (255, 216, 79, 255)
    else:
        col = (255, 255, 255, 255)
    d.text(((tx + tile / 2) * S, (ppy + ph / 2 + 3) * S), ch, font=tf, fill=col, anchor='mm')

# Ballons (rechts): F ist richtig
def balloon(cx, cy, letter, base_c, light_c, dark_c, rx=64, ry=80):
    d = ImageDraw.Draw(base)
    d.line([(cx * S, (cy + ry) * S), ((cx - 10) * S, (cy + ry + 50) * S), ((cx + 6) * S, (cy + ry + 95) * S)], fill=(255, 255, 255, 200), width=3 * S)
    d.ellipse([(cx - rx) * S, (cy - ry) * S, (cx + rx) * S, (cy + ry) * S], fill=dark_c)
    d.ellipse([(cx - rx + 6) * S, (cy - ry + 4) * S, (cx + rx - 2) * S, (cy + ry - 8) * S], fill=base_c)
    d.ellipse([(cx - rx * 0.62) * S, (cy - ry * 0.7) * S, (cx + rx * 0.1) * S, (cy + ry * 0.05) * S], fill=light_c)
    d.ellipse([(cx - rx * 0.5) * S, (cy - ry * 0.6) * S, (cx - rx * 0.1) * S, (cy - ry * 0.15) * S], fill=base_c)
    d.polygon([(cx * S, (cy + ry - 3) * S), ((cx - 10) * S, (cy + ry + 14) * S), ((cx + 10) * S, (cy + ry + 14) * S)], fill=dark_c)
    d.ellipse([(cx - rx * 0.62) * S, (cy - ry * 0.72) * S, (cx - rx * 0.32) * S, (cy - ry * 0.34) * S], fill=(255, 255, 255, 90))
    d.text((cx * S, (cy + 2) * S), letter, font=font('700', 84), fill=(255, 255, 255, 255), anchor='mm', stroke_width=8 * S, stroke_fill=dark_c)

balloon(1105, 145, 'S', (62, 207, 114), (156, 240, 185), (28, 138, 71))
balloon(1105, 345, 'F', (255, 79, 106), (255, 154, 169), (184, 31, 59))
balloon(1105, 545 - 40, 'P', (182, 107, 255), (220, 180, 255), (122, 47, 196))

# Fuchs mit Konfetti-Schuss
for i, (dx, c) in enumerate(zip(range(0, 3), [(255, 201, 63), (63, 169, 255), (255, 79, 106)])):
    cx, cy = 1005 + dx * 16, 345 + math.sin(dx) * 4
    d = ImageDraw.Draw(base)
    r = 11 - dx * 2
    d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=c + (255,))
paste(base, emoji('1f98a', 190), 905, 345)

out = base.resize((W, H), Image.LANCZOS).convert('RGB')
os.makedirs(os.path.join(root, 'docs'), exist_ok=True)
path = os.path.join(root, 'docs', 'social-preview.png')
out.save(path, optimize=True)
print(path, os.path.getsize(path) // 1024, 'KB')
