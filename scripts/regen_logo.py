#!/usr/bin/env python3
"""Regenerate aset logo dari assets/logo/logo spada.png.

- logo-spada.png : versi web 512px (navbar / portal guru)
- favicon.png    : 128px, dipotong lingkaran (sudut putih dibuang)
- mipmap ic_launcher / ic_launcher_round / ic_launcher_foreground (Android)
"""
from PIL import Image, ImageChops, ImageDraw
import os
import shutil

SRC = 'assets/logo/logo spada.png'
RES = 'android/app/src/main/res'
WHITE = (255, 255, 255, 255)


def emblem():
    """Crop konten ke kotak tengah (emblem lingkaran) lalu mask lingkaran."""
    src = Image.open(SRC).convert('RGBA')
    box = src.getbbox()
    content = src.crop(box)
    w, h = content.size
    s = min(w, h)
    left, top = (w - s) // 2, (h - s) // 2
    sq = content.crop((left, top, left + s, top + s))
    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, s - 1, s - 1), fill=255)
    sq.putalpha(ImageChops.multiply(sq.getchannel('A'), mask))
    return sq


def place(base, size, frac, bg=(0, 0, 0, 0)):
    """Tempel emblem berdiameter size*frac di tengah kanvas size x size."""
    canvas = Image.new('RGBA', (size, size), bg)
    d = max(1, round(size * frac))
    im = base.resize((d, d), Image.LANCZOS)
    o = (size - d) // 2
    canvas.alpha_composite(im, (o, o)) if bg[3] == 0 else canvas.paste(im, (o, o), im)
    return canvas


def main():
    base = emblem()
    print('emblem (kotak lingkaran):', base.size)

    # 1. versi web: konten penuh (tanpa mask), lebar 512
    src = Image.open(SRC).convert('RGBA')
    c = src.crop(src.getbbox())
    web = c.resize((512, round(512 * c.size[1] / c.size[0])), Image.LANCZOS)
    web.save('assets/logo/logo-spada.png', optimize=True)
    print('logo-spada.png', web.size, os.path.getsize('assets/logo/logo-spada.png'), 'B')

    # 2. favicon: lingkaran bersih (transparan di luar lingkaran)
    place(base, 128, 0.98).save('assets/logo/favicon.png', optimize=True)
    print('favicon.png 128x128', os.path.getsize('assets/logo/favicon.png'), 'B')

    # 3. ikon Android
    LEG = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    FG = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
    for d, s in LEG.items():  # ikon legacy (API < 26): latar putih sesuai template
        place(base, s, 0.82, WHITE).save(f'{RES}/mipmap-{d}/ic_launcher.png', optimize=True)
        place(base, s, 0.82, WHITE).save(f'{RES}/mipmap-{d}/ic_launcher_round.png', optimize=True)
    for d, s in FG.items():   # foreground adaptive: 0.60 <= safe zone 66/108
        place(base, s, 0.60).save(f'{RES}/mipmap-{d}/ic_launcher_foreground.png', optimize=True)
    print('ikon Android:', ', '.join(LEG))

    # 4. sync www
    for f in ('logo-spada.png', 'favicon.png'):
        shutil.copyfile(f'assets/logo/{f}', f'www/assets/logo/{f}')
    print('tersalin ke www/assets/logo/')


if __name__ == '__main__':
    main()
