# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
"""Makes extension/icons/icon-128.png from MosaicShell's master artwork.

The browser stores want the 128 x 128 icon to hold artwork no bigger than 96 x 96, centred, with 16 pixels of
transparent padding on every side. MosaicShell's own 128 icon fills almost the whole canvas, so this scales the master
artwork so that its opaque area is 96 pixels on the longer side and centres it on a transparent 128 x 128 canvas.

Run from the repository root:  uv run scripts/make-icon-128.py
"""
from pathlib import Path

from PIL import Image

CANVAS = 128
ARTWORK = 96

root = Path(__file__).resolve().parent.parent
master = Image.open(root / "assets" / "branding" / "mosaicshell-master-1500.png").convert("RGBA")

# Only the opaque part counts as artwork, so the padding is measured from what is actually drawn.
box = master.getchannel("A").point(lambda a: 255 if a > 0 else 0).getbbox()
artwork = master.crop(box)
scale = ARTWORK / max(artwork.size)
size = (min(ARTWORK, round(artwork.width * scale)), min(ARTWORK, round(artwork.height * scale)))
artwork = artwork.resize(size, Image.LANCZOS)

icon = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
icon.paste(artwork, ((CANVAS - size[0]) // 2, (CANVAS - size[1]) // 2), artwork)

# Anti-aliasing can leave a nearly invisible fringe; it must not reach into the padding either.
bounds = icon.getchannel("A").point(lambda a: 255 if a > 0 else 0).getbbox()
assert bounds[0] >= 16 and bounds[1] >= 16 and bounds[2] <= CANVAS - 16 and bounds[3] <= CANVAS - 16, bounds

icon.save(root / "extension" / "icons" / "icon-128.png", optimize=True)
print(f"icon-128.png: artwork {size[0]} x {size[1]}, opaque area {bounds}")
