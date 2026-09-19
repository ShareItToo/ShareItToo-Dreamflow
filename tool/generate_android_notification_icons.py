#!/usr/bin/env python3

"""Generate centered Android notification icons from the canonical SIT mark."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/images/icononly_transparent_nobuffer.png"
OUTPUTS = {
    "mdpi": 24,
    "hdpi": 36,
    "xhdpi": 48,
    "xxhdpi": 72,
    "xxxhdpi": 96,
}

# Android and individual device launchers apply slightly different circular
# notification masks. Keep every visible pixel inside 60% of the source canvas
# so the SIT mark remains centered with a consistent white safety margin even
# on launchers that use the tighter mask seen on the physical test device.
TARGET_RADIUS_FRACTION = 0.30
ALPHA_VISIBILITY_THRESHOLD = 16


def alpha_centroid(image: Image.Image) -> tuple[float, float]:
    alpha = image.getchannel("A")
    total = x_weight = y_weight = 0
    for y in range(image.height):
        for x in range(image.width):
            weight = alpha.getpixel((x, y))
            total += weight
            x_weight += (x + 0.5) * weight
            y_weight += (y + 0.5) * weight
    if total == 0:
        raise ValueError("The notification source has no visible pixels.")
    return x_weight / total, y_weight / total


def max_visible_radius(image: Image.Image, center: tuple[float, float]) -> float:
    alpha = image.getchannel("A")
    center_x, center_y = center
    radii = (
        ((x + 0.5 - center_x) ** 2 + (y + 0.5 - center_y) ** 2) ** 0.5
        for y in range(image.height)
        for x in range(image.width)
        if alpha.getpixel((x, y)) >= ALPHA_VISIBILITY_THRESHOLD
    )
    try:
        return max(radii)
    except ValueError as error:
        raise ValueError("The notification source has no visible edge.") from error


def render(
    cropped: Image.Image,
    source_center: tuple[float, float],
    source_radius: float,
    size: int,
) -> Image.Image:
    scale = size * TARGET_RADIUS_FRACTION / source_radius
    scaled_size = (
        max(1, round(cropped.width * scale)),
        max(1, round(cropped.height * scale)),
    )
    scaled = cropped.resize(scaled_size, Image.Resampling.LANCZOS)
    scaled_center = alpha_centroid(scaled)
    offset = (
        round(size / 2 - scaled_center[0]),
        round(size / 2 - scaled_center[1]),
    )
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(scaled, offset)

    final_center = alpha_centroid(canvas)
    final_radius = max_visible_radius(canvas, final_center)
    if abs(final_center[0] - size / 2) > 0.75 or abs(final_center[1] - size / 2) > 0.75:
        raise ValueError(f"The {size}px notification icon is not centered.")
    if final_radius > size * 0.32:
        raise ValueError(f"The {size}px notification icon exceeds its circular safety area.")
    return canvas


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    alpha_box = source.getchannel("A").getbbox()
    if alpha_box is None:
        raise ValueError("The notification source is fully transparent.")
    cropped = source.crop(alpha_box)
    source_center = alpha_centroid(cropped)
    source_radius = max_visible_radius(cropped, source_center)
    for density, size in OUTPUTS.items():
        destination = (
            ROOT
            / "android"
            / "app"
            / "src"
            / "main"
            / "res"
            / f"drawable-{density}"
            / "ic_stat_shareittoo_v2.png"
        )
        render(cropped, source_center, source_radius, size).save(
            destination,
            format="PNG",
            optimize=True,
        )
        print(destination.relative_to(ROOT))


if __name__ == "__main__":
    main()
