# Branding

Grout is a MosaicShell companion, so it uses MosaicShell's brand unchanged: the mark, the palette and the
tagline. MosaicShell's repository is the source of truth (`.github/res/`); `assets/branding/` here is a copy.

Tagline: _Your desktop, composed._

## The mark

Six interlocking tiles around a dark diamond, on a transparent background. The name Grout is the material that
fills the gaps between tiles, which is what this extension does for the media session.

Files in `assets/branding/`, all copied byte for byte from MosaicShell:

| File                                      | Use                                                    |
| ----------------------------------------- | ------------------------------------------------------ |
| `mosaicshell-master-1500.png`             | The master artwork, for store promo images and banners |
| `compact-32/64/128/256/512.png`           | The full-colour mark at each size                      |
| `micro-16.png`, `micro-24.png`            | Hand-tuned small sizes for toolbars and lists          |
| `monochrome-dark-*.png`, `monochrome-white-*.png` | One-colour versions for light and dark surfaces |
| `favicon.ico`                             | A site or documentation favicon                        |

The extension's own icons are in `extension/icons/`: 16 and 32 are the brand's `micro-16` and `compact-32`, and 48 is
the brand's `compact-128` scaled down, because the brand has no 48.

The 128 icon is the exception. The Chrome Web Store and Edge Add-ons ask for artwork no bigger than 96 x 96 with 16
pixels of transparent padding on every side, and the brand's own 128 fills nearly the whole canvas. So
`icon-128.png` is the master artwork scaled to 96 pixels on its longer side and centred on a transparent 128 x 128
canvas, made by `uv run scripts/make-icon-128.py`. It is the same mark, not recoloured, and a test measures the
padding. Use this file for the store listing's icon too.

On a very dark background the centre diamond (Night) sits next to the gaps between tiles, which show the background,
so it loses some contrast there. That comes from the mark itself and is not changed here.

## Palette

Sampled from the master artwork. The same seven values are in `assets/branding/palette.json`.

| Name   | Hex       | Where it is in the mark        |
| ------ | --------- | ------------------------------ |
| Sky    | `#67B8E7` | Upper left tile                |
| Indigo | `#5B62E6` | Top tile                       |
| Violet | `#9D14E6` | Upper right tile               |
| Green  | `#5BE077` | Lower left tile                |
| Olive  | `#BBB555` | Bottom tile                    |
| Amber  | `#B48331` | Lower right tile               |
| Night  | `#0E0231` | The centre diamond; dark text and dark surfaces |

Use Night for text and dark backgrounds, and the six tile colours for accents. Do not recolour the mark.
