// Planar reflections of turbines/lights, coarse land and shoreline forest.
// Reuse the exact water mask and existing distant-tree atlases. Shore trees are
// merged into a few draws; no full forest, roads, shadow
// maps or full-scene reflection pass are rendered. All work is optional.
window.createWaterReflections=function(options){
 'use strict';
 const {renderer,scene,waterMesh,turbines,lights,hemi,sun,height,buildings=[],forest=()=>({far:[],near:[]}),ground=()=>[],terrainColorAt,season,bodies,originE,originN,bounds,waterSurface,inside}=options;
 const baseMaterial=waterMesh.material,material=baseMaterial.clone();
 const uniforms={
  reflectionMap0:{value:null},reflectionMap1:{value:null},
  reflectionMatrix0:{value:new THREE.Matrix4()},reflectionMatrix1:{value:new THREE.Matrix4()},
  reflectionLevels:{value:new THREE.Vector2()},reflectionReady:{value:new THREE.Vector2()},reflectionEye:{value:new THREE.Vector3()},
  reflectionBounds0:{value:new THREE.Vector4()},reflectionBounds1:{value:new THREE.Vector4()}
 };
 material.customProgramCacheKey=()=> 'niinimaki-water-reflections-3';
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=`uniform mat4 reflectionMatrix0;uniform mat4 reflectionMatrix1;
   varying vec4 vReflection0;varying vec4 vReflection1;varying vec3 vWaterWorld;
   ${shader.vertexShader}`.replace('#include <project_vertex>',`#include <project_vertex>
   vec4 waterWorld=modelMatrix*vec4(transformed,1.0);
   vWaterWorld=waterWorld.xyz;
   vReflection0=reflectionMatrix0*waterWorld;vReflection1=reflectionMatrix1*waterWorld;`);
  shader.fragmentShader=`uniform sampler2D reflectionMap0;uniform sampler2D reflectionMap1;
   uniform vec2 reflectionLevels;uniform vec2 reflectionReady;uniform vec3 reflectionEye;
   uniform vec4 reflectionBounds0;uniform vec4 reflectionBounds1;
   varying vec4 vReflection0;varying vec4 vReflection1;varying vec3 vWaterWorld;
   vec4 sampleReflection(sampler2D image,vec4 projected,float level,vec4 bounds){
    if(abs(vWaterWorld.y-level)>.04||projected.w<=0.0)return vec4(0.0);
    if(vWaterWorld.x<bounds.x||vWaterWorld.z<bounds.y||vWaterWorld.x>bounds.z||vWaterWorld.z>bounds.w)return vec4(0.0);
    vec2 uv=projected.xy/projected.w;
    if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0)return vec4(0.0);
    return texture2D(image,uv);
   }
   ${shader.fragmentShader}`.replace('#include <fog_fragment>',`#include <fog_fragment>
   vec4 reflected=vec4(0.0);
   if(reflectionReady.x>.5)reflected=sampleReflection(reflectionMap0,vReflection0,reflectionLevels.x,reflectionBounds0);
   if(reflectionReady.y>.5&&reflected.a==0.0)reflected=sampleReflection(reflectionMap1,vReflection1,reflectionLevels.y,reflectionBounds1);
   float incidence=abs(normalize(reflectionEye-vWaterWorld).y);
   float reflectionStrength=.25+.45*pow(1.0-incidence,3.0);
   gl_FragColor.rgb=gl_FragColor.rgb*(1.0-clamp(reflected.a*reflectionStrength,0.0,.7))+reflected.rgb*reflectionStrength;`);
 };
 const lakes=bodies.map(body=>{
  const a=body.outer;
  let level=body.surface;
  // Read the actual adjusted water mesh, not a possibly superseded source level.
  search:for(let j=1;j<=5;j++)for(let i=1;i<=5;i++){
   const e=a.e0+(a.e1-a.e0)*i/6,n=a.n0+(a.n1-a.n0)*j/6;
   if(!inside(a,e,n)||body.holes.some(h=>inside(h,e,n)))continue;
   const sampled=waterSurface(e,n);if(Number.isFinite(sampled)){level=sampled;break search;}
  }
  const x0=a.e0-originE,x1=a.e1-originE,z0=originN-a.n1,z1=originN-a.n0;
  return {name:body.name,level,box:new THREE.Box3(new THREE.Vector3(x0,level-.05,z0),new THREE.Vector3(x1,level+.05,z1)),area:(x1-x0)*(z1-z0)};
 });
 const mirrorCamera=new THREE.PerspectiveCamera(),frustum=new THREE.Frustum();
 const direction=new THREE.Vector3(),up=new THREE.Vector3(),target=new THREE.Vector3(),point=new THREE.Vector3(),size=new THREE.Vector2();
 const bias=new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
 const clipPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
 const slots=[],parts=[],lightCopies=[],forestCopies=[],proxyMaterials=new Map();
 // Index exact island outlines once. Only island triangles are copied from
 // the existing terrain; the rest of the landscape keeps its coarse reflection.
 const islandCells=new Map(),islandCellSize=250;
 for(const body of bodies)for(const ring of body.holes){
  for(let x=Math.floor(ring.e0/islandCellSize);x<=Math.floor(ring.e1/islandCellSize);x++)
   for(let y=Math.floor(ring.n0/islandCellSize);y<=Math.floor(ring.n1/islandCellSize);y++){
    const key=x+','+y;if(!islandCells.has(key))islandCells.set(key,[]);islandCells.get(key).push(ring);
   }
 }
 const landMaskUniforms={reflectionLandMask:{value:null},reflectionLandMaskBounds:{value:new THREE.Vector4()}};
 let nearForestSources=null,nearShoreTest=null,buildingDraws=0;
 let islandOcclusion=null,islandSources=null,islandTriangles=0;
 let enabled=false,light=false,fine=false,proxyScene=null,coarseTerrain=null,terrainSummer=null,proxyHemi=null,proxySun=null,forestInstances=0;
 let lastSnow=-1,lastSpring=-1,passCount=0,lastRenderMs=0;

 function initialise(){
  if(proxyScene)return;
  proxyScene=new THREE.Scene();proxyScene.name='Rannan, puuston ja myllyjen heijastus';
  proxyHemi=hemi.clone();proxySun=sun.clone();proxySun.castShadow=false;
  proxyScene.add(proxyHemi,proxySun,proxySun.target);
  for(const turbine of turbines){
   const clone=turbine.group.clone(),sources=[],copies=[];
   turbine.group.traverse(p=>sources.push(p));clone.traverse(p=>copies.push(p));
   for(let i=0;i<copies.length;i++){
    const source=sources[i],copy=copies[i];copy.matrixAutoUpdate=false;
    if(copy.isMesh){
     let proxy=proxyMaterials.get(source.material);
     if(!proxy){proxy=new THREE.MeshLambertMaterial({color:source.material.color,side:source.material.side});proxyMaterials.set(source.material,proxy);}
     copy.material=proxy;copy.castShadow=false;copy.receiveShadow=false;
    }
    parts.push({source,copy});
   }
   proxyScene.add(clone);
  }
  // Walls, roofs and windows already form three merged meshes. Reuse their
  // geometry and colors; no per-house draws, new assets or reflection shadows.
  for(const source of buildings){
   const copy=source.clone(false);copy.material=source.material.clone();
   copy.castShadow=false;copy.receiveShadow=false;copy.matrixAutoUpdate=false;
   copy.name='Heijastuksen rakennukset';proxyScene.add(copy);parts.push({source,copy});buildingDraws++;
  }
  for(const source of [lights.roof,lights.tower]){
   const copy=new THREE.Points(source.geometry,source.material.clone());
   copy.frustumCulled=false;copy.renderOrder=2;proxyScene.add(copy);lightCopies.push({source,copy});
  }
  // Coarse colored terrain supplies both the shore reflection and depth occlusion.
  const step=200,x0=bounds.eMin-originE-4000,z0=originN-bounds.nMax-4000;
  const cols=Math.ceil((bounds.eMax-bounds.eMin+8000)/step)+1,rows=Math.ceil((bounds.nMax-bounds.nMin+8000)/step)+1;
  const positions=new Float32Array(cols*rows*3),colors=new Float32Array(positions.length),color=new THREE.Color(),indices=[];
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
   const x=x0+i*step,z=z0+j*step,k=(j*cols+i)*3;
   positions[k]=x;positions[k+1]=height(originE+x,originN-z);positions[k+2]=z;
   terrainColorAt(originE+x,originN-z,positions[k+1],color);color.toArray(colors,k);
   if(i<cols-1&&j<rows-1){const a=j*cols+i;indices.push(a,a+cols,a+1,a+1,a+cols,a+cols+1);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setIndex(indices);geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();terrainSummer=colors.slice();
  coarseTerrain=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}));
  coarseTerrain.material.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,landMaskUniforms);
   shader.vertexShader='varying vec3 vReflectionTerrainWorld;\n'+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\n vReflectionTerrainWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
   shader.fragmentShader='varying vec3 vReflectionTerrainWorld;uniform sampler2D reflectionLandMask;uniform vec4 reflectionLandMaskBounds;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
    vec2 landUv=(vReflectionTerrainWorld.xz-reflectionLandMaskBounds.xy)/(reflectionLandMaskBounds.zw-reflectionLandMaskBounds.xy);landUv.y=1.0-landUv.y;
    if(landUv.x>=0.0&&landUv.x<=1.0&&landUv.y>=0.0&&landUv.y<=1.0&&texture2D(reflectionLandMask,landUv).r>.1)discard;`);
  };
  coarseTerrain.material.customProgramCacheKey=()=> 'niinimaki-reflected-land-mask-1';
  coarseTerrain.name='Heijastuksen rantamaasto';coarseTerrain.renderOrder=-1;proxyScene.add(coarseTerrain);syncIslandOcclusion();
  const forestLayers=forest();initialiseForest(forestLayers.far,false);syncNearForest(forestLayers.near);
  for(let i=0;i<2;i++){
   const renderTarget=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat,depthBuffer:true,stencilBuffer:false});
   renderTarget.texture.generateMipmaps=false;renderTarget.texture.encoding=renderer.outputEncoding;
   slots.push({renderTarget,width:1,height:1,plane:null,maskLake:null,landMask:null});uniforms['reflectionMap'+i].value=renderTarget.texture;
  }
 }
 // A depth-only copy of the islands stops the far shore showing through
 // gaps in reflected trees. Unlike the 200 m overview, it uses the exact
 // currently visible terrain triangles, including the refined near surface.
 function syncIslandOcclusion(){
  const sources=ground().map(mesh=>mesh.geometry);
  if(islandSources&&sources.length===islandSources.length&&sources.every((g,i)=>g===islandSources[i]))return;
  islandSources=sources;const positions=[];
  for(const geometry of sources){
   const p=geometry.attributes.position,ids=geometry.index;
   if(!p||!ids)continue;
   for(let k=0;k<ids.count;k+=3){
    const a=ids.getX(k),b=ids.getX(k+1),c=ids.getX(k+2);
    const e=originE+(p.getX(a)+p.getX(b)+p.getX(c))/3,n=originN-(p.getZ(a)+p.getZ(b)+p.getZ(c))/3;
    const rings=islandCells.get(Math.floor(e/islandCellSize)+','+Math.floor(n/islandCellSize));
    if(!rings||!rings.some(r=>inside(r,e,n)))continue;
    for(const id of [a,b,c])positions.push(p.getX(id),p.getY(id),p.getZ(id));
   }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeBoundingSphere();islandTriangles=positions.length/9;
  if(!islandOcclusion){
   islandOcclusion=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide,colorWrite:false,depthWrite:true}));
   islandOcclusion.name='Heijastuksen saarten maastopeitto';islandOcclusion.renderOrder=-2;proxyScene.add(islandOcclusion);
  }else{islandOcclusion.geometry.dispose();islandOcclusion.geometry=geometry;}
  islandOcclusion.visible=islandTriangles>0;
 }
 // Select existing far-tree groups within 450 m of a mapped shore (also islands).
 // This keeps the recognizable shoreline without rendering the whole forest.
 function initialiseForest(sources,near){
  const groups=new Map();
  if(!nearShoreTest){
  const margin=450,cellSize=500,bins=new Map();
  for(const body of bodies)for(const ring of [body.outer,...body.holes])for(let i=0;i<ring.points.length;i++){
   const a=ring.points[i],b=ring.points[(i+1)%ring.points.length],x=a[0]-originE,z=originN-a[1],dx=b[0]-a[0],dz=a[1]-b[1];
   if(dx*dx+dz*dz<.01)continue;
   const segment={x,z,dx,dz,length2:dx*dx+dz*dz};
   for(let ix=Math.floor((Math.min(x,x+dx)-margin)/cellSize);ix<=Math.floor((Math.max(x,x+dx)+margin)/cellSize);ix++)
    for(let iz=Math.floor((Math.min(z,z+dz)-margin)/cellSize);iz<=Math.floor((Math.max(z,z+dz)+margin)/cellSize);iz++){
     const key=ix+','+iz;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(segment);
    }
  }
  function nearShore(x,z){
   for(const s of bins.get(Math.floor(x/cellSize)+','+Math.floor(z/cellSize))||[]){
    const t=Math.max(0,Math.min(1,((x-s.x)*s.dx+(z-s.z)*s.dz)/s.length2));
    if((x-s.x-t*s.dx)**2+(z-s.z-t*s.dz)**2<margin*margin)return true;
   }return false;
  }
  nearShoreTest=nearShore;
  }
  for(const source of sources){
   const key=source.material.uniforms.leafMap.value.uuid;
   let group=groups.get(key);
   if(!group)groups.set(key,group={source,center:[],height:[],variant:[],site:[]});
   const attrs=source.geometry.attributes;
   for(let i=0;i<source.geometry.instanceCount;i++){
    const x=attrs.aCenter.getX(i),z=attrs.aCenter.getZ(i);if(!nearShoreTest(x,z))continue;
    group.center.push(x,attrs.aCenter.getY(i),z);group.height.push(attrs.aHeight.getX(i));group.variant.push(attrs.aVariant.getX(i));group.site.push(attrs.aSite.getX(i));
   }
  }
  for(const group of groups.values()){
   if(!group.height.length)continue;
   const source=group.source,g=new THREE.InstancedBufferGeometry();
   g.setIndex(source.geometry.index.clone());g.setAttribute('position',source.geometry.attributes.position.clone());g.setAttribute('uv',source.geometry.attributes.uv.clone());
   for(const [name,values,size] of [['aCenter',group.center,3],['aHeight',group.height,1],['aVariant',group.variant,1],['aSite',group.site,1]])g.setAttribute(name,new THREE.InstancedBufferAttribute(new Float32Array(values),size));
   g.instanceCount=group.height.length;forestInstances+=g.instanceCount;
   // Use the same near/far trees, textures and world-space LOD boundary as the
   // visible shoreline. Only the water-level clip is added to their shader.
   const vertex='varying float vReflectionHeight;\n'+source.material.vertexShader.replace('gl_Position=projectionMatrix', 'vReflectionHeight=world.y;gl_Position=projectionMatrix');
   const fragment='varying float vReflectionHeight;uniform float reflectionLevel;\n'+source.material.fragmentShader.replace('void main(){','void main(){if(vReflectionHeight<reflectionLevel)discard;');
   const mat=new THREE.ShaderMaterial({uniforms:{...source.material.uniforms,reflectionLevel:{value:0}},vertexShader:vertex,fragmentShader:fragment,side:THREE.DoubleSide});
   const mesh=new THREE.Mesh(g,mat);mesh.frustumCulled=false;mesh.name='Heijastuksen rantapuusto';mesh.userData.near=near;proxyScene.add(mesh);forestCopies.push(mesh);
  }
 }
 function syncNearForest(sources){
  if(sources===nearForestSources)return;nearForestSources=sources;
  for(let i=forestCopies.length-1;i>=0;i--){const tree=forestCopies[i];if(!tree.userData.near)continue;forestInstances-=tree.geometry.instanceCount;proxyScene.remove(tree);tree.geometry.dispose();tree.material.dispose();forestCopies.splice(i,1);}
  initialiseForest(sources,true);
 }
 // A small lake-local raster of the ORIGINAL water polygons prevents coarse
 // land triangles from bridging water, including narrow bays and small islands.
 // It is generated only when the viewed lake changes; no terrain files are loaded.
 function prepareLandMask(slot,lake){
  if(slot.maskLake!==lake){
   if(slot.landMask)slot.landMask.dispose();
   const box=lake.box,spanX=box.max.x-box.min.x,spanZ=box.max.z-box.min.z;
   const canvas=document.createElement('canvas');canvas.width=Math.max(64,Math.round(1024*Math.min(1,spanX/spanZ)));canvas.height=Math.max(64,Math.round(1024*Math.min(1,spanZ/spanX)));
   const ctx=canvas.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fff';
   for(const body of bodies){const outer=body.outer;if(outer.e1<originE+box.min.x||outer.e0>originE+box.max.x||outer.n1<originN-box.max.z||outer.n0>originN-box.min.z)continue;
    ctx.beginPath();for(const ring of [outer,...body.holes]){for(let i=0;i<ring.points.length;i++){const p=ring.points[i],x=(p[0]-originE-box.min.x)/spanX*canvas.width,y=(originN-p[1]-box.min.z)/spanZ*canvas.height;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();}ctx.fill('evenodd');
   }
   slot.landMask=new THREE.CanvasTexture(canvas);slot.landMask.generateMipmaps=false;slot.landMask.minFilter=THREE.LinearFilter;slot.landMask.magFilter=THREE.LinearFilter;slot.maskLake=lake;
  }
  landMaskUniforms.reflectionLandMask.value=slot.landMask;
  landMaskUniforms.reflectionLandMaskBounds.value.set(lake.box.min.x,lake.box.min.z,lake.box.max.x,lake.box.max.z);
 }
 function setWaterColor(value){baseMaterial.color.copy(value);material.color.copy(value);}
 function updateTerrainSeason(){
  const state=season(),snow=state.snow,spring=state.spring;
  if(snow===lastSnow&&spring===lastSpring)return;
  const a=coarseTerrain.geometry.attributes.color,colors=a.array;
  for(let k=0;k<colors.length;k+=3){colors[k]=terrainSummer[k]*(1-snow)+.88*snow;colors[k+1]=(terrainSummer[k+1]*(1-snow)+.91*snow)*(snow<1?.78+.22*spring:1);colors[k+2]=terrainSummer[k+2]*(1-snow)+.89*snow;}
  a.needsUpdate=true;lastSnow=snow;lastSpring=spring;
 }
 function setEnabled(value){
  enabled=Boolean(value);waterMesh.material=enabled?material:baseMaterial;
  uniforms.reflectionReady.value.set(0,0);
 }
 function setLight(value){light=Boolean(value);}
 function setFine(value){fine=Boolean(value);}
 function updateObjects(){
  updateTerrainSeason();syncIslandOcclusion();syncNearForest(forest().near);
  for(const {source,copy} of parts){if(source.matrixAutoUpdate)source.updateMatrix();copy.matrix.copy(source.matrix);copy.visible=source.visible;}
  proxyHemi.color.copy(hemi.color);proxyHemi.groundColor.copy(hemi.groundColor);proxyHemi.intensity=hemi.intensity;
  proxySun.color.copy(sun.color);proxySun.intensity=sun.intensity;proxySun.visible=sun.visible;
  proxySun.position.copy(sun.position);proxySun.target.position.copy(sun.target.position);proxySun.target.updateMatrixWorld();
  proxyScene.fog=scene.fog;
  for(const {source,copy} of lightCopies){
   copy.visible=source.visible;
   for(const [name,uniform] of Object.entries(source.material.uniforms)){
    const value=copy.material.uniforms[name];if(value.value?.copy)value.value.copy(uniform.value);else value.value=uniform.value;
   }
  }
 }
 function prepareCamera(camera,level){
  mirrorCamera.position.copy(camera.position);mirrorCamera.position.y=2*level-camera.position.y;
  camera.getWorldDirection(direction);direction.y=-direction.y;
  up.set(0,1,0).applyQuaternion(camera.quaternion);up.y=-up.y;mirrorCamera.up.copy(up);
  target.copy(mirrorCamera.position).add(direction);mirrorCamera.lookAt(target);
  mirrorCamera.near=camera.near;mirrorCamera.far=camera.far;
  mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);mirrorCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);mirrorCamera.updateMatrixWorld();
 }
 function render(camera){
  if(!enabled)return;
  uniforms.reflectionEye.value.copy(camera.position);
  uniforms.reflectionReady.value.set(0,0);
  // The main frame calls this after camera/rotor/light updates and immediately
  // before drawing the landscape. Reuse that frame's pose; a slower independent
  // refresh leaves a stale mirror image behind during movement and causes jumps.
  initialise();camera.updateMatrixWorld();frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const candidates=[];
  for(const lake of lakes){
   if(camera.position.y<=lake.level+.05||!frustum.intersectsBox(lake.box))continue;
   lake.box.clampPoint(camera.position,point);const distance=Math.hypot(point.x-camera.position.x,point.z-camera.position.z);
   if(distance>25000)continue;
   candidates.push({lake,score:lake.area/Math.pow(distance+300,2)});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const selected=[];
  for(const {lake} of candidates){if(selected.some(p=>Math.abs(p.level-lake.level)<.04))continue;selected.push(lake);if(selected.length===(light?1:2))break;}
  updateObjects();renderer.getSize(size);
  const oldTarget=renderer.getRenderTarget(),oldColor=renderer.getClearColor(new THREE.Color()),oldAlpha=renderer.getClearAlpha();
  const oldViewport=renderer.getViewport(new THREE.Vector4()),oldScissor=renderer.getScissor(new THREE.Vector4()),oldScissorTest=renderer.getScissorTest();
  const oldXr=renderer.xr.enabled,oldShadows=renderer.shadowMap.autoUpdate,oldClipping=renderer.clippingPlanes,oldAutoClear=renderer.autoClear;
  const began=performance.now();
  try{
   renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;renderer.autoClear=true;renderer.setClearColor(0,0);renderer.clippingPlanes=[clipPlane];
   for(let i=0;i<2;i++){
    const slot=slots[i],lake=selected[i];slot.plane=null;if(!lake)continue;
    prepareCamera(camera,lake.level);prepareLandMask(slot,lake);
    const resolution=(light?384:768)*(fine?1.5:1),width=Math.max(96,Math.round(resolution*Math.min(1,camera.aspect))),height=Math.max(96,Math.round(resolution/Math.max(1,camera.aspect)));
    if(slot.width!==width||slot.height!==height){slot.renderTarget.setSize(width,height);slot.width=width;slot.height=height;}
    clipPlane.constant=-lake.level;
    for(const tree of forestCopies)tree.material.uniforms.reflectionLevel.value=lake.level;
    for(const {copy} of lightCopies)copy.material.uniforms.pixelRatio.value=width/size.x;
    renderer.setRenderTarget(slot.renderTarget);renderer.setScissorTest(false);renderer.state.buffers.depth.setMask(true);renderer.clear(true,true,true);renderer.render(proxyScene,mirrorCamera);passCount++;
    uniforms['reflectionMatrix'+i].value.copy(bias).multiply(mirrorCamera.projectionMatrix).multiply(mirrorCamera.matrixWorldInverse);
    uniforms.reflectionLevels.value.setComponent(i,lake.level);
    uniforms['reflectionBounds'+i].value.set(lake.box.min.x,lake.box.min.z,lake.box.max.x,lake.box.max.z);
    uniforms.reflectionReady.value.setComponent(i,1);slot.plane=lake;
   }
  }finally{
   renderer.clippingPlanes=oldClipping;renderer.xr.enabled=oldXr;renderer.shadowMap.autoUpdate=oldShadows;renderer.autoClear=oldAutoClear;
   renderer.setClearColor(oldColor,oldAlpha);renderer.setRenderTarget(oldTarget);renderer.setViewport(oldViewport);renderer.setScissor(oldScissor);renderer.setScissorTest(oldScissorTest);
  }
  lastRenderMs=performance.now()-began;
 }
 function getStats(){return {enabled,light,fine,passCount,lastRenderMs,planes:slots.filter(s=>s.plane).map(s=>({name:s.plane.name,level:s.plane.level,width:s.width,height:s.height})),forestInstances,forestDraws:forestCopies.length,buildingDraws,islandTriangles,coarseTriangles:coarseTerrain?coarseTerrain.geometry.index.count/3:0};}
 return {setEnabled,setLight,setFine,setWaterColor,render,getStats};
};
