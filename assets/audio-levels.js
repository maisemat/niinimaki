// Mean A-weighted DIGITAL power for auralization. This does not measure ear SPL.
// The same budget includes every synthetic source and the shared low recording.
(function(root){'use strict';
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function aWeightDb(f){
  if(f<=0)return-Infinity;const f2=f*f;
  return 20*Math.log10(12200**2*f2*f2/((f2+20.6**2)*Math.sqrt((f2+107.7**2)*(f2+737.9**2))*(f2+12200**2)))+2;
 }
 function fft(re,im){
  const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]]}}
  for(let size=2;size<=n;size*=2){const angle=-2*Math.PI/size,wr0=Math.cos(angle),wi0=Math.sin(angle);
   for(let start=0;start<n;start+=size){let wr=1,wi=0;for(let j=0;j<size/2;j++){
    const a=start+j,b=a+size/2,tr=wr*re[b]-wi*im[b],ti=wr*im[b]+wi*re[b];
    re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;const next=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=next;
   }}
  }
 }
 function spectrum(channels,sampleRate,gate=false){
  const size=8192,blocks=[],window=new Float64Array(size);let windowPower=0;
  for(let i=0;i<size;i++){window[i]=.5-.5*Math.cos(2*Math.PI*i/size);windowPower+=window[i]**2/size}
  let maximum=0;for(const data of channels)for(let start=0;start<data.length;start+=size){let power=0;const count=Math.min(size,data.length-start);for(let i=0;i<count;i++)power+=data[start+i]**2;power/=count;maximum=Math.max(maximum,power);blocks.push({data,start,power})}
  const bins=Array.from({length:384},()=>({power:0,aPower:0,frequencySum:0}));let count=0;
  for(const block of blocks){if(gate&&block.power<maximum*.003)continue;
   const re=new Float64Array(size),im=new Float64Array(size);for(let i=0;i<size&&block.start+i<block.data.length;i++)re[i]=block.data[block.start+i]*window[i];fft(re,im);count++;
   for(let i=1;i<=size/2;i++){
    const f=i*sampleRate/size,p=(re[i]**2+im[i]**2)*(i===size/2?1:2)/(size*size*windowPower);
    const index=clamp(Math.floor(Math.log(Math.max(10,f)/10)/Math.log(sampleRate/20)*bins.length),0,bins.length-1),bin=bins[index];
    bin.power+=p;bin.aPower+=p*10**(aWeightDb(f)/10);bin.frequencySum+=p*f;
   }
  }
  return bins.filter(bin=>bin.power>0).map(bin=>({frequency:bin.frequencySum/bin.power,power:bin.power/Math.max(1,count),aPower:bin.aPower/Math.max(1,count)}));
 }
 function response(type,frequency,q,f,sampleRate){
  const w=2*Math.PI*Math.min(frequency,sampleRate*.42)/sampleRate,alpha=Math.sin(w)/(2*q),a0=1+alpha;
  let b0,b1,b2;if(type==='lowpass'){b0=(1-Math.cos(w))/(2*a0);b1=2*b0;b2=b0}else{b0=alpha/a0;b1=0;b2=-b0}
  const a1=-2*Math.cos(w)/a0,a2=(1-alpha)/a0,theta=2*Math.PI*f/sampleRate,c=Math.cos(theta),s=-Math.sin(theta),c2=Math.cos(2*theta),s2=-Math.sin(2*theta);
  const nr=b0+b1*c+b2*c2,ni=b1*s+b2*s2,dr=1+a1*c+a2*c2,di=a1*s+a2*s2,den=dr*dr+di*di;
  return[(nr*dr+ni*di)/den,(ni*dr-nr*di)/den];
 }
 function filteredPower(bins,type,frequency,q,sampleRate,weighted=true){return bins.reduce((sum,bin)=>{const [re,im]=response(type,frequency,q,bin.frequency,sampleRate);return sum+(weighted?bin.aPower:bin.power)*(re*re+im*im)},0)}
 function calibrateNoise(samples,sampleRate,shape,frequencies,tuning,turbineCount){
  const bins=spectrum([samples],sampleRate),phaseCount=72;
  const bandRms=frequencies.map(f=>{const spec=shape.bandFilter(f);return Math.sqrt(filteredPower(bins,'bandpass',spec.center,spec.q,sampleRate,false))});
  const lowpass=bins.map(bin=>response('lowpass',tuning.swooshLowpassHz,Math.SQRT1_2,bin.frequency,sampleRate));
  const steadyLowpass=bins.map(bin=>response('lowpass',tuning.steadyLowpassHz,tuning.steadyLowpassQ,bin.frequency,sampleRate));
  const voices=Array.from({length:turbineCount},(_,index)=>Array.from({length:phaseCount},(_,phase)=>{
   const size=frequencies.length,ss=new Float64Array(size*size),sw=new Float64Array(size*size),ww=new Float64Array(size*size);
   const specs=frequencies.map(f=>({frequency:shape.filterFrequency(f,phase/phaseCount,index)*(f>63&&f<=500?tuning.swooshTone:1),q:shape.bandFilter(f).q}));
   for(let k=0;k<bins.length;k++){
    const bin=bins[k],[lr,li]=lowpass[k],lp=lr*lr+li*li,filters=specs.map(spec=>response('bandpass',spec.frequency,spec.q,bin.frequency,sampleRate));
    const [sr,si]=steadyLowpass[k],sp=sr*sr+si*si,crossRe=sr*lr+si*li,crossIm=si*lr-sr*li;
    for(let i=0;i<size;i++)for(let j=0;j<size;j++){
     const [ir,ii]=filters[i],[jr,ji]=filters[j],re=ir*jr+ii*ji,im=ii*jr-ir*ji,id=i*size+j;
     ss[id]+=bin.aPower*re*sp;sw[id]+=bin.aPower*(re*crossRe-im*crossIm);ww[id]+=bin.aPower*re*lp;
    }
   }
   return{ss,sw,ww};
  }));
  // Keep the previous raw background-band scale: changing its reference by
  // -3 dB then reduces the complete background waveform by exactly -3 dB.
  const ambientRms=[500,2000].map(f=>Math.sqrt(filteredPower(bins,'bandpass',f,1.2,sampleRate,false)));
  return{voices,bandRms,ambientRms,sampleRate};
 }
 function mixedPower(matrix,steady,swoosh){
  let power=0,size=steady.length;for(let i=0;i<size;i++)for(let j=0;j<size;j++){
   const k=i*size+j;power+=steady[i]*steady[j]*matrix.ss[k]+2*steady[i]*swoosh[j]*matrix.sw[k]+swoosh[i]*swoosh[j]*matrix.ww[k];
  }return Math.max(0,power);
 }
 function buildPlan(result,turbines,windSpeed,windFrom,calibration,recording,shape,acoustics,profile){
  const {tuning,curves}=profile,referenceRms=.07,referenceDb=60;
  const targetPower=Number.isFinite(result.level)?referenceRms**2*10**((result.level-referenceDb)/10):0;
  if(!targetPower)return{normalization:0,recordingGain:0,voices:[],targetPower:0,rawPower:0,level:-Infinity};
  let rawPower=0;
  const voices=result.sources.map((source,index)=>{
   const windTo=(windFrom+180)*Math.PI/180,receiverBearing=source.receiverBearing??0;
   const depthVariation=.8+.4*Math.abs(Math.sin(receiverBearing-windTo));
   const tables=acoustics.frequencies.map((frequency,b)=>shape.movingBladeTable(shape.modulationDepth(frequency,source.distance)*depthVariation,shape.bandTiming(frequency),source,b,shape.bladePassHz(windSpeed,index)));
   const bands=shape.audibleBands(source.bands,acoustics.aWeight),steadyGain=10**((tuning.steadyDb+shape.distanceGainDb(curves.steady,source.distance))/20),swooshGain=10**((tuning.swooshDb+shape.distanceGainDb(curves.swoosh,source.distance))/20);
   const amplitudes=bands.map((db,b)=>referenceRms/calibration.bandRms[b]*10**((db-referenceDb)/20));
   const steady=amplitudes.map((a,b)=>a*tables[b].minimum*steadyGain);let meanPower=0;
   const matrices=calibration.voices[index];
   for(let phase=0;phase<matrices.length;phase++){
    const swoosh=amplitudes.map((a,b)=>a*Math.max(0,shape.sampleMovingBlade(tables[b],phase/matrices.length)-tables[b].minimum)*swooshGain);
    meanPower+=mixedPower(matrices[phase],steady,swoosh)/matrices.length;
   }
   rawPower+=meanPower;return{tables,amplitudes,steady,swooshGain,meanPower};
  });
  // This recording is ONE independent whole-park layer. Its original recording
  // level is never interpreted as measured SPL. Its filtered A-weighted energy
  // is part of the same budget as all nine synthetic voices.
  const nearest=Math.min(...result.sources.map(source=>source.distance));
  const rawRecordingGain=recording?shape.parkLowRms(result.sources,acoustics.aWeight,referenceRms,referenceDb)*Math.sqrt(tuning.lowMix)*10**((tuning.lowDb+shape.distanceGainDb(curves.recording,nearest))/20)/recording.rawRms:0;
  const recordingPower=rawRecordingGain**2*(recording?.weightedPower||0);rawPower+=recordingPower;
  const normalization=Math.sqrt(targetPower/Math.max(1e-30,rawPower));
  return{normalization,recordingGain:rawRecordingGain*normalization,voices,targetPower,rawPower,recordingPower,level:result.level};
 }
 const api={aWeightDb,spectrum,response,filteredPower,calibrateNoise,mixedPower,buildPlan};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;root.WIND_AUDIO_LEVELS=api;
})(typeof window!=='undefined'?window:globalThis);
