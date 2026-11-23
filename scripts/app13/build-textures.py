"""Build local WebP maps from pinned observations (Python, Pillow, NumPy).

    python scripts/app13/build-textures.py --cache <scratch-directory>
    python scripts/app13/build-textures.py --cache <scratch-directory> --planet venus saturn uranus neptune

Only the WebP derivatives belong in site/. Venus composites the checked-in
image-generation output with the pinned UVI data. The byte cap accommodates
the USGS global JPEG; hash changes and unexpected extents fail before decoding.
"""

import argparse
import hashlib
from pathlib import Path
from urllib.request import urlopen

import numpy as np
from PIL import Image, ImageOps


SOURCES = {
    "earth": (
        "jpg", (5400, 2700),
        "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/"
        "bmng-base/july/world.200407.3x5400x2700.jpg",
        "f55226d46d27e05511f2118dc6aa24f5dbf9b6b2cddc87cc6e0e7dd067c00b11",
        (1024, 2048, 4096),
    ),
    "mars": (
        "jpg", (21339, 10670),
        "https://astrogeology.usgs.gov/ckan/dataset/7131d503-cdc9-45a5-8f83-5126c0fd397e/"
        "resource/5ea881c6-01b3-41fa-a7af-42d2131b54f1/download/mars_viking_mdim21_clrmosaic_1km.jpg",
        "fdfcd335559c3dc67052b7e8a9565d850e336ac0d1f3ea7f5eb7826ffb44ecb2",
        (1024, 2048, 4096),
    ),
    "jupiter": (
        "tif", (3601, 1801),
        "https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia07/pia07782/PIA07782.tif",
        "f92ffc7a2fa0235c47ec8f1f168dd36bffeb6acc318292b237878a00a48cf7d9",
        (1024, 2048, 3600),
    ),
    "mercury": (
        "jpg", (1024, 513),
        "https://astrogeology.usgs.gov/ckan/dataset/279e5d50-ff2f-4250-bde3-bb510096079e/"
        "resource/2b5865c2-bd0d-4962-bdb0-c12f0502def1/download/mercury_messenger_mosaic_global_1024.jpg",
        "c9f5848c66ecc6c2a87f058ab4633506dcfc4b2f0ba6aa5ac258ba1c81468b22",
        (512, 1024),
    ),
    "venus": (
        "fit", (1440, 720),
        "https://data.darts.isas.jaxa.jp/pub/pds4/data/vco/vco_uvi/data_map/l3b/r0015/"
        "uvi_20160517_081718_365_l3b_v21.fit",
        "d2a960a93cc1ae1fd28a49cd133f0df66c0dc2c440bf54a6c3cbe86db79a227e",
        (720, 1440),
    ),
    "saturn": (
        "tif", (1800, 900),
        "https://archive.stsci.edu/hlsps/opal/cycle31/saturn/"
        "hlsp_opal_hst_wfc3-uvis_saturn-2024a_f395n-f502n-f631n_v1_globalmap.tif",
        "e34767fdf62fdb3931e6d3ea27b4f0b20f71c955a1c3b69195ab976839219b1a",
        (720, 1800),
    ),
    "uranus": (
        "tif", (721, 361),
        "https://archive.stsci.edu/hlsps/opal/cycle22/uranus/"
        "hlsp_opal_hst_wfc3-uvis_uranus-2014a_f467m-f547m-f658n_v1_globalmap.tif",
        "1e7944240bb74b2e84703b7c63dcb3d95cda62e6a4a8928522b3cc28d8b927a6",
        (384, 720),
    ),
    "neptune": (
        "tif", (721, 361),
        "https://archive.stsci.edu/hlsps/opal/cycle23/neptune/"
        "hlsp_opal_hst_wfc3-uvis_neptune-2016a_f467m-f547m-f657n_v1_globalmap.tif",
        "94a70f641ba3ad17c8591e31babbc9c6f2c125b9247c6a78dd48d8179bff5f03",
        (384, 720),
    ),
}
MAX_BYTES = 42 * 1024 * 1024
VENUS_INFILL = Path(__file__).with_name("venus-cloud-infill.webp")
OPAL = {
    "saturn": ((214, 194, 149), .90, .18, .902),
    "uranus": ((170, 205, 199), .57, .17, .977),
    "neptune": ((148, 180, 205), .81, .16, .983),
}


def source_bytes(path, url, digest):
    if path.exists():
        if path.stat().st_size > MAX_BYTES:
            raise ValueError(f"Source exceeds byte cap: {path.name}")
        data = path.read_bytes()
    else:
        with urlopen(url, timeout=60) as response:
            data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES or hashlib.sha256(data).hexdigest() != digest:
        raise ValueError(f"Source bytes have changed: {path.name}")
    if not path.exists():
        path.write_bytes(data)


def ramp(start, stop, value):
    u = np.clip((value - start) / (stop - start), 0, 1)
    return u * u * (3 - 2 * u)


def rgba(rgb, mask):
    return Image.fromarray(np.clip(np.dstack((rgb, mask * 255)) + .5, 0, 255).astype("uint8"))


def opal_map(key, base):
    if key != "saturn":
        # The two discrete end points in both axes are included in the TIFFs.
        base = base.crop((0, 0, 720, 360))
    w, h = base.size
    rgb = np.asarray(base, dtype=np.float32)
    luminance = rgb @ np.array([.2126, .7152, .0722], np.float32)
    rows = (np.arange(h)[:, None] + .5) / h
    # Keep away from seams and color fringing near poorly measured latitudes.
    # The 2024 Saturn map also has a narrow zone occulted by its rings.
    if key == "saturn":
        limits = ramp(.014, .052, rows) * (1 - ramp(.875, .937, rows))
        limits *= np.maximum(1 - ramp(.469, .503, rows), ramp(.532, .565, rows))
    elif key == "uranus":
        limits = 1 - ramp(.622, .742, rows)
    else:
        limits = ramp(.287, .407, rows)
    mask = limits * ramp(37, 99, luminance)
    neutral = float(np.median(luminance[mask > .95]))
    tint, contrast, chroma, flattening = OPAL[key]
    mapped = np.asarray(tint) + (luminance - neutral)[..., None] * contrast + (rgb - luminance[..., None]) * chroma
    # MAST supplies planetographic latitude, but the ellipsoid mesh UV rows are
    # parametric latitude. Map each destination row back to the observed row.
    parametric = np.pi * (.5 - rows)
    geographic = np.arctan2(np.sin(parametric), flattening * np.cos(parametric))
    src_y = np.clip((.5 - geographic[:, 0] / np.pi) * h - .5, 0, h - 1)
    low = src_y.astype(int)
    high = np.minimum(low + 1, h - 1)
    fraction = (src_y - low)[:, None]
    colors = mapped[low] * (1 - fraction[..., None]) + mapped[high] * fraction[..., None]
    coverage = mask[low] * (1 - fraction) + mask[high] * fraction
    return rgba(colors, coverage)


def fits_header(raw, offset):
    """Read the two simple, pinned HDU headers; not a general FITS reader."""
    cards = {}
    for pos in range(offset, len(raw), 80):
        card = raw[pos:pos + 80].decode("ascii")
        key = card[:8].strip()
        if key == "END":
            return cards, ((pos + 80 + 2879) // 2880) * 2880
        if card[8:10] == "= ":
            cards[key] = card[10:30].strip().strip("'").strip()
    raise ValueError("Missing FITS END card")


def venus_map(filename, size):
    raw = filename.read_bytes()
    primary, ext = fits_header(raw, 0)
    header, start = fits_header(raw, ext)
    fields = ("longitude", "latitude", "Radiance", "inangle", "emangle", "phangle", "azangle")
    formats = ("I", "I", "E", "I", "I", "I", "I")
    if (primary.get("NAXIS") != "0" or header.get("XTENSION") != "BINTABLE"
            or header.get("NAXIS1") != "16"
            or tuple(header[f"TTYPE{i}"] for i in range(1, 8)) != fields
            or tuple(header[f"TFORM{i}"] for i in range(1, 8)) != formats):
        raise ValueError("Unexpected Akatsuki map layout")
    dtype = list(zip(fields, (">i2", ">i2", ">f4", ">i2", ">i2", ">i2", ">i2")))
    table = np.frombuffer(raw, dtype=dtype, count=int(header["NAXIS2"]), offset=start)

    def cosine_column(name, index):
        samples = table[name]
        angle = float(header[f"TZERO{index}"]) + float(header[f"TSCAL{index}"]) * samples
        return np.where(samples == int(header[f"TNULL{index}"]), -1, np.cos(np.deg2rad(angle)))

    # Ease out near the source terminator and limb. A Minnaert-style adjustment
    # removes broad illumination, so the live shader doesn't light a baked phase.
    sun = cosine_column("inangle", 4)
    view = cosine_column("emangle", 5)
    w, h = size
    x = table["longitude"].astype(int) // 2
    y = h - 1 - table["latitude"].astype(int) // 2
    radiance = table["Radiance"]
    good = (sun > .14) & (view > .14) & (x >= 0) & (x < w) & (y >= 0) & (y < h) & np.isfinite(radiance) & (radiance > 0)
    bins = y[good] * w + x[good]
    weights = ramp(.14, .40, sun[good]) * ramp(.14, .37, view[good])
    correction = radiance[good] / (sun[good] ** .69 * view[good] ** (-.31))
    valid = np.bincount(bins, weights=weights, minlength=w*h).reshape(h, w)
    accumulated = np.bincount(bins, weights=weights*correction, minlength=w*h).reshape(h, w)
    corrected = accumulated / np.maximum(valid, 1e-12)
    samples = corrected[valid > 3]
    if len(samples) < 1000:
        raise ValueError("Unexpectedly low Akatsuki coverage")
    low, high = np.percentile(samples, [1.5, 97.5])
    relief = np.clip((corrected-low)/(high-low), 0, 1) - .5
    color = np.array([222., 202., 166.]) + relief[..., None] * np.array([75., 88., 90.])
    coverage = np.clip(valid / 4, 0, 1)
    # Display longitude only: center the observed patch in the initial approach.
    shift = round((.27 - float(header["S_SOLLON"]) / 360) * w)
    return rgba(np.roll(color, shift, axis=1), np.roll(coverage, shift, axis=1))


def composite_venus(observed, generated):
    """Match levels and wrap the generated image; don't replace valid UVI pixels."""
    w, h = observed.size
    mask = np.asarray(observed.getchannel("A"), dtype=np.float32) / 255
    reference = np.asarray(observed.convert("RGB"), dtype=np.float32)
    layer = np.asarray(ImageOps.fit(generated.convert("RGB"), (w, h), Image.Resampling.LANCZOS),
                       dtype=np.float32).copy()
    ref_values = reference[mask > .95]
    gen_values = layer[mask < .02]
    ref_range = np.percentile(ref_values, [8, 50, 92], axis=0)
    gen_range = np.percentile(gen_values, [8, 50, 92], axis=0)
    gain = np.clip((ref_range[2]-ref_range[0]) / np.maximum(gen_range[2]-gen_range[0], 8), .66, 1.45)
    layer = np.clip((layer-gen_range[1])*gain + ref_range[1], 0, 255)

    # A short crossfade across the longitude cut avoids a stripe on the sphere.
    # This affects only generated cloud pixels in the finished composite.
    edge = round(w * .028)
    blend = (.5 * (1 - ramp(0, edge-1, np.arange(edge))))[None, :, None]
    left, right = layer[:, :edge].copy(), layer[:, -edge:][:, ::-1].copy()
    layer[:, :edge] = left*(1-blend) + right*blend
    layer[:, -edge:] = (right*(1-blend) + left*blend)[:, ::-1]
    # The very first/last rows converge to points at the poles.
    lines = max(2, round(h * .025))
    taper = (1 - ramp(0, lines-1, np.arange(lines)))[:, None, None]
    for pole, weight in ((layer[:lines], taper), (layer[-lines:], taper[::-1])):
        pole[:] = pole*(1-weight) + pole.mean(axis=1, keepdims=True)*weight

    coverage = mask[..., None]
    composite = reference*coverage + layer*(1-coverage)
    return Image.fromarray(np.clip(composite+.5, 0, 255).astype("uint8"))


def source_image(key, filename, extent, levels):
    if key == "venus":
        with Image.open(VENUS_INFILL) as generated:
            return composite_venus(venus_map(filename, extent), generated)
    with Image.open(filename) as src:
        if src.size != extent:
            raise ValueError(f"Unexpected image extent: {key} {src.size}")
        if key == "mars":
            src.draft("RGB", (levels[-1], levels[-1] // 2))
        base = src.convert("RGB")
    if key in OPAL:
        return opal_map(key, base)
    if key == "jupiter":
        # The gridless PIA07782 includes a repeated longitude endpoint.
        base = base.crop((0, 0, 3600, 1800))
    # Shift Cassini's seam out of the close-up: center the observed Great Red
    # Spot (original u≈.365) near u=.5. This is display longitude, not a chart.
    if key == "jupiter":
        w, h = base.size
        split = round(w * .135)
        shifted = Image.new("RGB", (w, h))
        shifted.paste(base.crop((w - split, 0, w, h)), (0, 0))
        shifted.paste(base.crop((0, 0, w - split, h)), (split, 0))
        base = shifted
    return base


def render(key, filename, extent, levels, output):
    base = source_image(key, filename, extent, levels)
    for width in levels:
        scaled = base.resize((width, width // 2), Image.Resampling.LANCZOS)
        name = output / f"{key}-{width}.webp"
        scaled.save(name, "WEBP", quality=86 if width <= 2048 else 89, method=6, exact=True)
        print(f"{name.name}: {name.stat().st_size:,} bytes")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", required=True, type=Path)
    parser.add_argument("--planet", nargs="+", choices=SOURCES, default=list(SOURCES))
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    output = Path(__file__).resolve().parents[2] / "site" / "app13" / "textures"
    output.mkdir(parents=True, exist_ok=True)
    Image.MAX_IMAGE_PIXELS = 250_000_000
    for key in args.planet:
        ext, size, url, digest, levels = SOURCES[key]
        path = args.cache / f"solar-{key}-src.{ext}"
        source_bytes(path, url, digest)
        render(key, path, size, levels, output)


if __name__ == "__main__":
    main()
