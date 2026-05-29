#!/usr/bin/env python3
"""Generate PWA icon PNGs for GuessTheCard using Pillow."""

import sys
from PIL import Image, ImageDraw, ImageFont

BG_COLOR = (11, 11, 20)        # #0b0b14
ACCENT   = (124, 92, 255)      # #7c5cff
ACCENT_DIM = (124, 92, 255, 100)

def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG_COLOR + (255,))
    d = ImageDraw.Draw(img)

    # Rounded rect background (simulate with filled rounded rectangle)
    r = size // 8
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=BG_COLOR)

    # Card outline
    pad = size * 0.20
    card_left   = int(pad)
    card_top    = int(size * 0.12)
    card_right  = int(size - pad)
    card_bottom = int(size * 0.88)
    cr = max(3, size // 20)

    # Outer card border
    d.rounded_rectangle(
        [card_left, card_top, card_right, card_bottom],
        radius=cr,
        outline=ACCENT,
        width=max(2, size // 32),
    )

    # Inner card border (decorative)
    inner_pad = max(2, size // 20)
    d.rounded_rectangle(
        [card_left + inner_pad, card_top + inner_pad,
         card_right - inner_pad, card_bottom - inner_pad],
        radius=max(1, cr - 2),
        outline=ACCENT + (80,) if hasattr(ACCENT, '__len__') else ACCENT,
        width=max(1, size // 64),
    )

    # Question mark — use default font scaled by size
    font_size = int(size * 0.42)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", font_size)
    except Exception:
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf", font_size)
        except Exception:
            font = ImageFont.load_default()

    text = "?"
    bbox = d.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (size - tw) // 2 - bbox[0]
    ty = (size - th) // 2 - bbox[1] + int(size * 0.05)
    d.text((tx, ty), text, font=font, fill=ACCENT)

    return img.convert("RGB")


SIZES = {
    "public/pwa-192x192.png":    192,
    "public/pwa-512x512.png":    512,
    "public/apple-touch-icon.png": 180,
}

import os
base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

for rel_path, size in SIZES.items():
    out = os.path.join(base, rel_path)
    img = draw_icon(size)
    img.save(out, "PNG")
    print(f"  wrote {out} ({size}x{size})")

print("Done.")
