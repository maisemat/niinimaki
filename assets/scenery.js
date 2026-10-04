window.addScenery=function(scene,height,originE,originN,G,infrastructure){
 const src=window.STRUCTURES||{buildings:[],forests:[]},shapes=src.buildings,cover=window.LANDCOVER;
 // Published footprints stay in place; the red walls and pitched roofs are generic illustrations.
 const wallPos=[],wallIdx=[],roofPos=[],roofIdx=[],detailPos=[],detailIdx=[],reflectionBuildings=[];
 function quad(out,indices,a,b,c,d){const k=out.length/3;out.push(...a,...b,...c,...d);indices.push(k,k+1,k+2,k,k+2,k+3)}
 for(const building of shapes){let points=building.geometry;if(points.length>3&&points[0][0]===points.at(-1)[0]&&points[0][1]===points.at(-1)[1])points=points.slice(0,-1);if(points.length<3)continue;const winding=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+(p[0]-originE)*(originN-q[1])-(q[0]-originE)*(originN-p[1])},0);
  const center=points.reduce((a,p)=>[a[0]+p[0]/points.length,a[1]+p[1]/points.length],[0,0]),ground=height(center[0],center[1]),rise=building.height<=3?1.1:2.1,eaves=ground+Math.max(2.5,building.height-rise),ridge=eaves+rise;
  for(let i=0;i<points.length;i++){const [e0,n0]=points[i],[e1,n1]=points[(i+1)%points.length],x0=e0-originE,z0=originN-n0,x1=e1-originE,z1=originN-n1,base=wallPos.length/3;wallPos.push(x0,height(e0,n0)+.12,z0,x1,height(e1,n1)+.12,z1,x0,eaves,z0,x1,eaves,z1);wallIdx.push(base,base+1,base+2,base+2,base+1,base+3);
   const length=Math.hypot(e1-e0,n1-n0);if(length>5&&building.height>3){const along=[(e1-e0)/length,-(n1-n0)/length],front=[along[1]*(winding>0?.18:-.18),-along[0]*(winding>0?.18:-.18)],count=Math.min(2,Math.floor(length/5));for(let w=0;w<count;w++){const t=(w+1)/(count+1),cx=x0+(x1-x0)*t+front[0],cz=z0+(z1-z0)*t+front[1],half=.58,y0=ground+1.25,y1=Math.min(eaves-.4,y0+1.1);if(y1>y0)quad(detailPos,detailIdx,[cx-along[0]*half,y0,cz-along[1]*half],[cx+along[0]*half,y0,cz+along[1]*half],[cx+along[0]*half,y1,cz+along[1]*half],[cx-along[0]*half,y1,cz-along[1]*half])}}}
  let longest=0,ux=1,uz=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],dx=b[0]-a[0],dz=-(b[1]-a[1]),len=Math.hypot(dx,dz);if(len>longest){longest=len;ux=dx/len;uz=dz/len}}const vx=-uz,vz=ux,coords=points.map(([e,n])=>{const x=e-originE,z=originN-n;return[x*ux+z*uz,x*vx+z*vz]}),vmin=Math.min(...coords.map(p=>p[1])),vmax=Math.max(...coords.map(p=>p[1])),vmid=(vmin+vmax)/2;
  function roofPoint(u,v,y){return[u*ux+v*vx,y,u*uz+v*vz]}function roofHeight(v){return eaves+rise*Math.max(0,1-Math.abs(v-vmid)/Math.max(.01,(vmax-vmin)/2))}
  function clipRoof(poly,low){const output=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ain=low?a[1]<=vmid:a[1]>=vmid,bin=low?b[1]<=vmid:b[1]>=vmid;if(ain)output.push(a);if(ain!==bin){const t=(vmid-a[1])/(b[1]-a[1]);output.push([a[0]+t*(b[0]-a[0]),vmid])}}return output}
  for(const low of [true,false]){const part=clipRoof(coords,low);if(part.length<3)continue;const flat=part.map(([u,v])=>{const [x,,z]=roofPoint(u,v,0);return new THREE.Vector2(x,z)});for(const tri of THREE.ShapeUtils.triangulateShape(flat,[])){const k=roofPos.length/3;for(const index of tri){const [u,v]=part[index];roofPos.push(...roofPoint(u,v,roofHeight(v)))}roofIdx.push(k,k+1,k+2)}}
  for(let i=0;i<coords.length;i++){const a=coords[i],b=coords[(i+1)%coords.length],edge=[a];
   // A gable edge crosses the ridge: add its midpoint so the triangular wall
   // reaches the ridge instead of leaving the roof end open.
   if((a[1]-vmid)*(b[1]-vmid)<-1e-8){const t=(vmid-a[1])/(b[1]-a[1]);edge.push([a[0]+t*(b[0]-a[0]),vmid])}edge.push(b);
   for(let j=1;j<edge.length;j++){const p=edge[j-1],q=edge[j];quad(wallPos,wallIdx,roofPoint(p[0],p[1],eaves),roofPoint(q[0],q[1],eaves),roofPoint(q[0],q[1],roofHeight(q[1])),roofPoint(p[0],p[1],roofHeight(p[1])))}}
 }
 function addBuildingMesh(pos,idx,color,shadows){if(!idx.length)return;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();const mesh=new THREE.Mesh(g,new THREE.MeshLambertMaterial({color,side:THREE.DoubleSide}));mesh.castShadow=false;mesh.receiveShadow=true;scene.add(mesh);reflectionBuildings.push(mesh)}
 addBuildingMesh(wallPos,wallIdx,0x9c3d32,true);addBuildingMesh(roofPos,roofIdx,0x785044,true);addBuildingMesh(detailPos,detailIdx,0xe7ddd0,false);
 // Road classes follow OSM highway/surface tags. Missing surfaces keep the ordinary gray.
 const roadTypes=[
  {color:0x687c76,half:2.5}, // ordinary road / unknown surface
  {color:0x454c4d,half:5.5}, // major highway
  {color:0x81796c,half:2.3}, // gravel and compacted tracks
  {color:0x806446,half:0.9}, // walking trails
  {color:0x687c76,half:1.35} // paved cycleways
 ];
 function roadCode(feature){return window.ROAD_STYLES?.[feature.id]??(feature.kind==='main'?1:0)}
 function roadType(feature){return roadTypes[roadCode(feature)]||roadTypes[0]}
 // Short strips follow the same terrain heights and lighting as the ground.
 // Lambert materials make both road layers respond to the sun and night light.
 const roadBuffers=roadTypes.map(()=>({pos:[],idx:[]}));
 for(const f of window.MAP_FEATURES||[]){if(f.kind!=='road'&&f.kind!=='main')continue;
  const style=roadType(f),buffer=roadBuffers[roadCode(f)]||roadBuffers[0],pts=f.geometry;
  for(let i=1;i<pts.length;i++){const [e0,n0]=pts[i-1],[e1,n1]=pts[i],dx=e1-e0,dn=n1-n0,len=Math.hypot(dx,dn);
   if(len<1||len>10000||Math.max(e0,e1)<G.eMin||Math.min(e0,e1)>G.eMin+(G.cols-1)*G.step||Math.max(n0,n1)<G.nMax-(G.rows-1)*G.step||Math.min(n0,n1)>G.nMax)continue;
   const nx=-dn/len*style.half,nn=dx/len*style.half,parts=Math.ceil(len/8);
   for(let part=0;part<parts;part++){const a=part/parts,b=(part+1)/parts,base=buffer.pos.length/3;
    for(const [e,n] of [[e0+dx*a+nx,n0+dn*a+nn],[e0+dx*a-nx,n0+dn*a-nn],[e0+dx*b+nx,n0+dn*b+nn],[e0+dx*b-nx,n0+dn*b-nn]])buffer.pos.push(e-originE,height(e,n)+.06,originN-n);
    buffer.idx.push(base,base+1,base+2,base+2,base+1,base+3)
   }
  }
 }
 roadBuffers.forEach((buffer,code)=>{if(!buffer.idx.length)return;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(buffer.pos,3));geometry.setIndex(buffer.idx);geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({color:roadTypes[code].color,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));mesh.name='Yleiskartan tiet';mesh.receiveShadow=true;scene.add(mesh)});
 // Terrain and all water are built together in the shared hydrology mesh.
 const C=window.CANOPY;if(!C)return{reflectionBuildings,setGroundMode(){},updateLocalTrees(){},setProjectPhase(){},setSeasonVisual(){}};
 const raw=Uint8Array.from(atob(C.heights),ch=>ch.charCodeAt(0)),cols=C.cols,rows=C.rows,step=C.step;
 const species=window.SPECIES?.kinds?Uint8Array.from(atob(window.SPECIES.kinds),ch=>ch.charCodeAt(0)):null;
 // Index published road centrelines once. Check each actual tree location (not
 // its 25 m canopy cell), so roadside forest remains while the road stays open.
 const roadCells=new Map(),roadSegments=[],roadCellSize=100,seenRoads=new Set(),localRoadFeatures=new Set(window.MAP_FEATURES||[]);
 for(const feature of [...(window.MAP_FEATURES||[]),...(window.WIDE_MAP_FEATURES||[])]){
  if(feature.kind!=='road'&&feature.kind!=='main')continue;
  for(let q=1;q<feature.geometry.length;q++){
   const a=feature.geometry[q-1],b=feature.geometry[q],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
   if(length<1||length>10000)continue;
   const key=`${a[0]},${a[1]},${b[0]},${b[1]}`;if(seenRoads.has(key))continue;seenRoads.add(key);
   const style=roadType(feature),half=style.half,id=roadSegments.push({a,b,dx,dy,length2:length*length,half,code:roadCode(feature),local:localRoadFeatures.has(feature)})-1;
   for(let i=Math.floor((Math.min(a[0],b[0])-half)/roadCellSize);i<=Math.floor((Math.max(a[0],b[0])+half)/roadCellSize);i++)
    for(let j=Math.floor((Math.min(a[1],b[1])-half)/roadCellSize);j<=Math.floor((Math.max(a[1],b[1])+half)/roadCellSize);j++){
     const cell=i+','+j;if(!roadCells.has(cell))roadCells.set(cell,[]);roadCells.get(cell).push(id);
    }
  }
 }
 function onExistingRoad(e,n){for(const id of roadCells.get(Math.floor(e/roadCellSize)+','+Math.floor(n/roadCellSize))||[]){const s=roadSegments[id],t=Math.max(0,Math.min(1,((e-s.a[0])*s.dx+(n-s.a[1])*s.dy)/s.length2));if(Math.hypot(e-s.a[0]-t*s.dx,n-s.a[1]-t*s.dy)<s.half)return true}return false}
 // The distant road strips use the overview terrain. Rebuild only nearby roads
 // against the same refined ground surface that the viewer sees. Short strips
 // prevent the road from cutting through hills between elevation samples.
 let localRoadMeshes=[],localRoadCenter=null,localRoadRadius=0;
 const localRoadMaterials=roadTypes.map(style=>new THREE.MeshLambertMaterial({color:style.color,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
 function updateLocalRoads(e,n,detailRadius=1700,force=false){
  const radius=Math.max(1800,detailRadius+250);
  if(!force&&localRoadCenter&&Math.hypot(e-localRoadCenter[0],n-localRoadCenter[1])<400&&radius===localRoadRadius)return;
  localRoadCenter=[e,n];localRoadRadius=radius;
  const candidates=new Set(),minE=Math.floor((e-radius)/roadCellSize),maxE=Math.floor((e+radius)/roadCellSize),minN=Math.floor((n-radius)/roadCellSize),maxN=Math.floor((n+radius)/roadCellSize);
  for(let i=minE;i<=maxE;i++)for(let j=minN;j<=maxN;j++)for(const id of roadCells.get(i+','+j)||[])candidates.add(id);
  const buffers=roadTypes.map(()=>({pos:[],idx:[]}));
  for(const id of candidates){const segment=roadSegments[id];if(!segment.local)continue;
   const t=Math.max(0,Math.min(1,((e-segment.a[0])*segment.dx+(n-segment.a[1])*segment.dy)/segment.length2));
   if(Math.hypot(e-segment.a[0]-t*segment.dx,n-segment.a[1]-t*segment.dy)>radius+20)continue;
   const buffer=buffers[segment.code]||buffers[0],length=Math.sqrt(segment.length2),nx=-segment.dy/length*segment.half,nn=segment.dx/length*segment.half,parts=Math.ceil(length/3);
   for(let p=0;p<parts;p++){const a=p/parts,b=(p+1)/parts,base=buffer.pos.length/3;
    for(const [ee,nnn] of [[segment.a[0]+segment.dx*a+nx,segment.a[1]+segment.dy*a+nn],[segment.a[0]+segment.dx*a-nx,segment.a[1]+segment.dy*a-nn],[segment.a[0]+segment.dx*b+nx,segment.a[1]+segment.dy*b+nn],[segment.a[0]+segment.dx*b-nx,segment.a[1]+segment.dy*b-nn]])buffer.pos.push(ee-originE,height(ee,nnn)+.14,originN-nnn);
    buffer.idx.push(base,base+1,base+2,base+2,base+1,base+3)
   }
  }
  for(const mesh of localRoadMeshes){scene.remove(mesh);mesh.geometry.dispose()}localRoadMeshes=[];
  buffers.forEach((buffer,code)=>{if(!buffer.idx.length)return;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(buffer.pos,3));geometry.setIndex(buffer.idx);geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,localRoadMaterials[code]);mesh.name='Lähialueen tiet';mesh.frustumCulled=false;mesh.receiveShadow=true;scene.add(mesh);localRoadMeshes.push(mesh)})
 }
 const urbanAreas=window.URBAN_AREAS||[],urbanCells=new Map(),urbanCellSize=100,urbanMargin=25;
 for(let id=0;id<urbanAreas.length;id++){const pts=urbanAreas[id].geometry,es=pts.map(p=>p[0]),ns=pts.map(p=>p[1]);for(let i=Math.floor((Math.min(...es)-urbanMargin)/urbanCellSize);i<=Math.floor((Math.max(...es)+urbanMargin)/urbanCellSize);i++)for(let j=Math.floor((Math.min(...ns)-urbanMargin)/urbanCellSize);j<=Math.floor((Math.max(...ns)+urbanMargin)/urbanCellSize);j++){const key=i+','+j;if(!urbanCells.has(key))urbanCells.set(key,[]);urbanCells.get(key).push(id)}}
 function inUrban(e,n){for(const id of urbanCells.get(Math.floor(e/urbanCellSize)+','+Math.floor(n/urbanCellSize))||[]){const pts=urbanAreas[id].geometry;let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[i],b=pts[j];if((a[1]>n)!==(b[1]>n)&&e<(b[0]-a[0])*(n-a[1])/(b[1]-a[1])+a[0])inside=!inside;const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((e-a[0])*dx+(n-a[1])*dy)/(dx*dx+dy*dy||1)));if(Math.hypot(e-a[0]-t*dx,n-a[1]-t*dy)<urbanMargin)return true}if(inside)return true}return false}
 // OSM's residential polygons have gaps between blocks. Dense groups of actual
 // building footprints fill those gaps without clearing the surrounding forest.
 const builtCells=new Map(),builtCellSize=100;
 for(const building of shapes){const pts=building.geometry;if(!pts?.length)continue;let e=0,n=0;for(const p of pts){e+=p[0];n+=p[1]}e/=pts.length;n/=pts.length;const key=Math.floor(e/builtCellSize)+','+Math.floor(n/builtCellSize);if(!builtCells.has(key))builtCells.set(key,[]);builtCells.get(key).push([e,n])}
 function inBuiltUpArea(e,n){
  // The building-density rule is for Renko's mapped town centre. Rural
  // lakeside houses must not erase the surrounding measured forest canopy.
  if(e<351000||e>355000||n<6752000||n>6756000)return false;
  let count=0;const i=Math.floor(e/builtCellSize),j=Math.floor(n/builtCellSize);
  for(let di=-1;di<=1;di++)for(let dj=-1;dj<=1;dj++)for(const p of builtCells.get((i+di)+','+(j+dj))||[]){if((e-p[0])**2+(n-p[1])**2<100**2&&++count>=2)return true}
  return false
 }
 function nearRuralHouse(e,n,radius=42){
  if(inUrban(e,n)||inBuiltUpArea(e,n))return false;
  const i=Math.floor(e/builtCellSize),j=Math.floor(n/builtCellSize),limit=radius*radius;
  for(let di=-1;di<=1;di++)for(let dj=-1;dj<=1;dj++)for(const p of builtCells.get((i+di)+','+(j+dj))||[])if((e-p[0])**2+(n-p[1])**2<limit)return true;
  return false
 }
 function index(i,j){return j*cols+i}function hash(x,y){const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v)}
 const blocked=new Uint8Array(raw.length),young=new Uint8Array(raw.length);
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const k=index(i,j),e=C.eMin+(i+.5)*step,n=C.nMax-(j+.5)*step;if(cover.inWater(e,n)||cover.inField(e,n))blocked[k]=1;else if(cover.inScrub(e,n))young[k]=1}
 const buildingsByCell=new Map();
 for(const b of shapes){const pts=b.geometry;if(!pts?.length)continue;let e0=Infinity,e1=-Infinity,n0=Infinity,n1=-Infinity;for(const [e,n] of pts){e0=Math.min(e0,e);e1=Math.max(e1,e);n0=Math.min(n0,n);n1=Math.max(n1,n)}for(let j=Math.max(0,Math.floor((C.nMax-n1-8)/step));j<=Math.min(rows-1,Math.floor((C.nMax-n0+8)/step));j++)for(let i=Math.max(0,Math.floor((e0-C.eMin-8)/step));i<=Math.min(cols-1,Math.floor((e1-C.eMin+8)/step));i++){const k=index(i,j);if(!buildingsByCell.has(k))buildingsByCell.set(k,[]);buildingsByCell.get(k).push(pts)}}
 function insideBuilding(e,n,polygons){for(const pts of polygons||[]){let inside=false;for(let a=0,b=pts.length-1;a<pts.length;b=a++){const p=pts[a],q=pts[b];if((p[1]>n)!==(q[1]>n)&&e<(q[0]-p[0])*(n-p[1])/(q[1]-p[1])+p[0])inside=!inside}if(inside)return true}return false}
 function nearBuilding(e,n,polygons){if(insideBuilding(e,n,polygons))return true;for(const pts of polygons||[])for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((e-a[0])*dx+(n-a[1])*dy)/(dx*dx+dy*dy||1)));if(Math.hypot(e-a[0]-dx*t,n-a[1]-dy*t)<4)return true}return false}
 const visualCache=new Float32Array(raw.length);visualCache.fill(-1);
 function visualCanopy(i,j){const k=index(i,j),cached=visualCache[k];if(cached>=0)return cached;const h=raw[k];if(blocked[k])return visualCache[k]=0;if(young[k])return visualCache[k]=h>0?Math.max(1.2,Math.min(6,h)):3;if(h<5)return visualCache[k]=0;const neighbors=[];for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){if(!di&&!dj||i+di<0||i+di>=cols||j+dj<0||j+dj>=rows)continue;const q=index(i+di,j+dj);if(raw[q]>=5&&!blocked[q])neighbors.push(raw[q])}if(neighbors.length<2)return visualCache[k]=0;neighbors.sort((a,b)=>a-b);return visualCache[k]=Math.min(h,neighbors[Math.floor(neighbors.length/2)]+6)}
 function groups(){return Array.from({length:6},()=>({position:[],height:[],variant:[],site:[]}))}
 // Far forest is grouped into spatial tiles. Nearby trees are rebuilt only after
 // travelling 250 m, using fixed world-space seeds so they never follow the camera.
 const farGroups=new Map();let forestCells=0;
 function mixedSpecies(kind,seed){
  if(kind===5)return 5;
  const mix=hash(seed*37,seed*11+319);
  // The mapped dominant species remains dominant. Other species are scattered
  // tree by tree, including roughly 15% spruce outside spruce-dominant stands.
  if(kind===2)return mix<.10?1:mix<.20?0:2;
  if(kind===1)return mix<.15?2:mix<.25?0:1;
  return mix<.15?2:mix<.25?1:kind;
 }
 function addTree(group,kind,e,n,h,seed){if(onExistingRoad(e,n)||inUrban(e,n)||inBuiltUpArea(e,n))return;const actual=h*(.75+.46*hash(seed,seed*7)),ground=height(e,n),site=infrastructure.cleared(e,n,Math.min(5,actual*.18))?1:0,mixed=mixedSpecies(kind,seed),renderKind=(mixed===0||mixed===3)&&hash(Math.floor(e*3),Math.floor(n*3)+715)<.25?4:mixed;group[renderKind].position.push(e-originE,ground+actual*.5,originN-n);group[renderKind].height.push(actual);group[renderKind].variant.push(Math.floor(hash(seed*17,seed*43)*3));group[renderKind].site.push(site)}
 function tileFor(e,n){const key=Math.floor(e/2000)+','+Math.floor(n/2000);if(!farGroups.has(key))farGroups.set(key,groups());return farGroups.get(key)}
 for(const body of cover.bodies)for(const island of body.holes){if(island.e1<C.eMin||island.e0>C.eMin+cols*step||island.n0>C.nMax||island.n1<C.nMax-rows*step)continue;for(let j=Math.max(0,Math.floor((C.nMax-island.n1)/step));j<Math.min(rows,Math.ceil((C.nMax-island.n0)/step));j++)for(let i=Math.max(0,Math.floor((island.e0-C.eMin)/step));i<Math.min(cols,Math.ceil((island.e1-C.eMin)/step));i++){const k=index(i,j),e=C.eMin+(i+.5)*step,n=C.nMax-(j+.5)*step;if(!blocked[k]&&cover.inside(island,e,n)&&raw[k]<5)raw[k]=11}}
 // A short, capped distance to the mapped forest boundary keeps the visible
 // fringe dense while reducing tree instances in the interior of large stands.
 const forestDepth=new Uint8Array(raw.length);
 for(let k=0;k<raw.length;k++)forestDepth[k]=raw[k]>=5&&!blocked[k]&&!young[k]?4:0;
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const k=index(i,j);if(i)forestDepth[k]=Math.min(forestDepth[k],forestDepth[k-1]+1);if(j)forestDepth[k]=Math.min(forestDepth[k],forestDepth[k-cols]+1)}
 for(let j=rows-1;j>=0;j--)for(let i=cols-1;i>=0;i--){const k=index(i,j);if(i+1<cols)forestDepth[k]=Math.min(forestDepth[k],forestDepth[k+1]+1);if(j+1<rows)forestDepth[k]=Math.min(forestDepth[k],forestDepth[k+cols]+1)}
 for(let j=0;j<rows;j+=2)for(let i=0;i<cols;i+=2){const k=index(i,j),h=visualCanopy(i,j),kind=species?.[k]||0;if(!h)continue;forestCells++;const centerE=C.eMin+(i+.5)*step,centerN=C.nMax-(j+.5)*step,je=C.eMin+(i+.16+1.68*hash(i*43,j*197))*step,jn=C.nMax-(j+.16+1.68*hash(i*173,j*61))*step,valid=(e,n)=>!cover.inWater(e,n)&&!cover.inField(e,n)&&!nearBuilding(e,n,buildingsByCell.get(k));if(!valid(centerE,centerN))continue;const ee=valid(je,jn)?je:centerE,nn=valid(je,jn)?jn:centerN;addTree(tileFor(ee,nn),kind,ee,nn,h,k*13);
  // Offset companions break up the straight 50 m distant-tree grid.
  // Keep distant forest light, while retaining extra trees only in
  // already wooded cells around rural homes. Open yard cells stay open.
  const companions=nearRuralHouse(centerE,centerN)?4:forestDepth[k]<4?1:hash(i*113+7,j*57)<.5?1:0;
  for(let q=0;q<companions;q++)if(q<2||hash(i*251+q*83,j*131)<.5){const e2=C.eMin+(i+.08+1.84*hash(i*389+q*73,j*71))*step,n2=C.nMax-(j+.08+1.84*hash(j*337+q*59,i*83))*step;if(valid(e2,n2))addTree(tileFor(e2,n2),kind,e2,n2,h,k*13+7+q)}
 }
 // Shore vegetation is an illustrative fringe following the actual lake rings,
 // rather than the 25 m canopy grid. Keep it off mapped water, fields, roads,
 // buildings and urban blocks. The same world positions are used at both LODs.
 const shoreCells=new Map(),yardCells=new Map(),plantCellSize=200;
 function putPlant(cells,plant){const key=Math.floor(plant.e/plantCellSize)+','+Math.floor(plant.n/plantCellSize);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(plant)}
 function plantsAround(cells,e,n,radius){const found=[];for(let i=Math.floor((e-radius)/plantCellSize);i<=Math.floor((e+radius)/plantCellSize);i++)for(let j=Math.floor((n-radius)/plantCellSize);j<=Math.floor((n+radius)/plantCellSize);j++)for(const plant of cells.get(i+','+j)||[])if((plant.e-e)**2+(plant.n-n)**2<radius*radius)found.push(plant);return found}
 function plantCell(e,n){const i=Math.floor((e-C.eMin)/step),j=Math.floor((C.nMax-n)/step);return i>=0&&i<cols&&j>=0&&j<rows?index(i,j):-1}
 function plantAllowed(e,n){const k=plantCell(e,n);return k>=0&&!cover.inWater(e,n)&&!cover.inField(e,n)&&!onExistingRoad(e,n)&&!inUrban(e,n)&&!inBuiltUpArea(e,n)&&!nearBuilding(e,n,buildingsByCell.get(k))}
 const renkajarvi=cover.bodies.find(body=>body.name==='Renkajärvi');
 if(renkajarvi)for(const [ringIndex,region] of [renkajarvi.outer,...renkajarvi.holes].entries()){
  const ring=region.points,anchor=ring[0];let area=0;for(let p=0;p<ring.length;p++){const a=ring[p],b=ring[(p+1)%ring.length];area+=(a[0]-anchor[0])*(b[1]-anchor[1])-(b[0]-anchor[0])*(a[1]-anchor[1])}
  const landSide=(ringIndex===0?-1:1)*Math.sign(area||1),spacing=10;let carried=0,sample=0;
  for(let p=1;p<ring.length;p++){const a=ring[p-1],b=ring[p],dx=b[0]-a[0],dn=b[1]-a[1],length=Math.hypot(dx,dn);if(length<.01)continue;
   for(let along=spacing-carried;along<length;along+=spacing){const t=along/length,edgeE=a[0]+dx*t,edgeN=a[1]+dn*t,normalE=-dn/length*landSide,normalN=dx/length*landSide,seed=ringIndex*100000+sample++;
    for(let q=0;q<4;q++){if(q===3&&hash(seed,91)<.4)continue;const offset=q===0?2+hash(seed,29)*3:q===1?5+hash(seed,43)*5:q===2?10+hash(seed,47)*5:15+hash(seed,53)*5,e=edgeE+normalE*offset,n=edgeN+normalN*offset;if(!plantAllowed(e,n))continue;const plant={e,n,kind:5,h:1+hash(seed+q,57)*1.8,seed:seed*5+q};putPlant(shoreCells,plant);addTree(tileFor(e,n),5,e,n,plant.h,plant.seed)}
    if(hash(seed,121)<.82){const offset=8+hash(seed,133)*12,e=edgeE+normalE*offset,n=edgeN+normalN*offset;if(plantAllowed(e,n)){const k=plantCell(e,n),canopy=raw[k],h=canopy>=5?Math.max(8,canopy):9+hash(seed,149)*6,kind=species?.[k]||0,plant={e,n,kind,h,seed:seed*3+2};putPlant(shoreCells,plant);addTree(tileFor(e,n),kind,e,n,h,plant.seed)}}
    if(hash(seed,153)<.35){const offset=14+hash(seed,159)*12,e=edgeE+normalE*offset,n=edgeN+normalN*offset,k=plantCell(e,n);if(k>=0&&raw[k]>=5&&plantAllowed(e,n)){const h=Math.max(8,raw[k]),kind=species?.[k]||0,plant={e,n,kind,h,seed:seed*7+5};putPlant(shoreCells,plant);addTree(tileFor(e,n),kind,e,n,h,plant.seed)}}
   }
   carried=(carried+length)%spacing;
  }
 }
 // A few variable-height shrubs around rural footprints suggest mixed yards,
 // but are generated only in the nearby layer to keep the distant scene light.
 for(let id=0;id<shapes.length;id++){const pts=shapes[id].geometry;if(!pts||pts.length<3)continue;let ce=0,cn=0;for(const [e,n] of pts){ce+=e;cn+=n}ce/=pts.length;cn/=pts.length;
  for(let q=0;q<4;q++){const a=pts[Math.floor(hash(id,q+211)*pts.length)],b=pts[(pts.indexOf(a)+1)%pts.length],midE=(a[0]+b[0])/2,midN=(a[1]+b[1])/2,dx=b[0]-a[0],dn=b[1]-a[1],length=Math.hypot(dx,dn);if(length<2)continue;let ne=-dn/length,nn=dx/length;if((midE-ce)*ne+(midN-cn)*nn<0){ne=-ne;nn=-nn}const e=midE+ne*(5+hash(id,q+223)*7),n=midN+nn*(5+hash(id,q+227)*7);putPlant(yardCells,{e,n,kind:5,h:1+hash(id,q+229)*1.6,seed:id*7+q})}
 }
 const atlases=window.TREE_ART.atlases(),farAtlases=atlases.map(atlas=>{const out={};for(const name of ['bark','leaves']){const c=document.createElement('canvas');c.width=480;c.height=192;const ctx=c.getContext('2d');for(let variant=0;variant<3;variant++)for(let tree=0;tree<4;tree++){const h=tree%2?176:192;ctx.drawImage(atlas[name].image,((variant+tree)%3)*160,0,160,192,variant*160+tree*37-2,192-h,54,h)}const texture=new THREE.CanvasTexture(c);texture.minFilter=THREE.LinearMipmapLinearFilter;out[name]=texture}return out}),treeMaterials=[];let phase=2,season={autumn:0,leafAmount:1,snow:0};
 function tint(kind){const summer=kind===5?[.35,.48,.27]:kind===4?[.43,.63,.32]:kind===3?[.37,.57,.29]:kind===0?[.43,.54,.32]:kind===1?[.32,.47,.27]:[.20,.36,.27],autumn=kind===5?[.68,.51,.24]:kind===4?[.96,.75,.18]:kind===3?[.85,.56,.12]:kind===0?[.75,.60,.22]:summer,a=season.autumn;return summer.map((v,i)=>v*(1-a)+autumn[i]*a)}
 let daylight=1;
 function setDaylight(value){daylight=value;for(const {material} of treeMaterials)material.uniforms.daylight.value=value}
 function applyMaterial(material,kind){material.uniforms.daylight.value=daylight;material.uniforms.leafTint.value.set(...tint(kind));material.uniforms.leafOpacity.value=(kind===0||kind===3||kind===4||kind===5)?season.leafAmount:1;material.uniforms.snowMix.value=season.snow;material.uniforms.phase.value=phase}
 function setSeasonVisual(state){season=state;for(const {material,kind} of treeMaterials)applyMaterial(material,kind)}
 function setProjectPhase(value){phase=value;for(const {material,kind} of treeMaterials)applyMaterial(material,kind)}
 function makeTreeMesh(group,kind,far=false){if(!group[kind].height.length)return null;const g=new THREE.InstancedBufferGeometry();g.setIndex([0,1,2,0,2,3]);g.setAttribute('position',new THREE.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));g.setAttribute('aCenter',new THREE.InstancedBufferAttribute(new Float32Array(group[kind].position),3));g.setAttribute('aHeight',new THREE.InstancedBufferAttribute(new Float32Array(group[kind].height),1));g.setAttribute('aVariant',new THREE.InstancedBufferAttribute(new Float32Array(group[kind].variant),1));g.setAttribute('aSite',new THREE.InstancedBufferAttribute(new Float32Array(group[kind].site),1));g.instanceCount=group[kind].height.length;
 const material=new THREE.ShaderMaterial({uniforms:{daylight:{value:1},barkMap:{value:(far?farAtlases:atlases)[kind].bark},leafMap:{value:(far?farAtlases:atlases)[kind].leaves},leafTint:{value:new THREE.Vector3()},leafOpacity:{value:1},snowMix:{value:0},phase:{value:2},fogColor:{value:scene.background},detailCenter:{value:new THREE.Vector2()},farLayer:{value:far?1:0},treeWidth:{value:(kind===5?1.15:kind===2?.72:kind===1?.76:kind===4?.78:.85)*(far?3.1:1)}},vertexShader:'attribute vec3 aCenter;attribute float aHeight;attribute float aVariant;attribute float aSite;uniform float treeWidth;uniform vec2 detailCenter;varying float vDistance;varying float vCameraDistance;varying vec2 vUv;varying float vSite;void main(){vec3 right=normalize(vec3(viewMatrix[0][0],0.0,viewMatrix[2][0]));vec3 world=aCenter+right*position.x*aHeight*treeWidth+vec3(0.0,position.y*aHeight,0.0);gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0);vUv=vec2((uv.x+aVariant)/3.0,uv.y);vSite=aSite;vDistance=distance(aCenter.xz,detailCenter);vCameraDistance=distance(aCenter,cameraPosition);}',fragmentShader:'uniform float daylight;uniform sampler2D barkMap;uniform sampler2D leafMap;uniform vec3 leafTint;uniform float leafOpacity;uniform float snowMix;uniform float phase;uniform float farLayer;uniform vec3 fogColor;varying float vDistance;varying float vCameraDistance;varying vec2 vUv;varying float vSite;void main(){float blend=smoothstep(1050.0,1250.0,vDistance);float noise=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);if(farLayer>0.5?noise>blend:noise<=blend)discard;if(phase>0.5&&vSite>0.5)discard;vec4 bark=texture2D(barkMap,vUv),leaf=texture2D(leafMap,vUv);float la=leaf.a*leafOpacity,alpha=la+bark.a*(1.0-la);if(alpha<(farLayer>0.5?0.18:0.38))discard;vec3 rgb=(leaf.rgb*leafTint*la+bark.rgb*bark.a*(1.0-la))/max(alpha,0.001);rgb=mix(rgb,vec3(0.89,0.92,0.91),snowMix*(leafOpacity>0.0?0.75:0.36));if(farLayer>0.5)rgb*=1.18;rgb*=daylight;rgb=mix(rgb,fogColor,1.0-exp(-vCameraDistance*vCameraDistance*0.000000001225));gl_FragColor=vec4(rgb,1.0);}',side:THREE.DoubleSide,depthWrite:true});
 treeMaterials.push({material,kind});applyMaterial(material,kind);const mesh=new THREE.Mesh(g,material);mesh.frustumCulled=far;if(far){const box=new THREE.Box3();const v=new THREE.Vector3();for(let k=0;k<group[kind].position.length;k+=3)box.expandByPoint(v.fromArray(group[kind].position,k));box.expandByScalar(100);g.boundingSphere=box.getBoundingSphere(new THREE.Sphere())}scene.add(mesh);return mesh}
 const globalTrees=[];for(const tile of farGroups.values())for(let kind=0;kind<6;kind++){const m=makeTreeMesh(tile,kind,true);if(m)globalTrees.push(m)}farGroups.clear();
 let localTrees=[],localCenter=null,localVisible=false,lightRender=false;
 function updateLocalTrees(e,n,force=false){
  if(!localVisible||!force&&localCenter&&Math.hypot(e-localCenter[0],n-localCenter[1])<250)return;
  for(const mesh of localTrees){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();const i=treeMaterials.findIndex(x=>x.material===mesh.material);if(i>=0)treeMaterials.splice(i,1)}
  localTrees=[];localCenter=[e,n];for(const {material} of treeMaterials)material.uniforms.detailCenter.value.set(e-originE,originN-n);
  const radius=1300,nearby=groups(),minI=Math.max(0,Math.floor((e-radius-C.eMin)/step)),maxI=Math.min(cols-1,Math.ceil((e+radius-C.eMin)/step)),minJ=Math.max(0,Math.floor((C.nMax-(n+radius))/step)),maxJ=Math.min(rows-1,Math.ceil((C.nMax-(n-radius))/step));
  for(let j=minJ;j<=maxJ;j++)for(let i=minI;i<=maxI;i++){
   const k=index(i,j),h=visualCanopy(i,j),kind=species?.[k]||0,e0=C.eMin+i*step,n0=C.nMax-j*step,d=Math.hypot(e0+step/2-e,n0-step/2-n);if(!h||d>radius)continue;
   const baseCount=lightRender?(young[k]?(d<350?20:d<650?10:4):(d<350?13:d<650?7:4)):(young[k]?(d<430?29:15):(d<430?20:d<600?12:7));
   const count=nearRuralHouse(e0+step/2,n0-step/2)?Math.ceil(baseCount*(lightRender?1.25:1.5)):forestDepth[k]<4?baseCount:Math.max(1,Math.round(baseCount*(lightRender?.8:.65)));
   for(let q=0;q<count;q++){const ee=e0+step*(.04+.92*hash(i*97+q*41,j*19+700)),nn=n0-step*(.04+.92*hash(j*89+q*59,i*23+900));if(cover.inWater(ee,nn)||cover.inField(ee,nn)||nearBuilding(ee,nn,buildingsByCell.get(k))||(young[k]&&!cover.inScrub(ee,nn)))continue;addTree(nearby,kind,ee,nn,h,k*29+q)}
  }
  for(const plant of plantsAround(shoreCells,e,n,radius))if(plantAllowed(plant.e,plant.n))addTree(nearby,plant.kind,plant.e,plant.n,plant.h,plant.seed);
  for(const plant of plantsAround(yardCells,e,n,radius))if(plantAllowed(plant.e,plant.n))addTree(nearby,5,plant.e,plant.n,plant.h,plant.seed);
  for(let kind=0;kind<6;kind++){const m=makeTreeMesh(nearby,kind);if(m){m.material.uniforms.detailCenter.value.set(e-originE,originN-n);localTrees.push(m)}}
 }
 function setGroundMode(active,e,n){localVisible=active;if(active)updateLocalTrees(e,n);for(const mesh of localTrees)mesh.visible=active}
 function setRenderQuality(light,e,n){if(lightRender===light)return;lightRender=light;updateLocalTrees(e,n,true)}
 return{buildings:shapes.length,reflectionBuildings,forestCells,getReflectionForest:()=>({far:globalTrees,near:localTrees}),source:'Suomen metsäkeskuksen latvusmalli',setGroundMode,updateLocalTrees,updateLocalRoads,setProjectPhase,setSeasonVisual,setRenderQuality,setDaylight};
};
