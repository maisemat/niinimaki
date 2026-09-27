const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),window={},context={window,atob,Float32Array,Uint32Array,Uint8Array,Map,Math,Number};
for(const f of ['hydrology-mesh','surface-index','structures'])vm.runInNewContext(fs.readFileSync(path.join(root,'assets',f+'.js'),'utf8'),context);
const m=window.HYDROLOGY_MESH,{SurfaceIndex}=window.HYDRO_SURFACES,decode=(name,Type)=>{const b=zlib.gunzipSync(Buffer.from(m[name],'base64'));return new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength))},p=decode('positions',Float32Array),idx=decode('indices',Uint32Array),w=decode('waterPositions',Float32Array),wi=decode('waterIndices',Uint32Array);
const terrain=new SurfaceIndex(p,idx),water=new SurfaceIndex(w,wi);let seed=42;function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
let missed=0,maxSubmersion=0,minWetDepth=Infinity;
for(let i=0;i<30000;i++){const x=-25000+random()*60000,z=-26000+random()*60000,h=terrain.sample(x,z);if(!Number.isFinite(h))missed++}
assert.equal(missed,0,'Terrain must cover the complete scene without holes');
for(let k=0;k<wi.length;k+=3){const ids=[wi[k]*3,wi[k+1]*3,wi[k+2]*3],x=ids.reduce((s,i)=>s+w[i],0)/3,z=ids.reduce((s,i)=>s+w[i+2],0)/3,wy=ids.reduce((s,i)=>s+w[i+1],0)/3,gy=terrain.sample(x,z);assert.ok(Number.isFinite(gy),'Water must have terrain beneath it');maxSubmersion=Math.max(maxSubmersion,gy-wy);minWetDepth=Math.min(minWetDepth,wy-gy)}
assert.ok(maxSubmersion<.03,`Terrain intrudes into water: ${maxSubmersion} m`);
function inside(r,x,y){let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes}return yes}
let lakeSamples=0,islandSamples=0,maxLakeError=0;
for(const lake of m.lakes){const r=lake.rings[0],xs=r.map(p=>p[0]),ys=r.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);for(let i=0;i<100;i++){const e=x0+random()*(x1-x0),n=y0+random()*(y1-y0);if(!inside(r,e,n))continue;const isIsland=lake.rings.slice(1).some(r=>inside(r,e,n)),h=water.sample(e-m.originE,m.originN-n);if(isIsland){assert.equal(h,-Infinity,'OSM islands must not have water');islandSamples++}else{assert.ok(Number.isFinite(h),'Mapped lake must have water');maxLakeError=Math.max(maxLakeError,Math.abs(h-lake.level));lakeSamples++}}}
assert.ok(maxLakeError<.001,`A lake surface slopes by ${maxLakeError} m`);
// Both short mapped connections from Onkilammi to Tunturilammi must meet the
// lakes at their ends. A coarse DEM previously made a near-vertical blue wall.
const onki=m.lakes.find(l=>l.name==='Onkilammi'),tunt=m.lakes.find(l=>l.name==='Tunturilammi');
assert.ok(onki.level>tunt.level,'The observed flow is Onkilammi -> Tunturilammi');
const source=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'tools','hydrology-source.json.gz'))));
for(const id of [487085503,487085505]){
 const stream=source.streams.find(s=>Number(s.id)===id);assert.ok(stream,`Missing connector ${id}`);
 const points=stream.geometry;let lastHeight=null,lastPoint=null,maxRise=0;
 for(let segment=1;segment<points.length;segment++){
  const a=points[segment-1],b=points[segment],length=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.max(1,Math.ceil(length/3));
  for(let k=segment===1?0:1;k<=steps;k++){
   const t=k/steps,e=a[0]+(b[0]-a[0])*t,n=a[1]+(b[1]-a[1])*t,h=water.sample(e-m.originE,m.originN-n);
   assert.ok(Number.isFinite(h),`Connector ${id} must stay in mapped water`);
   if(lastHeight!==null){const distance=Math.hypot(e-lastPoint[0],n-lastPoint[1]);maxRise=Math.max(maxRise,Math.abs(h-lastHeight)/Math.max(distance,.001))}
   lastHeight=h;lastPoint=[e,n];
  }
 }
 assert.ok(maxRise<.08,`Connector ${id} has a water wall with gradient ${maxRise}`);
 const first=points[0],last=points.at(-1);assert.ok(Math.abs(water.sample(first[0]-m.originE,m.originN-first[1])-onki.level)<.02);
 assert.ok(Math.abs(water.sample(last[0]-m.originE,m.originN-last[1])-tunt.level)<.02);
}
console.log(JSON.stringify({terrainSamples:30000,missed,waterTriangles:wi.length/3,maxGroundAboveWater:Math.round(maxSubmersion*1000)/1000,lakeSamples,islandSamples,maxLakeLevelError:maxLakeError},null,2));

// Record source building/water overlaps without manufacturing islands.
const sourceConflicts=[];for(const b of window.STRUCTURES.buildings){const r=b.geometry,e=r.reduce((s,p)=>s+p[0]/r.length,0),n=r.reduce((s,p)=>s+p[1]/r.length,0);if(Number.isFinite(water.sample(e-m.originE,m.originN-n)))sourceConflicts.push([Math.round(e),Math.round(n)])}

// Expanded OSM includes boathouses and shoreline footprints. Report these
// source overlaps separately; do not create invented islands around buildings.
fs.writeFileSync(path.join(root,'source-overlaps.json'),JSON.stringify({buildingWaterOverlaps:sourceConflicts},null,2));
console.log(JSON.stringify({buildings:window.STRUCTURES.buildings.length,sourceConflicts}));
