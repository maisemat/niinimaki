"""Build one conforming terrain mesh and water mesh from OSM and DEM inputs.
Usage: PYTHONPATH=work/geometry-deps python tools/build_hydrology.py input.json output-dir
Requires Shapely >=2.1 and NumPy. No browser/runtime geometry dependencies.
"""
import sys,json,math,base64,time,gzip
from pathlib import Path
import numpy as np
from shapely import Polygon,LineString,Point,box,union_all,make_valid,constrained_delaunay_triangles,STRtree
from shapely.geometry import MultiPolygon
D=json.load(gzip.open(sys.argv[1],'rt') if sys.argv[1].endswith('.gz') else open(sys.argv[1]));out=Path(sys.argv[2]);G=D['GEO'];O=D['OUTER_GEO'];E=G['eMin'];N=G['nMax']
M=D.get('MID_GEO');grids=[G,O]+([M] if M else [])
for g in grids:g['heights']=np.asarray(g['heights']).reshape(g['rows'],g['cols'])
def sample(g,e,n):
 x=max(0,min(g['cols']-1.000001,(e-g['eMin'])/g['step']));y=max(0,min(g['rows']-1.000001,(g['nMax']-n)/g['step']));i=int(x);j=int(y);u=x-i;v=y-j;h=g['heights'];return float((h[j,i]*(1-u)+h[j,i+1]*u)*(1-v)+(h[j+1,i]*(1-u)+h[j+1,i+1]*u)*v)
xmax=E+(G['cols']-1)*G['step'];ymin=N-(G['rows']-1)*G['step'];main=box(E,ymin,xmax,N)
def raw(e,n):
 ce=max(E,min(xmax,e));cn=max(ymin,min(N,n));d=math.hypot(e-ce,n-cn)
 if d==0:return sample(G,e,n)
 b=sample(M,e,n) if M and M['eMin']<=e<=M['eMin']+(M['cols']-1)*M['step'] and M['nMax']-(M['rows']-1)*M['step']<=n<=M['nMax'] else sample(O,e,n);return b+(sample(G,ce,cn)-b)*max(0,1-d/1500)
def polygons(g):
 if g.is_empty:return []
 if g.geom_type=='Polygon':return [g]
 return [p for a in getattr(g,'geoms',[]) for p in polygons(a)]
def valid(rings):
 p=Polygon(rings[0]);holes=[h for h in rings[1:] if p.covers(Polygon(h).representative_point())]
 return union_all(polygons(make_valid(Polygon(rings[0],holes))))
# Relations are authoritative for islands. Do not also fill their tagged member ways.
lakes=[];used=Polygon()
for r in D['lakes']:
 p=valid(r['rings']);p=p.difference(used)
 if not p.is_empty:lakes.append({'poly':p,'name':r['name']});used=union_all([used,p])
relation_shells=union_all([Polygon(r['rings'][0]) for r in D['lakes']])
for w in D['ways']:
 if w['kind'] in ('river','stream','riverbank'):continue
 p=valid([w['points']])
 if p.is_empty or relation_shells.covers(p.representative_point()):continue
 p=p.difference(used)
 if not p.is_empty:lakes.append({'poly':p,'name':w['name']});used=union_all([used,p])
# Independently tagged OSM islands must also be holes in simple water ways.
islands=union_all([valid([r['points']]) for r in D.get('islands',[])])
for b in lakes:b['poly']=b['poly'].difference(islands)
used=union_all([b['poly'] for b in lakes])
# Use the median interior DEM level, not an assumed vertical datum conversion.
for b in lakes:
 p=b['poly'];x0,y0,x1,y1=p.bounds;vals=[];step=max(25,math.sqrt(p.area/2000))
 for e in np.arange(x0+step/2,x1,step):
  for n in np.arange(y0+step/2,y1,step):
   if p.contains(Point(e,n)):vals.append(raw(e,n))
 if not vals:vals=[raw(*p.representative_point().coords[0])]
 b['level']=float(np.median(vals))
# Mapzen's water pixels put Tunturilammi above Onkilammi even though the
# observed outlet and the two mapped connecting waterways run Onkilammi ->
# Tunturilammi. Their surveyed levels are unavailable in this input. Keep the
# Onkilammi estimate and use an explicitly illustrative 0.5 m
# drop for Tunturilammi; never present it as a measured lake elevation.
onki=next((b['level'] for b in lakes if b['name']=='Onkilammi'),None)
if onki is not None:
 for b in lakes:
  if b['name']=='Tunturilammi':b['level']=onki-.5
print('Lakes:',len(lakes),'levels:',[(b['name'],round(b['level'],2)) for b in lakes if b['name']],flush=True)
lake_tree=STRtree([b['poly'] for b in lakes])
def lake_level(e,n,tolerance=.001):
 pt=Point(e,n)
 for idx in lake_tree.query(pt.buffer(tolerance)):
  if lakes[idx]['poly'].distance(pt)<=tolerance:return lakes[idx]['level']
 return None
# River elevations follow a monotone longitudinal profile. A cross-section has
# one level, unlike draping a ribbon up both banks. Profiles remain DEM estimates.
def isotonic(values):
 blocks=[]
 for v in values:
  blocks.append([float(v),1])
  while len(blocks)>1 and blocks[-2][0]<blocks[-1][0]:
   b=blocks.pop();a=blocks.pop();k=a[1]+b[1];blocks.append([(a[0]*a[1]+b[0]*b[1])/k,k])
 return np.array([v for v,k in blocks for _ in range(k)])
streams=[]
for s in D['streams']:
 line=LineString(s['geometry'])
 if line.length<.1:continue
 # OSM waterway geometry usually runs downstream. At a lake connection its
 # endpoint is a stronger vertical constraint than the coarse DEM shoreline.
 # In particular, reversing a lake outlet by its DEM heights made the first
 # stream triangle rise several metres above the level lake surface.
 start_lake=lake_level(*line.coords[0],tolerance=8)
 end_lake=lake_level(*line.coords[-1],tolerance=8)
 # A connecting stream must run from the higher lake to the lower one.
 if start_lake is not None and end_lake is not None and start_lake<end_lake:
  line=LineString(list(line.coords)[::-1]);start_lake,end_lake=end_lake,start_lake
 elif start_lake is None and end_lake is None and raw(*line.coords[0])<raw(*line.coords[-1]):
  line=LineString(list(line.coords)[::-1])
 ds=np.linspace(0,line.length,max(2,int(line.length/12)+1));xy=np.array([line.interpolate(float(d)).coords[0] for d in ds]);hs=np.array([raw(e,n) for e,n in xy])
 if start_lake is not None and end_lake is None:
  # Remove the DEM's local lake-level bias along the entire outlet. This
  # retains the measured stream gradient while joining the lake exactly.
  hs-=hs[0]-start_lake
  hs=np.minimum(hs,start_lake)
 elif end_lake is not None and start_lake is None:
  hs-=hs[-1]-end_lake
  hs=np.maximum(hs,end_lake)
 elif start_lake is not None and end_lake is not None:
  hs=np.interp(ds,[0,line.length],[start_lake,end_lake])
 for k,(e,n) in enumerate(xy):
  level=lake_level(e,n,max(3,s['width']))
  if level is not None:hs[k]=level
 hs=isotonic(hs)
 streams.append({'line':line,'ds':ds,'hs':hs,'poly':line.buffer(s['width'],quad_segs=3),'name':s.get('kind','stream')})
stream_tree=STRtree([s['line'] for s in streams])
flows=[]
for s in streams:flows.append(s['poly'])
for w in D['ways']:
 if w['kind'] in ('river','stream','riverbank'):flows.append(valid([w['points']]))
flow=union_all(flows).difference(used)
wet=union_all([used,flow]);wet_boundary=wet.boundary
bodies=lakes+[{'poly':flow,'name':'Virtavedet'}]
body_tree=STRtree([b['poly'] for b in bodies]);wet_tree=STRtree(polygons(wet))
def level_at(e,n):
 level=lake_level(e,n)
 if level is not None:return level
 pt=Point(e,n);si=int(stream_tree.nearest(pt));s=streams[si];d=s['line'].project(pt);return float(np.interp(d,s['ds'],s['hs']))
def ground_height(e,n):
 pt=Point(e,n);candidates=body_tree.query(pt.buffer(40));near=None;dist=math.inf;iswet=False
 for idx in candidates:
  p=bodies[idx]['poly'];d=p.distance(pt)
  if d<dist:dist=d;near=idx
 if near is None:return raw(e,n)
 p=bodies[near]['poly'];iswet=p.covers(pt);shore=p.boundary.distance(pt)
 # At every shared shoreline vertex the terrain is exactly on the water level.
 if shore<.0001:return level_at(e,n)
 if iswet:return level_at(e,n)-min(2,.12+shore*.18)
 if dist>=40:return raw(e,n)
 nearest=p.exterior if p.geom_type=='Polygon' else p.boundary
 from shapely.ops import nearest_points
 q=nearest_points(p,pt)[0];level=level_at(q.x,q.y)
 target=max(raw(e,n),level+min(1.2,.5+dist*.12));blend=min(1,dist/20)
 return level+(target-level)*blend
verts=[];indices=[];waterpos=[];wateridx=[];lookup={};waterlookup={};cells=0;modified=0;max_area_error=0
# Welding gives land, lake beds and islands exactly the same shoreline vertices.
def vertex(e,n):
 key=(round(e-E,5),round(N-n,5))
 if key not in lookup:
  lookup[key]=len(verts);verts.append((key[0],ground_height(E+key[0],N-key[1]),key[1]))
 return lookup[key]
def wvertex(e,n):
 key=(round(e-E,5),round(N-n,5))
 if key not in waterlookup:
  waterlookup[key]=len(waterpos);waterpos.append((key[0],level_at(E+key[0],N-key[1]),key[1]))
 return waterlookup[key]
def add_part(p,iswater,shoreline=False):
 global max_area_error
 if p.area<1e-8:return
 tris=constrained_delaunay_triangles(p);max_area_error=max(max_area_error,abs(sum(t.area for t in tris.geoms)-p.area))
 for tri in tris.geoms:
  coords=list(tri.exterior.coords)[:3];ids=[vertex(e,n) for e,n in coords]
  # x,z coordinate transform reverses winding. Upward-facing order is required.
  a,b,c=[verts[i] for i in ids]
  if (b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2])<0:ids.reverse();coords.reverse()
  # Small islands can have no original DEM node. Retain an interior land
  # vertex, otherwise all island vertices would lie on the water plane.
  if not iswater and shoreline:
   center=tri.centroid;mid=vertex(center.x,center.y)
   for a,b in zip(ids,ids[1:]+ids[:1]):indices.extend([a,b,mid])
  else:indices.extend(ids)
  if iswater:wateridx.extend(wvertex(e,n) for e,n in coords)
def densify_main_border(p):
 rings=[]
 for ring in [p.exterior,*p.interiors]:
  coords=list(ring.coords);r=[]
  for a,b in zip(coords,coords[1:]):
   r.append(a);extra=[]
   for grid in [G]+([M] if M else []):
    x0=grid['eMin'];x1=x0+(grid['cols']-1)*grid['step'];y1=grid['nMax'];y0=y1-(grid['rows']-1)*grid['step'];step=grid['step']
    if abs(a[0]-b[0])<1e-6 and (abs(a[0]-x0)<1e-6 or abs(a[0]-x1)<1e-6):
     extra.extend((a[0],float(v)) for v in np.arange(y0,y1+1,step) if min(a[1],b[1])+1e-6<v<max(a[1],b[1])-1e-6)
    if abs(a[1]-b[1])<1e-6 and (abs(a[1]-y0)<1e-6 or abs(a[1]-y1)<1e-6):
     extra.extend((float(v),a[1]) for v in np.arange(x0,x1+1,step) if min(a[0],b[0])+1e-6<v<max(a[0],b[0])-1e-6)
   r.extend(sorted(set(extra),key=lambda v:math.dist(a,v)))
  rings.append(r)
 return Polygon(rings[0],rings[1:])
def process(p):
 global cells,modified
 cells+=1
 candidates=wet_tree.query(p)
 if not len(candidates):add_part(p,False);return
 local=union_all(wet_tree.geometries.take(candidates));water=p.intersection(local);land=p.difference(local)
 for piece in polygons(land):add_part(piece,False,True)
 for piece in polygons(water):add_part(piece,True)
 if not water.is_empty:modified+=1
for j in range(G['rows']-1):
 for i in range(G['cols']-1):process(box(E+i*25,N-(j+1)*25,E+(i+1)*25,N-j*25))
 if j%80==0:print('Main row',j,'vertices',len(verts),flush=True)
middle=main
if M:
 middle=box(M['eMin'],M['nMax']-(M['rows']-1)*M['step'],M['eMin']+(M['cols']-1)*M['step'],M['nMax'])
 for j in range(M['rows']-1):
  for i in range(M['cols']-1):
   e=M['eMin']+i*M['step'];n=M['nMax']-j*M['step'];p=box(e,n-M['step'],e+M['step'],n).difference(main)
   for piece in polygons(p):process(densify_main_border(piece))
  if j%100==0:print('Region row',j,'vertices',len(verts),flush=True)
for j in range(O['rows']-1):
 for i in range(O['cols']-1):
  e=O['eMin']+i*O['step'];n=O['nMax']-j*O['step'];p=box(e,n-O['step'],e+O['step'],n).difference(middle)
  for piece in polygons(p):process(densify_main_border(piece))
# Millimetre welding can collapse microscopic overlay slivers. Remove only
# triangles with repeated vertices; their area is exactly zero after welding.
indices=[v for i in range(0,len(indices),3) if len(set(indices[i:i+3]))==3 for v in indices[i:i+3]]
wateridx=[v for i in range(0,len(wateridx),3) if len(set(wateridx[i:i+3]))==3 for v in wateridx[i:i+3]]
from mesh_cleanup import clean_mesh, gpu_water_indices
verts,indices,repaired_seams=clean_mesh(verts,indices)
print('Microscopic overlay seam repairs:',repaired_seams,flush=True)
print('Mesh',len(verts),'vertices',len(indices)//3,'triangles; water',len(wateridx)//3,flush=True)
wateridx=gpu_water_indices(waterpos,wateridx)
from lake_surfaces import condition_lakes
verts,waterpos,conditioned=condition_lakes(verts,waterpos,wateridx,lakes,E,N)
# Topology audit: each interior terrain edge must have two incident triangles.
edges={}
for a,b,c in np.asarray(indices).reshape(-1,3):
 for x,y in ((a,b),(b,c),(c,a)):
  k=(min(int(x),int(y)),max(int(x),int(y)));edges[k]=edges.get(k,0)+1
outside=(O['eMin']-E,O['eMin']+(O['cols']-1)*O['step']-E,N-O['nMax'],N-(O['nMax']-(O['rows']-1)*O['step']))
def on_outer(a,b):
 return any(abs(a[d]-bound)<.001 and abs(b[d]-bound)<.001 for d,bound in [(0,outside[0]),(0,outside[1]),(2,outside[2]),(2,outside[3])])
bad=[(k,v) for k,v in edges.items() if v!=2 and not(v==1 and on_outer(verts[k[0]],verts[k[1]]))]
report={'terrainVertices':len(verts),'terrainTriangles':len(indices)//3,'waterTriangles':len(wateridx)//3,'lakes':len(lakes),'streamLines':len(streams),'interiorOpenOrNonmanifoldEdges':len(bad),'maxCellAreaError':max_area_error,'levels':[{k:b[k] for k in ('name','level')} for b in lakes]}
json.dump(report,open(out/'hydrology-validation.json','w'),indent=2,ensure_ascii=False)
if bad:
 json.dump([(verts[k[0]],verts[k[1]],count) for k,count in bad[:100]],open('work/bad-mesh-edges.json','w'));raise RuntimeError(f'{len(bad)} nonmanifold/open interior edges')
def encode(a,dtype):return base64.b64encode(np.asarray(a,dtype=dtype).tobytes()).decode()
asset={'version':1,'originE':E,'originN':N,'positions':encode(verts,'<f4'),'indices':encode(indices,'<u4'),'waterPositions':encode(waterpos,'<f4'),'waterIndices':encode(wateridx,'<u4'),'lakes':[]}
for b in lakes:
 for p in polygons(b['poly']):asset['lakes'].append({'name':b['name'],'level':b['level'],'rings':[[[round(e,3),round(n,3)] for e,n in r.coords] for r in [p.exterior,*p.interiors]]})
(out/'assets/hydrology-mesh.js').write_text('window.HYDROLOGY_MESH='+json.dumps(asset,separators=(',',':'))+';')
print(json.dumps(report,ensure_ascii=False),flush=True)
