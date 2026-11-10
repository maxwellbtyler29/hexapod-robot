"""Regenerate deck/icons/*.png (cyan hexagon on dark). Needs Pillow."""
import math, os
from PIL import Image, ImageDraw
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
os.makedirs(here, exist_ok=True)
def icon(size, name):
    s = size * 4
    im = Image.new("RGB", (s, s), (4, 11, 18)); d = ImageDraw.Draw(im)
    c = s / 2
    def hexa(r, rot=30):
        return [(c + r * math.cos(math.radians(60 * k + rot)), c + r * math.sin(math.radians(60 * k + rot))) for k in range(6)]
    d.polygon(hexa(s * 0.34), outline=(103, 224, 255), width=int(s * 0.035))
    d.polygon(hexa(s * 0.17), fill=(103, 224, 255))
    for k in range(6):  # legs
        a = math.radians(60 * k)
        p1 = (c + s * 0.34 * math.cos(a), c + s * 0.34 * math.sin(a))
        p2 = (c + s * 0.44 * math.cos(a), c + s * 0.44 * math.sin(a))
        d.line([p1, p2], fill=(103, 224, 255), width=int(s * 0.03))
    im.resize((size, size), Image.LANCZOS).save(os.path.join(here, name), optimize=True)
icon(192, "icon-192.png"); icon(512, "icon-512.png"); icon(180, "apple-touch-icon.png")
