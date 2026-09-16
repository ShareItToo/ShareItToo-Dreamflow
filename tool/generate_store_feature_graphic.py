#!/usr/bin/env python3
"""Build the deterministic Google Play feature graphic from SIT brand assets."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent.parent
WIDTH = 1024
HEIGHT = 500
OUTPUT = ROOT / "store/assets/google-play/feature-graphic-1024x500.png"
LOGO = ROOT / "assets/images/icononly_transparent_nobuffer.png"
FONT = Path("/System/Library/Fonts/Avenir Next.ttc")


def blend(start: tuple[int, int, int], end: tuple[int, int, int], ratio: float):
    return tuple(round(a + (b - a) * ratio) for a, b in zip(start, end))


def font(size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT), size=size, index=index)


def main() -> None:
    canvas = Image.new("RGB", (WIDTH, HEIGHT), "#06101F")
    pixels = ImageDraw.Draw(canvas)
    for x in range(WIDTH):
        ratio = x / (WIDTH - 1)
        pixels.line((x, 0, x, HEIGHT), fill=blend((5, 12, 25), (9, 34, 68), ratio))

    atmosphere = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    glow = ImageDraw.Draw(atmosphere)
    glow.ellipse((600, -175, 1125, 350), fill=(14, 165, 233, 74))
    glow.ellipse((720, 180, 1170, 630), fill=(93, 241, 227, 52))
    atmosphere = atmosphere.filter(ImageFilter.GaussianBlur(78))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), atmosphere)

    accents = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    accent_draw = ImageDraw.Draw(accents)
    accent_draw.arc((615, -80, 1100, 405), 120, 305, fill=(77, 218, 255, 58), width=3)
    accent_draw.arc((675, -20, 1040, 345), 120, 305, fill=(123, 246, 233, 42), width=2)
    accent_draw.rounded_rectangle(
        (58, 72, 606, 428), radius=34, fill=(255, 255, 255, 10), outline=(255, 255, 255, 22), width=1
    )
    canvas = Image.alpha_composite(canvas, accents)

    logo = Image.open(LOGO).convert("RGBA")
    bounds = logo.getbbox()
    if bounds is None:
        raise RuntimeError("SIT logo has no visible pixels")
    logo = logo.crop(bounds)
    logo.thumbnail((300, 300), Image.Resampling.LANCZOS)
    logo_position = (686 + (300 - logo.width) // 2, 100 + (300 - logo.height) // 2)

    canvas.alpha_composite(logo, logo_position)

    draw = ImageDraw.Draw(canvas)
    draw.text((94, 116), "ShareItToo", font=font(28, 1), fill=(151, 229, 255, 255))
    draw.text((92, 171), "Teile mehr.", font=font(58, 1), fill=(255, 255, 255, 255))
    draw.text((92, 238), "Kaufe weniger.", font=font(58, 1), fill=(104, 231, 226, 255))
    draw.text(
        (96, 335),
        "Mieten und vermieten in deiner Nähe.",
        font=font(23, 0),
        fill=(202, 218, 237, 255),
    )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(OUTPUT, format="PNG", optimize=True)


if __name__ == "__main__":
    main()
