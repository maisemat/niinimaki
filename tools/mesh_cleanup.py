"""Collapse only sub-millimetre non-manifold overlay seams before GPU export."""
import numpy as np

def clean_mesh(vertices,indices):
 p=np.asarray(vertices,dtype=float);t=np.asarray(indices,dtype=np.int64).reshape(-1,3);merged=0
 for _ in range(4):
  valid=(t[:,0]!=t[:,1])&(t[:,1]!=t[:,2])&(t[:,2]!=t[:,0]);t=t[valid]
  _,keep=np.unique(np.sort(t,axis=1),axis=0,return_index=True);t=t[np.sort(keep)]
  e=np.sort(np.concatenate([t[:,[0,1]],t[:,[1,2]],t[:,[2,0]]]),axis=1);edges,counts=np.unique(e,axis=0,return_counts=True);bad=edges[counts>2]
  if not len(bad):break
  parent=np.arange(len(p));changed=False
  def root(i):
   while parent[i]!=i:i=parent[i]
   return i
  for a,b in bad:
   # Never alter a mapped shoreline at visible scales to make a test pass.
   if np.linalg.norm(p[a,[0,2]]-p[b,[0,2]])>.0002:continue
   a,b=root(a),root(b)
   if a!=b:parent[b]=a;p[a,1]=min(p[a,1],p[b,1]);merged+=1;changed=True
  if not changed:break
  for i in np.flatnonzero(parent!=np.arange(len(p))):parent[i]=root(i)
  t=parent[t]
 # Overlay roundoff can leave a three-edge slit only micrometres wide.
 # Close it using its existing vertices; larger holes are left for the audit.
 e=np.sort(np.concatenate([t[:,[0,1]],t[:,[1,2]],t[:,[2,0]]]),axis=1);edges,counts=np.unique(e,axis=0,return_counts=True)
 graph={}
 for a,b in edges[counts==1]:graph.setdefault(int(a),set()).add(int(b));graph.setdefault(int(b),set()).add(int(a))
 seen=set();patches=[]
 for start in graph:
  if start in seen:continue
  component=set();queue=[start]
  while queue:
   a=queue.pop()
   if a in component:continue
   component.add(a);queue.extend(graph[a]-component)
  seen.update(component)
  if len(component)!=3 or any(len(graph[a])!=2 for a in component):continue
  ids=list(component);a,b,c=p[ids][:,[0,2]];cross=float((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));longest=max(np.linalg.norm(b-a),np.linalg.norm(c-b),np.linalg.norm(a-c))
  if abs(cross)/2>.0001 or longest>5:continue
  if cross>0:ids.reverse()
  patches.append(ids);merged+=1
 if patches:t=np.concatenate([t,np.asarray(patches)])
 return p.tolist(),t.reshape(-1).tolist(),merged

def gpu_water_indices(vertices,indices):
 """Remove zero-width water faces after the exact GPU float32 conversion."""
 p=np.asarray(vertices,dtype=np.float32).astype(float);t=np.asarray(indices,dtype=np.int64).reshape(-1,3)
 a=p[t[:,0]];b=p[t[:,1]];c=p[t[:,2]];area=(b[:,0]-a[:,0])*(c[:,2]-a[:,2])-(b[:,2]-a[:,2])*(c[:,0]-a[:,0])
 return t[np.abs(area)>1e-9].reshape(-1).tolist()
