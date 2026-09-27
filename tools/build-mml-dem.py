#!/usr/bin/env python3
"""Download MML KM2 to small, static, lazily loaded terrain tiles.

Requires MML_API_KEY in the environment and Pillow + NumPy. The key is never
written to the output, so the generated tiles can be published on GitHub Pages.
"""
import concurrent.futures
import gzip
import io
import json
import os
from pathlib import Path
import time
from urllib.parse import urlencode
from urllib.request import urlopen

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "mml-dem"
URL = "https://avoin-karttakuva.maanmittauslaitos.fi/ortokuvat-ja-korkeusmallit/wcs/v2"
E_MIN, N_MAX, TILE, NX, NY = 335000, 6775000, 2000, 12, 13
KEY = os.environ.get("MML_API_KEY")
if not KEY:
    raise SystemExit("MML_API_KEY is required")
OUT.mkdir(parents=True, exist_ok=True)


def fetch(ix, iy):
    path = OUT / f"{ix}-{iy}.bin.gz"
    overview_path = OUT / f"{ix}-{iy}.overview.bin.gz"
    if path.exists() and overview_path.exists():
        return ix, iy, "cached"
    e0 = E_MIN + ix * TILE
    n1 = N_MAX - iy * TILE
    params = [
        ("service", "WCS"), ("version", "2.0.1"),
        ("request", "GetCoverage"), ("CoverageID", "korkeusmalli_2m"),
        ("SUBSET", f"E({e0},{e0 + TILE})"),
        ("SUBSET", f"N({n1 - TILE},{n1})"),
        ("format", "image/tiff"), ("geotiff:compression", "LZW"),
        ("api-key", KEY),
    ]
    for attempt in range(4):
        try:
            with urlopen(URL + "?" + urlencode(params), timeout=90) as response:
                data = response.read()
            raster = np.asarray(Image.open(io.BytesIO(data)), dtype=np.float32)
            if raster.shape != (1000, 1000) or not np.isfinite(raster).all():
                raise ValueError(f"Unexpected KM2 raster at {ix},{iy}: {raster.shape}")
            values = np.rint(raster * 10).astype("<i2")
            path.write_bytes(gzip.compress(values.tobytes(), compresslevel=6))
            overview_path.write_bytes(gzip.compress(values[::8, ::8].copy().tobytes(), compresslevel=6))
            return ix, iy, "downloaded"
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    jobs = [pool.submit(fetch, x, y) for y in range(NY) for x in range(NX)]
    for done in concurrent.futures.as_completed(jobs):
        x, y, status = done.result()
        print(x, y, status, flush=True)

# Build a small always-loaded 16 m overview from the same 2 m source raster.
overview = np.empty((NY * 125, NX * 125), dtype="<i2")
for y in range(NY):
    for x in range(NX):
        block = np.frombuffer(gzip.decompress((OUT / f"{x}-{y}.overview.bin.gz").read_bytes()), dtype="<i2").reshape((125, 125))
        overview[y * 125:(y + 1) * 125, x * 125:(x + 1) * 125] = block
(OUT / "overview.bin.gz").write_bytes(gzip.compress(overview.tobytes(), compresslevel=6))
for path in OUT.glob("*.overview.bin.gz"):
    path.unlink()
(OUT / "manifest.json").write_text(json.dumps({
    "source": "Maanmittauslaitos Korkeusmalli 2 m", "eMin": E_MIN,
    "nMax": N_MAX, "tileMetres": TILE, "tileSamples": 1000,
    "tilesX": NX, "tilesY": NY, "step": 2,
    "overviewStep": 16, "overviewCols": NX * 125, "overviewRows": NY * 125,
}, separators=(",", ":")))
print("complete", len(list(OUT.glob("*.bin.gz"))), flush=True)
