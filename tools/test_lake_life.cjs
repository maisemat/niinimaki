const fs=require('fs'),vm=require('vm');
class V3{set(x,y,z){this.x=x;this.y=y;this.z=z}};
class Obj{constructor(){this.position=new V3();this.rotation={};this.scale=new V3();this.children=[];this.visible=true}add(x){this.children.push(x)}}
class Mesh extends Obj{constructor(g,m){super();this.geometry=g;this.material=m}}
const scene=new Obj(),THREE={SphereGeometry:class{},CylinderGeometry:class{},MeshLambertMaterial:class{},Mesh,Group:Obj};
const context={window:{},THREE,Math};vm.runInNewContext(fs.readFileSync('assets/lake-life.js','utf8'),context);
const lake={name:'Renkajärvi',outer:{e0:0,e1:1000,n0:0,n1:1000},holes:[{e0:450,e1:550,n0:450,n1:550}]};
const cover={bodies:[lake],inside:(p,e,n)=>e>=p.e0&&e<=p.e1&&n>=p.n0&&n<=p.n1,bodyAt(e,n){return this.inside(lake.outer,e,n)&&!lake.holes.some(h=>this.inside(h,e,n))?lake:null},waterSurface(e,n){return this.bodyAt(e,n)?140:-Infinity}};
const life=context.window.createLakeLife(scene,cover,0,1000);if(life.boats.length!==3||life.loons.length!==10)throw Error('Wrong counts');
for(let i=0;i<10000;i++){life.update(.25,0);for(const item of [...life.boats,...life.loons])if(!cover.bodyAt(item.e,item.n))throw Error('Object left lake')}
for(const item of life.loons){item.diveAt=0;item.underwaterUntil=0}
life.update(.25,0);if(!life.loons.every(x=>!x.group.visible))throw Error('Loon dive failed');
for(let i=0;i<50;i++)life.update(.25,0);if(!life.loons.every(x=>x.group.visible))throw Error('Loon resurfacing failed');
life.update(.25,1);if(![...life.boats,...life.loons].every(x=>!x.group.visible))throw Error('Winter visibility failed');
console.log('Lake-life movement and dives passed');
