// Public, preprocessed MML KM2 elevation tiles. No API key is shipped to users.
window.MML_DEM=(()=>{
 const eMin=335000,nMax=6775000,tileSize=2000,tileSamples=1000,tilesX=12,tilesY=13;
 const cache=new Map(),pending=new Map();let overview=null,onTileLoaded=()=>{};
 async function decode(url){const response=await fetch(url);if(!response.ok)throw new Error(`Korkeusruutu ${response.status}`);const stream=response.body.pipeThrough(new DecompressionStream('gzip'));return new Int16Array(await new Response(stream).arrayBuffer())}
 const ready=decode('assets/mml-dem/overview.bin.gz').then(data=>{if(data.length!==1500*1625)throw new Error('Virheellinen MML-yleisruutu');overview=data;return true}).catch(error=>{console.warn('MML-korkeusdata ei latautunut',error);return false});
 function bilinear(data,cols,rows,x,y){if(x<0||y<0||x>cols-1||y>rows-1)return NaN;const i=Math.min(cols-2,Math.floor(x)),j=Math.min(rows-2,Math.floor(y)),u=x-i,v=y-j,k=j*cols+i;return ((data[k]*(1-u)+data[k+1]*u)*(1-v)+(data[k+cols]*(1-u)+data[k+cols+1]*u)*v)/10}
 function sampleOverview(e,n){return overview?bilinear(overview,1500,1625,(e-eMin-1)/16,(nMax-n-1)/16):NaN}
 function tileKey(e,n){const x=Math.floor((e-eMin)/tileSize),y=Math.floor((nMax-n)/tileSize);return x>=0&&x<tilesX&&y>=0&&y<tilesY?`${x}-${y}`:null}
 function sampleFine(e,n){const key=tileKey(e,n),tile=key&&cache.get(key);if(!tile)return NaN;const [x,y]=key.split('-').map(Number);return bilinear(tile,tileSamples,tileSamples,(e-eMin-x*tileSize-1)/2,(nMax-y*tileSize-n-1)/2)}
 function requestTile(x,y){const key=`${x}-${y}`;if(cache.has(key)||pending.has(key))return;const promise=decode(`assets/mml-dem/${key}.bin.gz`).then(data=>{
  if(data.length!==tileSamples*tileSamples)throw new Error('Virheellinen MML-ruutu');
  cache.set(key,data);while(cache.size>24)cache.delete(cache.keys().next().value);
  pending.delete(key);onTileLoaded(key);
 }).catch(error=>{pending.delete(key);console.warn('MML-ruutu jäi lataamatta',key,error)});pending.set(key,promise)}
 function requestAround(e,n,radius){if(radius<=0)return;const x0=Math.max(0,Math.floor((e-eMin-radius)/tileSize)),x1=Math.min(tilesX-1,Math.floor((e-eMin+radius)/tileSize)),y0=Math.max(0,Math.floor((nMax-n-radius)/tileSize)),y1=Math.min(tilesY-1,Math.floor((nMax-n+radius)/tileSize)),list=[];
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const de=Math.max(0,Math.abs(e-(eMin+(x+.5)*tileSize))-tileSize/2),dn=Math.max(0,Math.abs(n-(nMax-(y+.5)*tileSize))-tileSize/2);if(Math.hypot(de,dn)<radius)list.push({x,y,d:de*de+dn*dn})}
  list.sort((a,b)=>a.d-b.d);for(const tile of list)requestTile(tile.x,tile.y)
 }
 return{ready,sampleOverview,sampleFine,requestAround,set onTileLoaded(fn){onTileLoaded=fn}};
})();
