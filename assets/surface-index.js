// One triangulated surface is shared by rendering, walking, trees and buildings.
(() => {
 function decode(data,Type){const s=atob(data),bytes=new Uint8Array(s.length);for(let i=0;i<s.length;i++)bytes[i]=s.charCodeAt(i);return new Type(bytes.buffer)}
 class SurfaceIndex {
  constructor(positions,indices){this.positions=positions;this.indices=indices;this.cells=new Map();const p=positions;
   for(let k=0;k<indices.length;k+=3){const a=indices[k]*3,b=indices[k+1]*3,c=indices[k+2]*3;
    const x0=Math.floor(Math.min(p[a],p[b],p[c])/100),x1=Math.floor(Math.max(p[a],p[b],p[c])/100),z0=Math.floor(Math.min(p[a+2],p[b+2],p[c+2])/100),z1=Math.floor(Math.max(p[a+2],p[b+2],p[c+2])/100);
    for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){const key=x+z*2048;let cell=this.cells.get(key);if(!cell)this.cells.set(key,cell=[]);cell.push(k)}
   }
  }
  sample(x,z){const candidates=this.cells.get(Math.floor(x/100)+Math.floor(z/100)*2048);if(!candidates)return -Infinity;const p=this.positions,ids=this.indices;
   for(const k of candidates){const a=ids[k]*3,b=ids[k+1]*3,c=ids[k+2]*3,dx1=p[b]-p[a],dz1=p[b+2]-p[a+2],dx2=p[c]-p[a],dz2=p[c+2]-p[a+2],det=dx1*dz2-dz1*dx2;if(Math.abs(det)<1e-10)continue;
    const dx=x-p[a],dz=z-p[a+2],u=(dx*dz2-dz*dx2)/det,v=(dx1*dz-dz1*dx)/det;
    if(u>=-1e-7&&v>=-1e-7&&u+v<=1.0000001)return p[a+1]+u*(p[b+1]-p[a+1])+v*(p[c+1]-p[a+1]);
   }return -Infinity;
  }
 }
 window.HYDRO_SURFACES={decode,SurfaceIndex};
})();
