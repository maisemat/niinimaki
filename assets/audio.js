// Opt-in synthetic listening aid. Digital levels are relative to the speech
// sample, not calibrated SPL at the listener's ears.
const WIND_AUDIO_SHAPE=(()=>{
 const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
 // A rounded blade-pass swish. Each octave can lead or trail it slightly,
 // producing a moving low-mid colour instead of a single volume pulse.
 // Its RMS is normalized so stronger swishes do not raise the mean level.
 const width=.105,samples=512;
 let mean=0,meanSquare=0;
 for(let i=0;i<samples;i++){
  const distance=Math.min(i/samples,1-i/samples);
  const pulse=Math.exp(-.5*(distance/width)**2);
  mean+=pulse/samples;meanSquare+=pulse*pulse/samples;
 }
 function envelope(cycle,depthDb,offset=0){
  if(depthDb<=0)return 1;
  const phase=(((cycle+offset)%1)+1)%1;
  const distance=Math.min(phase,1-phase);
  const pulse=Math.exp(-.5*(distance/width)**2);
  const a=10**(depthDb/20)-1;
  return(1+a*pulse)/Math.sqrt(1+2*a*mean+a*a*meanSquare);
 }
 function bladePassHz(windSpeed,index){
  // The project's exact rotor-speed curve is unavailable. This is an
  // illustrative three-blade rhythm, with small independent turbine offsets.
  return clamp(.38+.034*(windSpeed-3),.38,.72)*(1+(index-4)*.008);
 }
 function rotorAngularSpeed(windSpeed,index){
  return windSpeed<3?0:bladePassHz(windSpeed,index)*2*Math.PI/3;
 }
 function bladeCycle(rotorAngle,distance,windSpeed,index){
  return rotorAngle*3/(2*Math.PI)-distance/343*bladePassHz(windSpeed,index);
 }
 function modulationDepth(frequency,distance){
  const far=clamp((distance-350)/1700,0,1);
  if(frequency===63)return 4+far;
  if(frequency===125)return 5.5+far;
  if(frequency===250)return 6.5+far;
  if(frequency===500)return 5.5+far;
  if(frequency===1000)return 2.3;
  if(frequency===2000)return .5;
  return 0;
 }
 function bandTiming(frequency){
  // Brighter edge first, lower-frequency body a moment later. These offsets
  // are sound-design approximations informed by the Humppila reference.
  return frequency===500?.045:frequency===250?0:frequency===125?-.045:frequency===63?-.07:frequency===1000?.06:0;
 }
 function bandFilter(frequency){
  // A broad, ringing low-mid band evokes the intermittent 73-74 Hz feature
  // in the supplied recording. It is intentionally not a fixed pure tone:
  // that feature has not been attributed to the planned V172 turbines.
  return frequency===63?{center:78,q:2.6}:frequency===125?{center:125,q:2.1}:frequency===250?{center:250,q:1.8}:{center:frequency,q:1.2};
 }
 function filterFrequency(frequency,cycle,index=4){
  const center=bandFilter(frequency).center;
  if(frequency!==63&&frequency!==125&&frequency!==250&&frequency!==500)return center;
  const phase=(((cycle%1)+1)%1),distance=Math.min(phase,1-phase);
  const motion=Math.exp(-.5*(distance/.16)**2);
  // A small frequency sweep evokes the reference's hollow, phase-like edge
  // without adding a mechanical tone or a fabricated large comb resonance.
  const variation=frequency===63?.055:.18;
  const detune=frequency===63?(index-4)*1.2:0;
  return(center+detune)*(1+(variation*Math.sin(2*Math.PI*phase))*motion);
 }
 function audibleBands(bands,aWeight){
  // Full inverse A-weighting made uncalibrated headphones reproduce distant
  // 63/125 Hz bands far too prominently. Retain a little bass colour, then
  // normalize the rendered bands to the model's A-weighted energy sum.
  const colour=.2;
  const target=bands.reduce((sum,db)=>sum+10**(db/10),0);
  // In the supplied 32 s Humppila pair the processed file removes mainly
  // high-frequency recording hiss while the 125-500 Hz swish remains. This
  // restrained render EQ is a timbre choice, not a measured V172 spectrum.
  const renderEq=[3,2,0,-2,-7,-9,-11,-11];
  const shaped=bands.map((db,i)=>db-colour*aWeight[i]+renderEq[i]);
  const shapedPower=shaped.reduce((sum,db)=>sum+10**(db/10),0);
  const correction=10*Math.log10(target/shapedPower);
  return shaped.map(db=>db+correction);
 }
 function splitEnvelope(cycle,depth,offset,steady,swoosh){
  const trough=envelope(.5,depth),current=envelope(cycle,depth,offset);
  return trough*steady+Math.max(0,current-trough)*swoosh;
 }
 function parkLowRms(sources,aWeight,referenceRms,referenceDb){
  let power=0;
  for(const source of sources||[]){
   if(!source?.bands)continue;
   const bands=audibleBands(source.bands,aWeight);
   for(let i=0;i<2;i++)power+=10**((bands[i]-referenceDb)/10);
  }
  return referenceRms*Math.sqrt(power);
 }
 return{envelope,splitEnvelope,parkLowRms,bladePassHz,rotorAngularSpeed,bladeCycle,modulationDepth,bandTiming,bandFilter,filterFrequency,audibleBands};
})();
window.WIND_AUDIO_SHAPE=WIND_AUDIO_SHAPE;
window.createWindAudio=function(turbines){
 let context=null,limiter=null,voices=[],turbinesPlaying=false,ambientPlaying=false,lastUpdate=0,bandRms=[],ambient=null;
 let parkLow=null,parkLowPending=false;
 const tuning={steadyDb:0,swooshDb:0,swooshTone:1,lowMix:.55,lowDb:0};
 let speechBuffer=null,speech=null,speechPlaying=false,speechPending=false,speechRequest=0;
 // The active speech in puhevertailu.mp3 is normalized to 0.07 A-weighted
 // digital RMS. Assigning it the illustrative 60 dB(A) conversation anchor
 // lets all modeled bands use the same scale (20 dB = 10x amplitude).
 const referenceRms=.07,referenceDb=60;
 const button=document.getElementById('audioToggle'),ambientButton=document.getElementById('ambientToggle'),speechButton=document.getElementById('speechToggle');
 const speechLabel='▶ 1 Puhe';
 function create(){
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  if(!AudioContext)throw new Error('Selain ei tue Web Audioa');
  context=new AudioContext();
  const length=context.sampleRate*4,buffer=context.createBuffer(1,length,context.sampleRate),samples=buffer.getChannelData(0);
  let state=0x5ead123,pink=0;
  for(let i=0;i<length;i++){
   state=(Math.imul(state,1664525)+1013904223)>>>0;
   const white=state/2147483648-1;
   pink=.965*pink+.035*white;
   const value=Math.max(-1,Math.min(1,.4*white+1.65*pink));samples[i]=value;
  }
  // Normalize filtered bands to a common digital reference so the modeled
  // turbine-to-ambient level difference survives playback on any device.
  bandRms=window.WIND_ACOUSTICS.frequencies.map(frequency=>{
   const spec=WIND_AUDIO_SHAPE.bandFilter(frequency);
   const w=2*Math.PI*Math.min(spec.center,context.sampleRate*.42)/context.sampleRate;
   const alpha=Math.sin(w)/(2*spec.q),a0=1+alpha,b0=alpha/a0,b2=-alpha/a0,a1=-2*Math.cos(w)/a0,a2=(1-alpha)/a0;
   let x1=0,x2=0,y1=0,y2=0,sum=0;
   for(const x of samples){const y=b0*x+b2*x2-a1*y1-a2*y2;x2=x1;x1=x;y2=y1;y1=y;sum+=y*y}
   return Math.max(.001,Math.sqrt(sum/length));
  });
  limiter=context.createDynamicsCompressor();limiter.threshold.value=-1;limiter.knee.value=0;limiter.ratio.value=6;limiter.attack.value=.003;limiter.release.value=.25;limiter.connect(context.destination);
  // Separate, synthetic wind/foliage bed. Its assumed level is illustrative,
  // because no measurement of the local ambient sound is available.
  const ambientMix=context.createGain();ambientMix.gain.value=0;ambientMix.connect(limiter);
  const makeAmbientBand=(frequency,offset)=>{
   const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
   source.buffer=buffer;source.loop=true;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=1.2;gain.gain.value=0;
   source.connect(filter).connect(gain).connect(ambientMix);source.start(0,offset);return gain;
  };
  ambient={mix:ambientMix,low:makeAmbientBand(500,1.17),leaves:makeAmbientBand(2000,2.39)};
  voices=turbines.map((t,i)=>{
   const source=context.createBufferSource(),pulse=context.createGain(),pan=context.createStereoPanner(),bands=[],filters=[];
   source.buffer=buffer;source.loop=true;pulse.gain.value=0;pulse.connect(pan).connect(limiter);
   for(const frequency of window.WIND_ACOUSTICS.frequencies){
    const filter=context.createBiquadFilter(),gain=context.createGain(),spec=WIND_AUDIO_SHAPE.bandFilter(frequency);filter.type='bandpass';filter.frequency.value=Math.min(spec.center,context.sampleRate*.42);filter.Q.value=spec.q;gain.gain.value=0;source.connect(filter).connect(gain).connect(pulse);bands.push(gain);filters.push(filter);
   }
   source.start(0,i*.347);return{source,pulse,pan,bands,filters,t};
  });
 }
 async function loadParkLow(){
  if(parkLow||parkLowPending||!context)return;
  parkLowPending=true;
  try{
   const response=await fetch('assets/myl13-low.mp3?v=2');
   if(!response.ok)throw Error('myl13:n matala osuus ei latautunut');
   const buffer=await context.decodeAudioData(await response.arrayBuffer());
   let power=0,count=0;
   for(let c=0;c<buffer.numberOfChannels;c++){
    const data=buffer.getChannelData(c);for(const value of data)power+=value*value;count+=data.length;
   }
   const rms=Math.sqrt(power/count);
   if(!Number.isFinite(rms)||rms<.00001)throw Error('Äänitteen matala osuus on tyhjä');
   const source=context.createBufferSource(),gain=context.createGain();
   source.buffer=buffer;source.loop=true;gain.gain.value=0;
   source.connect(gain).connect(limiter);source.start();
   parkLow={source,gain,rms};
  }catch(error){console.warn('Matalan äänitteen lataus epäonnistui; käytetään synteesiä.',error)}
  finally{parkLowPending=false}
 }
 function stopSpeech(){
  speechRequest++;speechPending=false;speechPlaying=false;
  if(speech){const now=context.currentTime;speech.gain.gain.cancelScheduledValues(now);speech.gain.gain.setTargetAtTime(0,now,.035);speech.source.stop(now+.18);speech=null}
  speechButton.textContent=speechLabel;speechButton.setAttribute('aria-pressed','false');
 }
 function stopTurbines(){
  turbinesPlaying=false;if(context)for(const voice of voices)voice.pulse.gain.setTargetAtTime(0,context.currentTime,.1);
  if(context&&parkLow)parkLow.gain.gain.setTargetAtTime(0,context.currentTime,.1);
  button.textContent='▶ 3 Voimalat';button.setAttribute('aria-pressed','false');
 }
 function stopAmbient(){
  ambientPlaying=false;if(context&&ambient)ambient.mix.gain.setTargetAtTime(0,context.currentTime,.12);
  ambientButton.textContent='▶ 2 Maisema';ambientButton.setAttribute('aria-pressed','false');
 }
 async function toggleSpeech(){
  if(speechPlaying||speechPending){stopSpeech();return}
  try{
   if(!context)create();stopTurbines();stopAmbient();
   const request=++speechRequest;speechPending=true;speechButton.textContent='Ladataan puhe…';
   await context.resume();
   if(!speechBuffer){const response=await fetch('assets/puhevertailu.mp3?v=1');if(!response.ok)throw Error('Puhevertailu ei latautunut');speechBuffer=await context.decodeAudioData(await response.arrayBuffer())}
   if(request!==speechRequest)return;
   const source=context.createBufferSource(),gain=context.createGain();source.buffer=speechBuffer;source.loop=true;gain.gain.value=0;
   source.connect(gain).connect(context.destination);source.start();gain.gain.setTargetAtTime(1,context.currentTime,.05);
   speech={source,gain};speechPending=false;speechPlaying=true;speechButton.textContent='■ 1 Puhe';speechButton.setAttribute('aria-pressed','true');
  }catch(error){stopSpeech();speechButton.textContent='Puhe ei käytettävissä';speechButton.title=error.message}
 }
 function toggleTurbines(){
  try{
   if(!context)create();
   if(turbinesPlaying)stopTurbines();
   else{stopSpeech();turbinesPlaying=true;button.textContent='■ 3 Voimalat';button.setAttribute('aria-pressed','true');context.resume().then(loadParkLow).catch(error=>{stopTurbines();button.textContent='Ääni ei käytettävissä';button.title=error.message})}
  }catch(error){button.textContent='Ääni ei käytettävissä';button.title=error.message}
 }
 function toggleAmbient(){
  try{
   if(!context)create();
   if(ambientPlaying)stopAmbient();
   else{stopSpeech();ambientPlaying=true;context.resume().catch(error=>{stopAmbient();ambientButton.textContent='Maisema ei käytettävissä';ambientButton.title=error.message});ambientButton.textContent='■ 2 Maisema';ambientButton.setAttribute('aria-pressed','true')}
  }catch(error){ambientButton.textContent='Tausta ei käytettävissä';ambientButton.title=error.message}
 }
 function update(result,observer,yaw,windSpeed,phase,environment={},rotors=[]){
  if((!turbinesPlaying&&!ambientPlaying)||!context||performance.now()-lastUpdate<45)return;
  lastUpdate=performance.now();
  const forest=Math.min(1,Math.max(0,(environment.canopyHeight||0)/15));
  // Quiet rural field studies span very low levels in calm weather and much
  // higher levels with wind in vegetation. This curve is a listening aid,
  // not a measured LA90/LAeq for Niinimäki.
  const backgroundDb=18+Math.min(16,windSpeed*1.4)+forest*Math.min(5,windSpeed*.8)+(environment.nearWater?3:0);
  const backgroundRms=referenceRms*Math.pow(10,(backgroundDb-60)/20);
  ambient.low.gain.setTargetAtTime(Math.min(.12,backgroundRms/bandRms[3]*.7),context.currentTime,.18);
  ambient.leaves.gain.setTargetAtTime(Math.min(.12,backgroundRms/bandRms[5]*(forest?.78:.44)),context.currentTime,.18);
  ambient.mix.gain.setTargetAtTime(ambientPlaying?1:0,context.currentTime,.12);
  const sampleShare=parkLow?Math.max(0,Math.min(1,tuning.lowMix)):0;
  const sampleActive=turbinesPlaying&&phase&&windSpeed>=3&&parkLow;
  if(parkLow){
   const target=sampleActive?WIND_AUDIO_SHAPE.parkLowRms(result.sources,window.WIND_ACOUSTICS.aWeight,referenceRms,referenceDb):0;
   const gain=target*Math.sqrt(sampleShare)*10**(tuning.lowDb/20)/parkLow.rms;
   parkLow.gain.gain.setTargetAtTime(Math.min(.18,Math.max(0,gain)),context.currentTime,.16);
  }
  for(let i=0;i<voices.length;i++){
   const voice=voices[i],source=result.sources[i];
   if(!turbinesPlaying||!source||!phase||windSpeed<3){voice.pulse.gain.setTargetAtTime(0,context.currentTime,.035);continue}
   const de=voice.t.e-observer.e,dn=voice.t.n-observer.n,bearing=Math.atan2(de,dn),relative=bearing-yaw;
   // Follow the actual animated rotor angle. Sound is delayed by the travel
   // time from that turbine to the listener, so the nine swishes do not align.
   const now=context.currentTime;
   const cycle=WIND_AUDIO_SHAPE.bladeCycle(rotors[i]?.rotor.rotation.z||0,source.distance,windSpeed,i);
   const windTo=((environment.windFrom??270)+180)*Math.PI/180;
   const receiverBearing=Math.atan2(observer.e-voice.t.e,observer.n-voice.t.n);
   // Field studies find AM directivity, but its exact curve is turbine- and
   // weather-dependent. Keep this crosswind emphasis deliberately bounded.
   const crosswind=Math.abs(Math.sin(receiverBearing-windTo));
   const depthVariation=(.85+.3*crosswind)*(.9+.1*Math.sin(now*.23+i*1.71));
   const audibleBands=WIND_AUDIO_SHAPE.audibleBands(source.bands,window.WIND_ACOUSTICS.aWeight);
   for(let b=0;b<voice.bands.length;b++){
    const frequency=window.WIND_ACOUSTICS.frequencies[b];
    const depth=WIND_AUDIO_SHAPE.modulationDepth(frequency,source.distance)*depthVariation;
    const shaped=WIND_AUDIO_SHAPE.splitEnvelope(cycle,depth,WIND_AUDIO_SHAPE.bandTiming(frequency),10**(tuning.steadyDb/20),10**(tuning.swooshDb/20));
    // The average digital energy follows the A-weighted propagation result;
    // headphones and the speech reference still do not establish ear SPL.
    const amplitude=referenceRms/bandRms[b]*Math.pow(10,(audibleBands[b]-referenceDb)/20)*shaped*(b<2?Math.sqrt(1-sampleShare):1);
    voice.bands[b].gain.setTargetAtTime(Math.min(.12,Math.max(0,amplitude)),now,.025);
    if(frequency===63||frequency===125||frequency===250||frequency===500)voice.filters[b].frequency.setTargetAtTime(Math.min(context.sampleRate*.42,WIND_AUDIO_SHAPE.filterFrequency(frequency,cycle,i)*(frequency===63?1:tuning.swooshTone)),now,.035);
   }
   voice.pulse.gain.setTargetAtTime(1,now,.06);
   voice.pan.pan.setTargetAtTime(Math.max(-.9,Math.min(.9,Math.sin(relative))),context.currentTime,.07);
  }
 }
 button.addEventListener('click',toggleTurbines);
 ambientButton.addEventListener('click',toggleAmbient);
 speechButton.addEventListener('click',toggleSpeech);
 return{update,tuning,setTuning(patch){for(const key of Object.keys(tuning))if(Number.isFinite(patch[key]))tuning[key]=patch[key]}};
};
