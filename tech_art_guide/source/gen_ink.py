"""Procedural e-sumi decorations for the tech art guide: brushstrokes, seals, ink-wash banner."""
import sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else "assets"
os.makedirs(OUT, exist_ok=True)
RED = (183, 32, 38)
INK = (22, 20, 20)
SEAL_FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"


def noise1d(n, rng, octaves=4, base=8):
    out = np.zeros(n)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        k = base * 2 ** o
        pts = rng.uniform(-1, 1, k + 2)
        out += amp * np.interp(np.linspace(0, k, n), np.arange(k + 2), pts)
        tot += amp
        amp *= 0.5
    return out / tot


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def brushstroke(w, h, color, seed, thick=0.62, dry=0.35, curve=0.08, ss=2):
    rng = np.random.default_rng(seed)
    W, H = w * ss, h * ss
    x = np.arange(W)
    u = x / (W - 1)
    # centreline with a slight hand-drawn arc
    yc = H / 2 + rng.choice([-1, 1]) * curve * H * np.sin(np.pi * u + rng.uniform(-.3, .3)) + 0.05 * H * noise1d(W, rng, 3, 2)
    # press at the start, gentle thinning, flicked tail
    s0 = 0.035
    press = np.sqrt(np.clip(1 - ((s0 - np.minimum(u, s0)) / s0) ** 2, 0, 1))  # blunt rounded start
    prof = press * (1.05 - 0.3 * u) * (1 - smooth(0.74, 1.0, u) ** 0.9)
    prof *= 1 + 0.20 * noise1d(W, rng, 2, 2) + 0.06 * noise1d(W, rng, 3, 9)
    half = 0.5 * thick * H * prof
    top = half * (1 + 0.10 * noise1d(W, rng, 5, 20))
    bot = half * (1 + 0.10 * noise1d(W, rng, 5, 20))
    yy = np.arange(H)[:, None]
    d = yy - yc[None, :]
    v = np.where(d < 0, d / np.maximum(top, 1e-3), d / np.maximum(bot, 1e-3))  # -1..1 across the stroke
    inside = np.abs(v) <= 1
    # bristles: each runs out of ink at its own point, edges dry first
    nb = 140
    bi = np.clip(((v + 1) / 2 * nb).astype(int), 0, nb - 1)
    edge = np.abs(np.linspace(-1, 1, nb))
    ink_end = 1.02 - dry * (0.35 + 0.65 * rng.random(nb)) * (0.4 + 0.6 * edge)
    ink_end = np.clip(ink_end, 0.35, 1.05)
    tone = 0.78 + 0.22 * rng.random(nb)
    end = ink_end[bi]
    fade = 1 - smooth(end - 0.12, end, u[None, :])
    # scattered dry-brush gaps inside the drying region
    grain = rng.random((H, W))
    gaps = np.where((u[None, :] > end - 0.25) & (grain < 0.25 + 0.5 * smooth(end - 0.25, end, u[None, :])), 0.25, 1.0)
    a = inside * tone[bi] * fade * gaps
    a *= 0.88 + 0.12 * rng.random((H, W))
    # watercolour: pigment pools at the edges, blotchy lighter wash inside
    blot = noise1d(W, rng, 3, 6)[None, :] * 0.5 + 0.5
    a *= 0.84 + 0.16 * np.maximum(smooth(0.55, 0.97, np.abs(v)), blot * 0.9)
    a *= smooth(1.0, 0.9, np.abs(v))
    a = np.clip(a, 0, 1)
    img = np.zeros((H, W, 4), np.float32)
    dark = 0.75 + 0.25 * (1 - a)  # pooled ink reads darker
    for c in range(3):
        img[..., c] = color[c] * dark
    img[..., 3] = a * 255
    im = Image.fromarray(img.astype(np.uint8), "RGBA")
    return im.resize((w, h), Image.LANCZOS)


def seal(size, text, seed, color=RED):
    rng = np.random.default_rng(seed)
    S = size * 2
    a = Image.new("L", (S, S), 0)
    dr = ImageDraw.Draw(a)
    m = int(S * 0.06)
    dr.rounded_rectangle([m, m, S - m, S - m], radius=int(S * 0.08), fill=255)
    font = ImageFont.truetype(SEAL_FONT, int(S * (0.62 if len(text) == 1 else 0.36)))
    if len(text) == 1:
        dr.text((S / 2, S / 2), text, font=font, fill=0, anchor="mm")
    else:  # stack vertically like a carved seal
        step = S * 0.36
        for i, ch in enumerate(text):
            dr.text((S / 2, S / 2 + (i - (len(text) - 1) / 2) * step), ch, font=font, fill=0, anchor="mm")
    arr = np.asarray(a, np.float32) / 255
    # weathered stone-carved edges
    n = rng.random((S, S))
    arr = arr * np.where(n < 0.06, 0.35, 1.0)
    arr *= 0.85 + 0.15 * rng.random((S, S))
    yy, xx = np.mgrid[0:S, 0:S]
    rim = np.minimum.reduce([xx, yy, S - xx, S - yy]) / S
    arr *= np.where((rim < 0.09) & (n > 0.75), 0, 1)
    out = np.zeros((S, S, 4), np.uint8)
    out[..., :3] = color
    out[..., 3] = np.clip(arr * 255, 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").filter(ImageFilter.GaussianBlur(0.8)).resize((size, size), Image.LANCZOS)


def pagoda(dr, cx, base, s, fill):
    # stacked tiers with upswept eaves
    y = base
    widths = [1.0, 0.82, 0.66]
    for i, wf in enumerate(widths):
        bw, bh = 0.30 * s * wf, 0.17 * s
        dr.rectangle([cx - bw / 2, y - bh, cx + bw / 2, y], fill=fill)
        y -= bh
        rw, rh = 0.80 * s * wf, 0.07 * s
        dr.polygon([(cx - rw / 2, y - rh * 0.55), (cx - rw * 0.40, y + rh * 0.1), (cx + rw * 0.40, y + rh * 0.1),
                    (cx + rw / 2, y - rh * 0.55), (cx + rw * 0.36, y - rh * 0.25), (cx + rw * 0.2, y - rh),
                    (cx - rw * 0.2, y - rh), (cx - rw * 0.36, y - rh * 0.25)], fill=fill)
        y -= rh * 0.8
    dr.rectangle([cx - s * 0.01, y - s * 0.26, cx + s * 0.01, y], fill=fill)
    for k in range(5):
        yy = y - s * (0.05 + k * 0.04)
        dr.ellipse([cx - s * 0.03, yy - s * 0.012, cx + s * 0.03, yy + s * 0.012], fill=fill)


def banner(w, h, seed):
    rng = np.random.default_rng(seed)
    acc = np.zeros((h, w), np.float32)  # ink density
    red = np.zeros((h, w), np.float32)
    yy, xx = np.mgrid[0:h, 0:w]
    # red rising sun
    cx, cy, r = w * 0.73, h * 0.36, h * 0.22
    dist = np.hypot(xx - cx, yy - cy)
    red = smooth(r, r * 0.92, dist) * 0.92 * (0.9 + 0.1 * rng.random((h, w)))
    layers = [  # (ridge height frac, roughness, density, fade px)
        (0.42, 0.10, 0.18, 0.30),
        (0.55, 0.12, 0.30, 0.26),
        (0.70, 0.10, 0.50, 0.22),
        (0.86, 0.06, 0.78, 0.16),
    ]
    for i, (hf, rough, dens, fade) in enumerate(layers):
        xs = np.arange(w)
        peaks = np.zeros(w)
        for _ in range(4 + i * 2):
            pc, pw, ph = rng.uniform(-0.1, 1.1) * w, rng.uniform(0.05, 0.16) * w, rng.uniform(0.4, 1.0)
            peaks = np.maximum(peaks, ph * np.exp(-((xs - pc) / pw) ** 2))
        ridge = h * hf - h * rough * 3.2 * peaks - h * 0.025 * noise1d(w, rng, 5, 30)
        if i == 2:
            ridge -= h * 0.08 * np.exp(-((xs - w * 0.2) / (w * 0.06)) ** 2)  # hill for the pagoda
        d = yy - ridge[None, :]
        layer = (d > 0) * dens * np.exp(-np.clip(d, 0, None) / (h * fade)) * (1 + 0.5 * np.exp(-np.clip(d, 0, None) / (h * 0.012)))
        layer = np.clip(layer, 0, 1)
        layer *= 0.85 + 0.15 * rng.random((h, w))
        acc = acc + layer * (1 - acc)
        if i == 2:  # pagoda on the third range, sitting on its ridge
            pim = Image.new("L", (w, h), 0)
            px = int(w * 0.2)
            pagoda(ImageDraw.Draw(pim), px, ridge[px] + h * 0.03, h * 0.36, 255)
            p = np.asarray(pim.filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255 * 0.82
            acc = acc + p * (1 - acc)
            red *= 1 - p
    # bottom mist
    acc *= 1 - smooth(h * 0.80, h * 1.0, yy)
    red *= 1 - acc * 0.9
    alpha = np.clip(acc + red * (1 - acc), 0, 1)
    col = np.zeros((h, w, 3), np.float32)
    wr = np.where(alpha > 0, red * (1 - acc) / np.maximum(alpha, 1e-4), 0)
    for c in range(3):
        col[..., c] = INK[c] * (1 - wr) + RED[c] * wr
    out = np.dstack([col, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


if __name__ == "__main__":
    for i in range(6):
        brushstroke(1400, 90, RED, 100 + i, curve=0.12).save(f"{OUT}/stroke_red_{i}.png")
    for i in range(3):
        brushstroke(2200, 120, INK, 300 + i, thick=0.7, dry=0.45, curve=0.04).save(f"{OUT}/stroke_ink_{i}.png")
    for i, ch in enumerate(["壱", "弐", "参"]):
        seal(240, ch, 500 + i).save(f"{OUT}/seal_{i + 1}.png")
    seal(240, "太鼓", 510).save(f"{OUT}/seal_taiko.png")
    banner(2400, 560, 7).save(f"{OUT}/banner.png")
