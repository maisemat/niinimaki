// OSM land cover and hydrology in ETRS-TM35FIN metres.
(() => {
  const all = window.MAP_FEATURES || [];
  function region(points, kind) {
    let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity;
    for (const [e, n] of points) {
      e0 = Math.min(e0, e); e1 = Math.max(e1, e);
      n0 = Math.min(n0, n); n1 = Math.max(n1, n);
    }
    return {points, kind, e0, e1, n0, n1};
  }
  function inside(p, e, n) {
    if (e < p.e0 || e > p.e1 || n < p.n0 || n > p.n1) return false;
    let yes = false;
    for (let i = 0, j = p.points.length - 1; i < p.points.length; j = i++) {
      const a = p.points[i], b = p.points[j];
      if ((a[1] > n) !== (b[1] > n) && e < (b[0] - a[0]) * (n - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
    }
    return yes;
  }

  const fields = all.filter(f => f.kind === 'field' && f.geometry.length >= 3).map(f => region(f.geometry, 'field'));
  for (let i = 0; i < fields.length; i++) {
    const a = fields[i], used = new Set();
    for (let j = 0; j < i; j++) {
      const b = fields[j], dx = Math.max(0, a.e0 - b.e1, b.e0 - a.e1), dy = Math.max(0, a.n0 - b.n1, b.n0 - a.n1);
      if (Math.hypot(dx, dy) < 35) used.add(b.shade);
    }
    let choice = (i * 3) % 8;
    for (let k = 0; k < 8; k++) if (!used.has((choice + k) % 8)) { choice = (choice + k) % 8; break; }
    a.shade = choice;
  }
  function spatial(items){const bins=new Map();items.forEach((p,i)=>{for(let x=Math.floor(p.e0/250);x<=Math.floor(p.e1/250);x++)for(let y=Math.floor(p.n0/250);y<=Math.floor(p.n1/250);y++){const key=x+','+y;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(i)}});return(e,n)=>bins.get(Math.floor(e/250)+','+Math.floor(n/250))||[]}
  const fieldCandidates=spatial(fields);
  function fieldAt(e,n){for(const i of fieldCandidates(e,n))if(inside(fields[i],e,n))return i;return -1}

  const scrub=(window.SCRUB_POLYGONS||[]).map(r=>region(r,'scrub'));
  const scrubCandidates=spatial(scrub);const inScrub=(e,n)=>scrubCandidates(e,n).some(i=>inside(scrub[i],e,n));
  // Source-accurate lake outlines, including independent OSM islands.
  const bodies = (window.HYDROLOGY_MESH?.lakes || []).map(b => ({outer:region(b.rings[0],'lake'),holes:b.rings.slice(1).map(r=>region(r,'island')),name:b.name,surface:b.level}));
  function bodyAt(e,n){return bodies.find(b=>inside(b.outer,e,n)&&!b.holes.some(h=>inside(h,e,n)))||null}
  // Replaced at startup with the same triangle sampler that draws water.
  function waterSurface(e,n){return bodyAt(e,n)?.surface ?? -Infinity}
  window.LANDCOVER={fields,bodies,inside,inScrub,fieldAt,inField:(e,n)=>fieldAt(e,n)>=0,bodyAt,waterSurface,inWater:(e,n)=>Number.isFinite(waterSurface(e,n))};
})();
