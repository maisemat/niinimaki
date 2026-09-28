// Small illustrative lake traffic; routes are constrained to Renkajärvi's mapped water.
window.createLakeLife=function(scene,cover,originE,originN){
 const lake=cover.bodies.find(body=>body.name==='Renkajärvi');
 if(!lake)return{update(){},boats:[],loons:[]};
 let seed=7192026;
 function random(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296}
 const valid=(e,n,margin)=>{
  if(cover.bodyAt(e,n)!==lake||!Number.isFinite(cover.waterSurface(e,n)))return false;
  return [[margin,0],[-margin,0],[0,margin],[0,-margin]].every(([de,dn])=>cover.bodyAt(e+de,n+dn)===lake&&Number.isFinite(cover.waterSurface(e+de,n+dn)))
 };
 function randomPoint(margin,near=null,radius=0){
  for(let i=0;i<500;i++){
   let e,n;
   if(near){const a=random()*Math.PI*2,r=Math.sqrt(random())*radius;e=near.e+Math.cos(a)*r;n=near.n+Math.sin(a)*r}
   else{e=lake.outer.e0+random()*(lake.outer.e1-lake.outer.e0);n=lake.outer.n0+random()*(lake.outer.n1-lake.outer.n0)}
   if(valid(e,n,margin))return{e,n}
  }
  return null
 }
 function routeClear(a,b,margin){const distance=Math.hypot(b.e-a.e,b.n-a.n),steps=Math.ceil(distance/15);for(let i=1;i<=steps;i++){const t=i/steps;if(!valid(a.e+(b.e-a.e)*t,a.n+(b.n-a.n)*t,margin))return false}return true}
 const ball=new THREE.SphereGeometry(1,8,6),head=new THREE.SphereGeometry(1,8,6),shaft=new THREE.CylinderGeometry(.045,.045,2.2,5),
  hullMat=new THREE.MeshLambertMaterial({color:0x6c4833}),insideMat=new THREE.MeshLambertMaterial({color:0x9c7657}),woodMat=new THREE.MeshLambertMaterial({color:0xa88660}),skinMat=new THREE.MeshLambertMaterial({color:0xd1a780}),
  birdMat=new THREE.MeshLambertMaterial({color:0x222c2c}),whiteMat=new THREE.MeshLambertMaterial({color:0xe9eeea}),billMat=new THREE.MeshLambertMaterial({color:0x667073}),shirtMats=[0x355d6b,0x7d4c3f,0x7e8062].map(color=>new THREE.MeshLambertMaterial({color}));
 function oval(group,geometry,material,x,y,z,sx,sy,sz){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);group.add(mesh);return mesh}
 function boat(index){const group=new THREE.Group();
  oval(group,ball,hullMat,0,.18,0,1.16,.30,2.45);
  oval(group,ball,insideMat,0,.40,0,.85,.035,1.78);
  oval(group,ball,woodMat,0,.47,.12,.82,.08,.20);
  oval(group,ball,shirtMats[index%shirtMats.length],0,.82,.1,.42,.47,.32);
  oval(group,head,skinMat,0,1.35,.08,.29,.32,.29);
  const oars=[];
  for(const side of [-1,1]){const pivot=new THREE.Group();pivot.position.set(side*.76,.48,.12);const handle=new THREE.Mesh(shaft,woodMat);handle.rotation.z=Math.PI/2;handle.position.x=side*1.02;pivot.add(handle);oval(pivot,ball,woodMat,side*2.1,-.06,0,.36,.045,.13);group.add(pivot);oars.push(pivot)}
  scene.add(group);return{group,oars}
 }
 function loon(){const group=new THREE.Group();
  oval(group,ball,birdMat,0,.13,0,.34,.19,.67);
  oval(group,ball,whiteMat,0,.21,-.38,.23,.12,.16);
  oval(group,head,birdMat,0,.46,-.44,.20,.27,.22);
  oval(group,ball,billMat,0,.40,-.74,.11,.07,.26);
  scene.add(group);return{group}
 }
 const boats=[],loons=[];
 function create(kind,index){const start=index===0?randomPoint(kind==='boat'?9:3,{e:343424,n:6759709},320):null;
  const position=start||randomPoint(kind==='boat'?9:3);if(!position)return null;
  const art=kind==='boat'?boat(index):loon();const object={...art,kind,index,e:position.e,n:position.n,target:null,speed:kind==='boat'?.7+random()*.45:.65+random()*.55,turn:random()*Math.PI*2,diveAt:kind==='loon'?30+random()*70:Infinity,underwaterUntil:0,emerge:null};
  return object
 }
 for(let i=0;i<3;i++){const item=create('boat',i);if(item)boats.push(item)}
 for(let i=0;i<10;i++){const item=create('loon',i);if(item)loons.push(item)}
 let elapsed=0;
 function newTarget(item){const origin={e:item.e,n:item.n},margin=item.kind==='boat'?9:3;
  for(let i=0;i<40;i++){const point=randomPoint(margin,origin,item.kind==='boat'?310:150);if(point&&Math.hypot(point.e-origin.e,point.n-origin.n)>25&&routeClear(origin,point,margin)){item.target=point;return}}
  item.target=null
 }
 function update(dt,snow=0){elapsed+=dt;const winter=snow>.65;
  for(const item of [...boats,...loons]){
   if(winter){item.group.visible=false;continue}
   if(item.kind==='loon'&&elapsed>=item.diveAt&&item.underwaterUntil===0){item.underwaterUntil=elapsed+5+random()*7;item.emerge=randomPoint(3,{e:item.e,n:item.n},100)||{e:item.e,n:item.n};item.group.visible=false}
   if(item.underwaterUntil){if(elapsed<item.underwaterUntil){item.group.visible=false;continue}item.e=item.emerge.e;item.n=item.emerge.n;item.underwaterUntil=0;item.diveAt=elapsed+35+random()*75;item.target=null}
   item.group.visible=true;
   if(!item.target||Math.hypot(item.target.e-item.e,item.target.n-item.n)<3)newTarget(item);
   if(item.target){const de=item.target.e-item.e,dn=item.target.n-item.n,distance=Math.hypot(de,dn);const step=Math.min(distance,item.speed*dt);item.e+=de/distance*step;item.n+=dn/distance*step;item.turn=Math.atan2(de,dn)}
   const water=cover.waterSurface(item.e,item.n);item.group.position.set(item.e-originE,water+.12+(item.kind==='boat'?.025:.018)*Math.sin(elapsed*2+item.index),originN-item.n);
   item.group.rotation.y=item.turn;
   if(item.oars)for(let i=0;i<item.oars.length;i++)item.oars[i].rotation.y=(i?1:-1)*(.16+.18*Math.sin(elapsed*2.6+item.index))
  }
 }
 update(0);
 return{update,boats,loons}
};
