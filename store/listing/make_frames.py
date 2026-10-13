#!/usr/bin/env python3
"""Build branded store screenshot frames for LinkedIn CEO Dashboard.

Design follows the listing research (see RESEARCH.md): the first three
frames carry the story, one benefit per frame, big plain caption up top,
real app screen inside a phone window, Pastel Flow brand colours.

If real captures exist in ./raw/ (raw-home.png, raw-posts.png, ...),
they are composited into the phone window. If a capture is missing, the
window shows the app icon + screen name and is marked as awaiting a real
capture - never fake UI.

Run:  python3 make_frames.py
Output: frame-1-home.png ... frame-7-workers.png  (1320 x 2868)
"""
from PIL import Image, ImageDraw, ImageFont
import os

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
OUT = HERE
W, H = 1320, 2868
CREAM = (255, 254, 250)
ROSE = (232, 168, 168)
ROSE_DARK = (166, 92, 92)
INK = (58, 48, 48)
FONT_B = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"

FRAMES = [
    ("home",     "Your whole LinkedIn week.", "One screen. Nothing missed."),
    ("posts",    "Every post, planned.", "Written, posted, and counted."),
    ("outreach", "New customers, followed up.", "Invites and replies, in order."),
    ("lead",     "Every lead has a next step.", "Open a name. See what to do next."),
    ("freebies", "Freebie requests, handled.", "Asked, sent, ticked off."),
    ("photos",   "Your brand photos, ready.", "One tap to the right picture."),
    ("workers",  "Your LinkedIn team.", "Every job on its day."),
]

def wrap(draw, text, font, maxw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=font) <= maxw:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

def build(idx, key, headline, sub):
    img = Image.new("RGB", (W, H), CREAM)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 26], fill=ROSE)
    f_h = ImageFont.truetype(FONT_B, 118)
    f_s = ImageFont.truetype(FONT_R, 62)
    f_small = ImageFont.truetype(FONT_R, 40)
    y = 120
    for line in wrap(d, headline, f_h, W - 160):
        d.text((80, y), line, font=f_h, fill=INK); y += 138
    y += 8
    for line in wrap(d, sub, f_s, W - 160):
        d.text((80, y), line, font=f_s, fill=ROSE_DARK); y += 78
    # phone window
    px, py, pw, ph = 90, y + 60, W - 180, H - (y + 60) - 210
    d.rounded_rectangle([px, py, px + pw, py + ph], radius=64, outline=ROSE, width=10)
    raw = os.path.join(RAW, f"raw-{key}.png")
    inner = [px + 14, py + 14, px + pw - 14, py + ph - 14]
    if os.path.exists(raw):
        cap = Image.open(raw).convert("RGB")
        tw, th = inner[2] - inner[0], inner[3] - inner[1]
        cap = cap.resize((tw, th), Image.LANCZOS)
        mask = Image.new("L", (tw, th), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, tw, th], radius=52, fill=255)
        img.paste(cap, (inner[0], inner[1]), mask)
    else:
        icon = Image.open(os.path.join(HERE, "icons", "icon-512.png")).convert("RGB")
        isz = 340
        icon = icon.resize((isz, isz), Image.LANCZOS)
        img.paste(icon, ((W - isz) // 2, py + 300))
        label = f"Screen: {key.capitalize()}"
        tw = d.textlength(label, font=f_s)
        d.text(((W - tw) / 2, py + 720), label, font=f_s, fill=INK)
        note = "Real capture goes here at submission time."
        tw = d.textlength(note, font=f_small)
        d.text(((W - tw) / 2, py + 830), note, font=f_small, fill=ROSE_DARK)
    foot = "LinkedIn CEO Dashboard"
    tw = d.textlength(foot, font=f_s)
    d.text(((W - tw) / 2, H - 150), foot, font=f_s, fill=ROSE_DARK)
    out = os.path.join(OUT, "screenshots", f"frame-{idx}-{key}.png")
    img.save(out)
    print("built", out)

for i, (key, h, s) in enumerate(FRAMES, 1):
    build(i, key, h, s)
