"""Combine pinned spacecraft maps and a separately generated image atlas."""

import argparse
import hashlib
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps


NASA = "https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/image"
JPL = "https://d2pn8kiwq2w21t.cloudfront.net/original_images"
MAX_BYTES = 24 * 1024 * 1024
SIZE = (1024, 512)
# The largest pinned product (PIA18435) is 127,360,800 pixels. Downloads
# are checksum-verified before Pillow opens them.
Image.MAX_IMAGE_PIXELS = 130_000_000


def nasa(planet, body, sha, ext="jpg"):
    url = f"{NASA}/{planet.lower()}---{body.lower()}/{planet}%20-%20{body}.{ext}"
    return (f"{body.lower()}.{ext}", url, sha)


def jpl(stem, number, sha):
    return (f"{stem}.jpeg", f"{JPL}/jpegPIA{number}.jpg", sha)


SOURCES = {
    "moon": ("moon.png", "https://astro4edu.org/media/multimedia/moon-map-from-the-clementine-mission.png",
             "994b973d2caaf05f74f5b76850e7cd34bca5a3f54e6442441a799fb82f2b7907"),
    "phobos": nasa("Mars", "Phobos", "8ec807b353eb28f44b5aa24b8a887935ee5563f5b63bde2430a9988220f71463"),
    "deimos": nasa("Mars", "Deimos", "204e89cc7dc128e9fa6ae5f14cc23dc7917a4a8ccab9feff1a9544d22b354dce"),
    "io": ("io.jpeg", "https://www.nasa.gov/wp-content/uploads/2023/03/387540main_Io_flat_full.jpg",
           "5d3250eb7ee8f40ea0c9888a00bc4767209b6d6ce6fc27170d77234deeb71a65"),
    "europa": nasa("Jupiter", "Europa", "50d01ca5c01352d1c507bb17fefd1c46ba11260305656250062c6cdac89c8ebf"),
    "ganymede": nasa("Jupiter", "Ganymede", "1aa9d5a6f20e72230c13ce3d78592fc056e22f1e1ee39ea7acfa7e08d09fe173"),
    "callisto": nasa("Jupiter", "Callisto", "b9f4fa5db94debabd12814853fd132db3449889646a490b6f95a897b2c47b121"),
    "mimas": jpl("mimas-a", "17214", "f2d62eaa50c7864e303a13434738a7bc6db0e133f1f4b163c2506979800c1116"),
    "enceladus": jpl("enceladus-a", "18435", "5b60d0161efd659f6d95281559ad4b30826fd02ee72944dbb3f8b7679f65ed4d"),
    "tethys": jpl("tethys-a", "08416", "083cf9cd0cc58d99b172d72fa2847e68977809f83a229918b7e48afeb5178c01"),
    "dione": ("dione-new.jpeg", "https://d2pn8kiwq2w21t.cloudfront.net/images/jpegPIA12814.width-1024.jpg",
              "f0475500f0eede1a881960d351d6d300a4fd8c273716b200c016df15fab010d8"),
    "rhea": jpl("rhea-a", "14928", "dd17563a8cd20fb057af7f4f0df465855f895e61cf29ec0a27e3e8862d14bd5e"),
    "titan": jpl("titan-a", "19658", "e918a4a18647dde41ede739c50427b28fcbb1872ba570ff3c637593852d7396a"),
    "iapetus": jpl("iapetus-a", "18436", "6e0e1d17a50343d9176912d047392c4f7cd67c48bdb30789918a4ff24d9f683b"),
    "miranda": nasa("Uranus", "Miranda", "844b2deb88b8dbc93142bf5b85036ce7dd45db131e6251b4e6a95e179ae44c81"),
    "ariel": nasa("Uranus", "Ariel", "fc0f8a59b5c29e44e4a3409e452f0427f5b53b8c9b41c89dc35d28babaae5cee"),
    "umbriel": nasa("Uranus", "Umbriel", "f1378bc2880bb0d4ddad50815083987aab38c9aae630cbd65465c6773495e511"),
    "titania": nasa("Uranus", "Titania", "087425752c8f5090965f5a4fac7d50a4c450563edd50b807bbc1d45ebeedd312"),
    "oberon": nasa("Uranus", "Oberon", "0d609cc834478c95be1078dff8527634b66bf58afaad8ea59a6c2d8bce64a4d0", "tif"),
    "triton": jpl("triton-a", "18668", "eabcd1c5e4170a271d09cd4a525e838063f470ec88844265f916f42b8dfbd2cc"),
}

# Model requests are two 3x2 grids, with one reference cell per target.
ATLAS_GROUPS = (("deimos", "io", "europa", "callisto", "miranda", "ariel"),
                ("umbriel", "titania", "oberon", "triton", "nereid"))
ATLASES = (
    ("moon-infill-1.webp", "d66ef8e84f8224ecd67472558f3c8c62adcf3ac45d7f293d7a5ce2b20bdaed4d"),
    ("moon-infill-2.webp", "fb422488b856e70535001fae29320ef3ea045e7e0a381ff6ec195a4180f5e05a"),
)
INFILL = {id: (group, index) for group, items in enumerate(ATLAS_GROUPS)
          for index, id in enumerate(items)}
BLACK_GAPS = {"miranda", "ariel", "umbriel", "titania", "oberon", "triton"}
# Crop non-map margins and labels in the pinned source files. Io is already
# mapped in longitude but only its central latitude belt is provided here.
CROPS = {"io": (0, 100, 804, 502), "tethys": (300, 242, 11858, 6021),
         "titan": (189, 202, 4245, 2230)}


def fetch(cache, id):
    name, url, digest = SOURCES[id]
    target = cache / name
    if target.exists() and target.stat().st_size <= MAX_BYTES:
        data = target.read_bytes()
    elif target.exists():
        raise ValueError(f"Source too large: {target}")
    else:
        with urlopen(url, timeout=35) as result:
            data = result.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES or hashlib.sha256(data).hexdigest() != digest:
        raise ValueError(f"Unexpected source bytes for {id}")
    if not target.exists():
        target.write_bytes(data)
    with Image.open(target) as im:
        if id in CROPS:
            im = im.crop(CROPS[id])
        if abs(im.width - 2 * im.height) > 2:
            raise ValueError(f"{id} is not a cylindrical 2:1 map")
        return im.convert("RGB").resize(SIZE, Image.Resampling.LANCZOS)


def observed_mask(id, im):
    if id == "nereid":
        return Image.new("L", SIZE, 0)
    if id == "io":
        # Only the outer bars of this image are missing. Dark volcanic
        # features within the latitude strip are measured and must survive.
        mask = Image.new("L", SIZE)
        ImageDraw.Draw(mask).rectangle((0, 94, 1023, 416), fill=255)
        return mask
    if id in BLACK_GAPS:
        # Empty areas touch the map's edge. Do not mask isolated dark
        # measured features simply because their brightness is low.
        maximum = np.asarray(im).max(axis=2)
        mask = Image.fromarray((maximum > 23).astype(np.uint8) * 255).copy()
        perimeter = ([(x, y) for x in range(mask.width) for y in (0, mask.height-1)]
                     + [(x, y) for y in range(mask.height) for x in (0, mask.width-1)])
        for pixel in perimeter:
            if mask.getpixel(pixel) == 0:
                ImageDraw.floodfill(mask, pixel, 128)
        return Image.fromarray(np.uint8(np.asarray(mask) != 128)*255).filter(ImageFilter.MinFilter(5))
    if id == "deimos":
        # Conservatively retain the recognizable Viking mosaic, excluding
        # the smoothed/blank outside. This is not a mission footprint file.
        poly = [(16,349),(79,281),(106,224),(74,153),(119,94),(201,59),(308,43),
                (425,52),(536,70),(614,111),(731,127),(834,160),(898,215),(943,259),
                (1023,330),(1023,511),(0,511),(0,395)]
        mask = Image.new("L", SIZE)
        ImageDraw.Draw(mask).polygon(poly, fill=255)
        return mask
    if id in {"callisto", "europa"}:
        # Older display mosaics have smooth white gap fill, not dark nodata.
        gray = ImageOps.grayscale(im)
        g = np.asarray(gray, dtype=np.float32)
        response = np.abs(g - np.asarray(gray.filter(ImageFilter.GaussianBlur(2)), dtype=np.float32))
        detail = np.asarray(Image.fromarray(np.uint8(np.minimum(response * 12, 255)))
                            .filter(ImageFilter.BoxBlur(11)))
        missing = (g > (183 if id == "callisto" else 199)) & (detail < 11)
        mask = Image.fromarray(np.uint8(~missing) * 255)
        draw = ImageDraw.Draw(mask)
        if id == "europa":
            draw.rectangle((0, 493, 1023, 511), fill=0)
        else:
            # The bright, diffuse longitudinal gap in this particular
            # Voyager display mosaic is not interpretable terrain.
            draw.polygon([(598,0),(686,0),(673,75),(663,165),(647,228),
                          (616,230),(625,151),(610,65)], fill=0)
        return mask.filter(ImageFilter.MinFilter(5))
    return Image.new("L", SIZE, 255)


def atlas_panel(atlas, index):
    w, h = atlas.size
    x, y = index % 3, index // 3
    r = min(w // 3, h // 2) // 24
    image = atlas.crop((x*w//3 + r, y*h//2 + r, (x+1)*w//3 - r, (y+1)*h//2 - r))
    out = np.array(image.resize(SIZE, Image.Resampling.LANCZOS), dtype=np.float32)
    # Crossfade the atlas ends so the invented patch has no engraved meridian.
    for i in range(18):
        f = .5 * (1 - i / 18)
        both = (out[:, i] + out[:, -1-i]) * f
        out[:, i] = out[:, i] * (1 - 2*f) + both
        out[:, -1-i] = out[:, -1-i] * (1 - 2*f) + both
    return out


def box_sum(values, radius):
    """Sum a square neighborhood; longitude wraps, latitude does not."""
    for axis, mode in ((0, "edge"), (1, "wrap")):
        padding = [(0, 0)] * values.ndim
        padding[axis] = (radius + 1, radius)
        sums = np.cumsum(np.pad(values, padding, mode=mode), axis=axis, dtype=np.float64)
        sums = np.moveaxis(sums, axis, 0)
        width = 2*radius + 1
        values = np.moveaxis(sums[width:] - sums[:-width], 0, axis)
    return values


def match_fill(observed, mask, generated):
    """Adjust only the generated layer, first overall and then near the seam."""
    known = np.asarray(mask) == 255
    if not known.any():  # Nereid has no observed map to match.
        return Image.fromarray(generated.astype(np.uint8))
    reference = np.asarray(observed, dtype=np.float32)
    radius = 15
    total = (2*radius + 1)**2
    count = box_sum(known, radius)
    near_edge = (count > 0) & (count < total)
    ref_levels = np.percentile(reference[known & near_edge], [10, 50, 90], axis=0)
    gen_levels = np.percentile(generated[~known & near_edge], [10, 50, 90], axis=0)
    gain = np.clip((ref_levels[2] - ref_levels[0]) / np.maximum(gen_levels[2] - gen_levels[0], 8), .8, 1.25)
    layer = np.clip((generated - gen_levels[1])*gain + ref_levels[1], 0, 255)

    # Match neighboring averages, not individual features. Fade this color
    # offset away from the seam or when only a few source pixels are nearby.
    missing = total - count
    ref_mean = box_sum(reference * known[..., None], radius) / np.maximum(count[..., None], 1)
    gen_mean = box_sum(layer * ~known[..., None], radius) / np.maximum(missing[..., None], 1)
    strength = np.clip(np.minimum(count, missing) / (.16 * total), 0, 1)
    strength = strength**2 * (3 - 2*strength)
    layer += np.clip(ref_mean - gen_mean, -64, 64) * strength[..., None]
    return Image.fromarray(np.uint8(np.clip(layer + .5, 0, 255)))


def compose(observed, mask, generated):
    # Keep every retained observational pixel exactly, including at the edge.
    return Image.composite(observed, generated, mask)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", required=True, type=Path)
    parser.add_argument("--prepare", type=Path, help="Write preview PNGs of the observed RGB and its mask only")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    out = args.prepare or Path(__file__).resolve().parents[2] / "site/app13/textures/moons"
    out.mkdir(parents=True, exist_ok=True)
    atlases = []
    if not args.prepare:
        for name, digest in ATLASES:
            data = Path(__file__).with_name(name).read_bytes()
            if hashlib.sha256(data).hexdigest() != digest:
                raise ValueError(f"Unexpected generated atlas bytes for {name}")
            with Image.open(BytesIO(data)) as atlas:
                if atlas.size != (1536, 1024):
                    raise ValueError(f"Unexpected dimensions for {name}")
                atlases.append(atlas.convert("RGB"))
    for id in [*SOURCES, "nereid"]:
        observed = fetch(args.cache, id) if id in SOURCES else Image.new("RGB", SIZE)
        mask = observed_mask(id, observed)
        coverage = np.mean(np.asarray(mask)) / 255
        if id in INFILL and id != "nereid" and not 0 < coverage < 1:
            raise ValueError(f"Expected both observations and gaps for {id}")
        if args.prepare:
            observed.save(out / f"{id}.png")
            mask.save(out / f"{id}-mask.png")
        else:
            if id in INFILL:
                group, index = INFILL[id]
                fill = match_fill(observed, mask, atlas_panel(atlases[group], index))
                observed = compose(observed, mask, fill)
                if id != "nereid":
                    mask.convert("1").save(out / f"{id}-coverage.png", optimize=True)
            observed.save(out / f"{id}.webp", "WEBP", lossless=True, method=6)
        print(f"{id}: {coverage:.1%} of the map uses observations")


if __name__ == "__main__":
    main()
