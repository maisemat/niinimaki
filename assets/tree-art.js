// Lightweight, deterministic tree silhouettes. One crossed-free billboard per
// tree; bark and leaves occupy separate textures so seasonal color/visibility
// changes do not regenerate the forest or its geometry.
(() => {
  const tileW=160, tileH=192, variants=3, kinds=6;
  function random(seed){let state=seed>>>0;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296}}
  function stroke(ctx,a,b,width,color){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.quadraticCurveTo((a[0]+b[0])/2+(b[0]-a[0])*.12,(a[1]+b[1])/2,b[0],b[1]);ctx.stroke()}
  function tuft(ctx,x,y,rx,ry,rng,conifer){
    const points=conifer?8:11,shift=rng()*Math.PI*2;ctx.beginPath();
    for(let i=0;i<points;i++){const angle=i*Math.PI*2/points+shift,r=(.78+rng()*.38),px=x+Math.cos(angle)*rx*r,py=y+Math.sin(angle)*ry*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py)}
    ctx.closePath();const shade=.72+rng()*.28;ctx.fillStyle=`rgba(${Math.round(255*shade)},${Math.round(255*shade)},${Math.round(255*shade)},0.96)`;ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.16)';ctx.beginPath();ctx.ellipse(x-rx*.22,y-ry*.25,rx*.36,ry*.23,0,0,Math.PI*2);ctx.fill();
  }
  function makeTree(wood,leaf,kind,variant){
    const rng=random(0x9e3779b9+kind*4099+variant*137),ox=variant*tileW,cx=ox+tileW/2,base=tileH;
    if(kind===5){
      // Low, irregular shrubs use the same two-layer seasonal atlas as trees.
      // Several loose leaf clusters keep gaps visible between the stems.
      for(let stem=0;stem<7;stem++){
        const foot=cx+(rng()-.5)*48,tipX=cx+(rng()-.5)*104,tipY=49+rng()*47;
        stroke(wood,[foot,base],[tipX,tipY],1.5+rng()*1.5,'#777165');
        tuft(leaf,tipX,tipY,15+rng()*13,16+rng()*16,rng,false);
        if(stem%2===0)tuft(leaf,(foot+tipX)*.5,111+rng()*23,16+rng()*10,14+rng()*9,rng,false);
      }
      return;
    }
    const tops=[18,8,22][variant],lean=(rng()-.5)*7,tip=cx+lean,top=kind===1?tops+16:tops;
    wood.fillStyle=kind===4?'#e8e8df':kind===3?'#87847e':kind===0?'#8a8780':kind===2?'#55493d':'#68594b';
    wood.beginPath();wood.moveTo(cx-4.5,base);wood.lineTo(cx+4.5,base);wood.lineTo(tip+1.5,top);wood.lineTo(tip-1.5,top);wood.closePath();wood.fill();
    wood.fillStyle=kind===4?'rgba(31,37,34,.26)':(kind===0||kind===3)?'rgba(50,54,52,.16)':'rgba(20,18,13,.22)';wood.beginPath();wood.moveTo(cx-4,base);wood.lineTo(cx-2,base);wood.lineTo(tip-1,top);wood.lineTo(tip-2,top);wood.closePath();wood.fill();
    if(kind===4){
      // Sparse dark lenticels, held inside the narrow white birch trunk.
      wood.strokeStyle='#303535';
      for(let y=58;y<179;y+=11+rng()*8){const x=cx+lean*(1-y/base),w=2.1*(y-top)/(base-top);wood.lineWidth=.65+rng()*.55;wood.beginPath();wood.moveTo(x-w,y);wood.lineTo(x+w*.7,y-1-rng()*2);wood.stroke()}
    }
    if(kind===1||kind===2){
      const spruce=kind===2,tiers=spruce?11:7,first=spruce?28:49,last=spruce?166:143;
      for(let t=0;t<tiers;t++){
        const y=first+(last-first)*t/(tiers-1),progress=t/(tiers-1),reach=spruce?(9+progress*(49+variant*5)):(17+Math.sin(progress*Math.PI)*(41+variant*7));
        for(const side of [-1,1]){
          const endX=cx+side*reach*(.82+rng()*.26),endY=y+(spruce?6+rng()*7:-4+rng()*8),start=[cx+lean*(1-y/base),y-3];
          stroke(wood,start,[endX,endY],Math.max(1.3,3-progress*1.6),'#4b463b');
          // Separate tufts leave visible sky and branches between each whorl.
          const count=spruce?3:2;
          for(let q=0;q<count;q++){
            const s=(q+1)/(count+.35),x=start[0]+(endX-start[0])*s,y2=start[1]+(endY-start[1])*s-3;
            tuft(leaf,x,y2,spruce?8+progress*4:9+progress*3,spruce?5+progress*2:6+progress*2,rng,true);
          }
        }
      }
      tuft(leaf,tip,top+10,kind===2?7:10,kind===2?15:11,rng,true);
    } else {
      // Broadleaf crown has several independent branches and leaf groups.
      const branchCount=kind===3?11:kind===4?10:9,spread=kind===3?57:kind===4?50:47;
      for(let b=0;b<branchCount;b++){
        const side=b%2?-1:1,rank=Math.floor(b/2),startY=138-rank*12+(rng()-.5)*6;
        const reach=(.42+.58*rng())*spread,ex=cx+side*reach,ey=28+rank*8+(rng()-.5)*19;
        stroke(wood,[cx+(rng()-.5)*3,startY],[ex,ey],kind===4?Math.max(.75,1.8-rank*.16):Math.max(1.1,2.8-rank*.27),kind===4?'#686e6b':'#74716d');
        const middleX=cx+side*reach*.67,middleY=startY+(ey-startY)*.72;
        if(b%3!==0)tuft(leaf,middleX,middleY,10+rng()*6,9+rng()*6,rng,false);
        tuft(leaf,ex,ey,14+rng()*8,12+rng()*8,rng,false);
        if(b%3===1)tuft(leaf,ex+side*7,ey-12,10+rng()*5,9+rng()*5,rng,false);
      }
      tuft(leaf,tip,top+15,14+variant*3,13,rng,false);
    }
  }
  function atlases(){
    const result=[];
    for(let kind=0;kind<kinds;kind++){
      const barkCanvas=document.createElement('canvas'),leafCanvas=document.createElement('canvas');
      barkCanvas.width=leafCanvas.width=tileW*variants;barkCanvas.height=leafCanvas.height=tileH;
      const wood=barkCanvas.getContext('2d'),leaf=leafCanvas.getContext('2d');
      for(let variant=0;variant<variants;variant++)makeTree(wood,leaf,kind,variant);
      const bark=new THREE.CanvasTexture(barkCanvas),leaves=new THREE.CanvasTexture(leafCanvas);
      for(const texture of [bark,leaves]){texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.flipY=true}
      result.push({bark,leaves});
    }
    return result;
  }
  window.TREE_ART={atlases,variantCount:variants,kindCount:kinds};
})();
