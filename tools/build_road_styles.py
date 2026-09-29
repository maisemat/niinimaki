"""Classify the road lines in map.js from their current OpenStreetMap tags."""
import gzip
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
ways = json.load(gzip.open(root / 'tools/road-tags-osm-2026-09-28.json.gz', 'rt'))['ways']
features = json.loads((root / 'assets/map.js').read_text().split('=', 1)[1].rstrip(';\n'))
major = {'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link'}
trails = {'path', 'footway', 'bridleway', 'steps', 'pedestrian'}
unpaved = {'unpaved', 'gravel', 'fine_gravel', 'compacted', 'ground', 'dirt', 'earth', 'sand', 'mud', 'grass', 'grass_paver', 'woodchips'}
paved = {'asphalt', 'paved', 'concrete', 'concrete:plates', 'paving_stones', 'sett', 'cobblestone'}
classes = {}
counts = [0] * 5
for feature in features:
    if feature['kind'] not in ('road', 'main'):
        continue
    tags = ways.get(str(feature['id']), {})
    highway, surface = tags.get('highway', ''), tags.get('surface', '')
    if highway in trails:
        code = 3  # Narrow brown footpath.
    elif highway in major:
        code = 1  # Wide dark national / regional highway.
    elif highway == 'cycleway':
        code = 4 if surface in paved else 3
    elif surface in unpaved or (highway == 'track' and surface not in paved):
        code = 2  # Gravel or compacted track.
    else:
        code = 0  # Ordinary gray road; unknown surfaces stay neutral.
    classes[str(feature['id'])] = code
    counts[code] += 1
output = 'window.ROAD_STYLES=' + json.dumps(classes, separators=(',', ':')) + ';\n'
(root / 'assets/road-styles.js').write_text(output)
print('Road styles:', counts, 'bytes:', len(output))
