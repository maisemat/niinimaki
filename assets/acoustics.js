// Approximate outdoor propagation for the listening demonstration. This is not
// windPRO, Nord2000, an ISO 9613-2 compliance calculation, or a measurement.
(function(root){'use strict';
 const frequencies=[63,125,250,500,1000,2000,4000,8000];
 const aWeight=[-26.2,-16.1,-8.6,-3.2,0,1.2,1.0,-1.1];
 // V172-7.2 MW PO7200 serrated blade octave data from the manufacturer's
 // EnVentus 172 document, reproduced in AFRY's Vasama II 2025 report. That
 // report's A-weighted band figures contain +2 dB and sum to 109.8 dB(A). Niinimäki's
 // report uses a V172 7.2 MW serrated reference but does not tabulate bands.
 const publishedBands=[91.8,98.8,103.4,102.4,103.0,101.9,100.3,87.5];
 const nominalPower=107.8,reportMargin=2,hubHeight=194;
 const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
 function sumDb(levels){return levels.length?10*Math.log10(levels.reduce((sum,level)=>sum+10**(level/10),0)):-Infinity}
 const sourceBands=publishedBands.map(level=>nominalPower+level-sumDb(publishedBands)); // A-weighted bands
 // ISO 9613-1 atmospheric absorption equation at 101.325 kPa.
 function airDbPerKm(f,temperature=15,humidity=.70){
  const T=temperature+273.15,tr=T/293.15;
  const h=100*clamp(humidity,0,1)*10**(-6.8346*(273.16/T)**1.261+4.6151);
  const fO=24+40400*h*(.02+h)/(.391+h);
  const fN=tr**(-.5)*(9+280*h*Math.exp(-4.17*(tr**(-1/3)-1)));
  return 1000*8.686*f*f*(1.84e-11*Math.sqrt(tr)+tr**(-2.5)*(0.01275*Math.exp(-2239.1/T)*fO/(fO*fO+f*f)+0.1068*Math.exp(-3352/T)*fN/(fN*fN+f*f)));
 }
 function pointInPolygon(e,n,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];if((a[1]>n)!==(b[1]>n)&&e<(b[0]-a[0])*(n-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside}
 function createBuildingIndex(buildings,cellSize=100){
  const cells=new Map();for(const building of buildings){const points=building.geometry;if(!points?.length)continue;
   const es=points.map(p=>p[0]),ns=points.map(p=>p[1]),e0=Math.min(...es),e1=Math.max(...es),n0=Math.min(...ns),n1=Math.max(...ns);
   for(let i=Math.floor(e0/cellSize);i<=Math.floor(e1/cellSize);i++)for(let j=Math.floor(n0/cellSize);j<=Math.floor(n1/cellSize);j++){
    const key=i+','+j;if(!cells.has(key))cells.set(key,[]);cells.get(key).push({points,height:building.height||5});
   }
  }
  return(e,n)=>{for(const item of cells.get(Math.floor(e/cellSize)+','+Math.floor(n/cellSize))||[])if(pointInPolygon(e,n,item.points))return item.height;return 0};
 }
 function pathEffects(observer,turbine,terrain,canopy,building,cleared,water,sourceHeight=hubHeight){
  const dx=observer.e-turbine.e,dn=observer.n-turbine.n,horizontal=Math.hypot(dx,dn);
  const sourceY=terrain(turbine.e,turbine.n)+sourceHeight,receiverY=terrain(observer.e,observer.n)+observer.height;
  const direct=Math.hypot(horizontal,sourceY-receiverY),steps=clamp(Math.ceil(horizontal/40),8,180);
  let forestMetres=0,waterMetres=0,crest=null,buildingCrest=null;
  for(let i=1;i<steps;i++){
   const t=i/steps,e=turbine.e+dx*t,n=turbine.n+dn*t,ground=terrain(e,n),ray=sourceY+(receiverY-sourceY)*t,excess=ground-ray;
   if(excess>0&&(!crest||excess>crest.excess))crest={excess,t,y:ground};
   const crown=canopy(e,n);
   if(crown>=3&&ray>ground&&ray<ground+crown&&(!cleared||!cleared(e,n)))forestMetres+=horizontal/steps;
   if(water(e,n))waterMetres+=horizontal/steps;
  }
  // Fine samples near the listener catch cottages missed by the terrain grid.
  const nearLength=Math.min(horizontal,350),nearSteps=Math.ceil(nearLength/4);
  for(let i=0;i<nearSteps;i++){
   const t=1-(i+.5)*nearLength/nearSteps/Math.max(horizontal,1),e=turbine.e+dx*t,n=turbine.n+dn*t,roof=building(e,n);
   if(!roof)continue;const roofY=terrain(e,n)+roof,ray=sourceY+(receiverY-sourceY)*t,excess=roofY-ray;
   if(excess>0&&(!buildingCrest||excess>buildingCrest.excess))buildingCrest={excess,t,y:roofY};
  }
  function diffraction(obstacle){if(!obstacle)return 0;const a=horizontal*obstacle.t,b=horizontal-a;
   const around=Math.hypot(a,obstacle.y-sourceY)+Math.hypot(b,obstacle.y-receiverY),delta=Math.max(0,around-direct);
   return clamp(10*Math.log10(3+40*delta)-4,0,18)*clamp(obstacle.excess/5,0,1);
  }
  return{horizontal,direct,forestMetres,waterMetres,terrainScreen:diffraction(crest),buildingScreen:diffraction(buildingCrest)};
 }
 function evaluate({observer,turbines,terrain,canopy=()=>0,building=()=>0,water=()=>false,cleared=null,windFrom=270,windSpeed=8,temperature=15,humidity=.70,phase=1,bladeDetail=false}){
  const nearest=Math.min(...turbines.map(t=>Math.hypot(t.e-observer.e,t.n-observer.n)));
  if(!phase)return{level:-Infinity,upper:-Infinity,nearest,sources:[]};
  const air=frequencies.map(f=>airDbPerKm(f,temperature,humidity)),sources=[];
  for(const turbine of turbines){
   const path=pathEffects(observer,turbine,terrain,canopy,building,cleared,water),spreading=20*Math.log10(Math.max(1,path.direct))+11;
   const toward=Math.atan2(observer.e-turbine.e,observer.n-turbine.n),windTo=(windFrom+180)*Math.PI/180,alignment=Math.cos(toward-windTo);
   // Bounded estimates: exact V172 operating modes and vertical weather
   // profiles are not published in the project data available here.
   const operation=windSpeed<3?-Infinity:clamp((windSpeed-8)*1.1,-6,0);
   const windEffect=alignment>=0?alignment*clamp(windSpeed/8,0,1.4):alignment*clamp(windSpeed/8,0,1.4)*3;
   const bandsForPath=path=>sourceBands.map((lw,i)=>{
    // Forest only attenuates where the source-to-ear ray passes through it.
    // Low frequencies are barely affected; forest never acts as a mute switch.
    const forest=Math.min(8,path.forestMetres*[.0001,.0003,.001,.0025,.005,.009,.012,.014][i]);
    const screen=Math.max(path.terrainScreen,path.buildingScreen)*[.08,.16,.3,.5,.7,1,1,1][i];
    const ground=(i<2?1:0)+path.waterMetres/Math.max(path.horizontal,1)*[1.4,2.9,2.5,1.5,.7,0,0,0][i]; // bounded reflection allowance
    return lw+operation-spreading-air[i]*path.direct/1000+windEffect+ground-screen-forest;
   });
   const bands=bandsForPath(path);
   // Only while listening, sample the paths from the lowest and highest
   // blade-tip positions. The sound renderer interpolates these responses
   // over the rotation and preserves the hub-level mean energy.
   let bladeHeightDb=null,bladePathDistance=null;
   if(bladeDetail){
    const lowerPath=pathEffects(observer,turbine,terrain,canopy,building,cleared,water,hubHeight-100);
    const upperPath=pathEffects(observer,turbine,terrain,canopy,building,cleared,water,hubHeight+100);
    const lower=bandsForPath(lowerPath),upper=bandsForPath(upperPath);
    bladeHeightDb={lower:lower.map((value,i)=>clamp(value-bands[i],-12,12)),upper:upper.map((value,i)=>clamp(value-bands[i],-12,12))};
    bladePathDistance={lower:lowerPath.direct-path.direct,upper:upperPath.direct-path.direct};
   }
   sources.push({turbine,level:sumDb(bands),bands,distance:path.direct,forestMetres:path.forestMetres,terrainScreen:path.terrainScreen,buildingScreen:path.buildingScreen,bladeHeightDb,bladePathDistance});
  }
  const level=sumDb(sources.map(source=>source.level));
  return{level,upper:level+reportMargin,nearest,sources};
 }
 const api={frequencies,aWeight,sourceBands,nominalPower,reportMargin,airDbPerKm,createBuildingIndex,evaluate};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.WIND_ACOUSTICS=api;
})(typeof window!=='undefined'?window:globalThis);
