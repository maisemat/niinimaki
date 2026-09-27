"""Condition lake faces and their shared terrain vertices to one estimated level.
The existing XY shoreline and watertight terrain connectivity are unchanged.
"""
import numpy as np
from shapely import STRtree,polygons,intersection,area

def condition_lakes(vertices,water_vertices,water_indices,lakes,origin_e=341500,origin_n=6765500):
 p=np.asarray(vertices,dtype=float);w=np.asarray(water_vertices,dtype=np.float32).astype(float);original=w[:,1].copy();t=np.asarray(water_indices).reshape(-1,3)
 shapes=np.asarray([l['poly'] for l in lakes],dtype=object);parent=list(range(len(lakes)))
 def root(i):
  while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
  return i
 def join(a,b):
  a,b=root(a),root(b)
  if a!=b:parent[b]=a
 # Conform to the polygons at GPU precision, including their outlet triangles.
 # Adjacent parts of one continuous water surface share a level.
 coords=w[t][:,:,[0,2]].copy();coords[:,:,0]+=origin_e;coords[:,:,1]=origin_n-coords[:,:,1]
 tris=polygons(coords);pair=STRtree(shapes).query(tris,predicate='intersects');overlap=area(intersection(tris[pair[0]],shapes[pair[1]]));pair=pair[:,overlap>1e-7]
 labels=np.full(len(w),-1,dtype=int)
 for tri,lake in pair.T:
  for vertex in t[tri]:
   if labels[vertex]>=0:join(int(lake),int(labels[vertex]))
   labels[vertex]=lake
 groups={}
 for i in range(len(lakes)):groups.setdefault(root(i),[]).append(i)
 levels={}
 for key,members in groups.items():
  largest=max(members,key=lambda i:shapes[i].area);level=lakes[largest]['level'];levels[key]=level
  for i in members:lakes[i]['level']=level
 for i in np.flatnonzero(labels>=0):w[i,1]=levels[root(int(labels[i]))]
 changed=np.flatnonzero(abs(w[:,1]-original)>.00001);delta={tuple(w[i,[0,2]]):float(w[i,1]-original[i]) for i in changed}
 gpu=p.astype(np.float32).astype(float)
 for i in range(len(p)):
  d=delta.get((gpu[i,0],gpu[i,2]))
  if d is not None:p[i,1]+=d
 return p.tolist(),w.tolist(),len(changed)
