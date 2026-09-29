"""Build a compact local address index from the OSM data used by the demo.

Usage: python3 tools/build-address-index.py path/to/projected-osm.json
"""
import json
import sys
from pathlib import Path

if len(sys.argv) != 2:
    raise SystemExit(__doc__)
source = Path(sys.argv[1])
target = Path(__file__).resolve().parents[1] / 'assets' / 'address-data.js'
elements = json.loads(source.read_text())
entries = []
seen = set()
for element in elements:
    tags = element.get('tags') or {}
    geometry = element.get('geometry') or []
    if not geometry:
        continue
    e = round(sum(point[0] for point in geometry) / len(geometry))
    n = round(sum(point[1] for point in geometry) / len(geometry))
    if not (335000 <= e <= 359000 and 6749000 <= n <= 6775000):
        continue
    street = tags.get('addr:street')
    number = tags.get('addr:housenumber')
    if street and number:
        name, kind = f'{street} {number}', 'address'
    elif tags.get('highway') and tags.get('name'):
        name, kind = tags['name'], 'road'
    elif tags.get('name') and (tags.get('place') or tags.get('natural') or tags.get('water')):
        name, kind = tags['name'], 'place'
    else:
        continue
    city = tags.get('addr:city') or ''
    key = (name.casefold(), kind, round(e / (700 if kind == 'road' else 5)), round(n / (700 if kind == 'road' else 5)))
    if key in seen:
        continue
    seen.add(key)
    entries.append([name, e, n, kind, city])
entries.sort(key=lambda row: (row[0].casefold(), row[3], row[1], row[2]))
target.write_text('window.ADDRESS_INDEX=' + json.dumps(entries, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(f'{len(entries)} entries, {target.stat().st_size} bytes -> {target}')
