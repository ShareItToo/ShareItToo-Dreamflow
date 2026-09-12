#!/usr/bin/env python3

"""Generate optically centered Android adaptive-icon foreground layers."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/images/icononly_transparent_nobuffer.png"
OUTPUTS = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}

# Android may reuse the adaptive app icon inside a tighter circular
# notification surface. A 60% visible diameter preserves the strong launcher
# mark while keeping every tip away from that circle's edge.
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
        raise ValueError("The adaptive-icon source has no visible pixels.")
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
        raise ValueError("The adaptive-icon source has no visible edge.") from error


def render(
    cropped: Image.Image,
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
        raise ValueError(f"The {size}px adaptive foreground is not centered.")
    if final_radius > size * 0.32:
        raise ValueError(
            f"The {size}px adaptive foreground exceeds its notification safety area."
        )
    return canvas


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    alpha_box = source.getchannel("A").getbbox()
    if alpha_box is None:
        raise ValueError("The adaptive-icon source is fully transparent.")
    cropped = source.crop(alpha_box)
    source_radius = max_visible_radius(cropped, alpha_centroid(cropped))

    for density, size in OUTPUTS.items():
        destination = (
            ROOT
            / "android"
            / "app"
            / "src"
            / "main"
            / "res"
            / f"drawable-{density}"
            / "ic_launcher_foreground.png"
        )
        render(cropped, source_radius, size).save(
            destination,
            format="PNG",
            optimize=True,
        )
        print(destination.relative_to(ROOT))


if __name__ == "__main__":
    main()
