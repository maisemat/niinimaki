// Opt-in synthetic listening aid. The speech sample and modeled sound share a
// digital A-weighted level scale, not a measured SPL at the listener's ears.
window.createWindAudio=function(turbines){
 let context=null,voices=[],turbinesPlaying=false,ambientPlaying=false,lastUpdate=0,bandRms=[],ambient=null;
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
   const w=2*Math.PI*Math.min(frequency,context.sampleRate*.42)/context.sampleRate;
   const alpha=Math.sin(w)/(2*1.2),a0=1+alpha,b0=alpha/a0,b2=-alpha/a0,a1=-2*Math.cos(w)/a0,a2=(1-alpha)/a0;
   let x1=0,x2=0,y1=0,y2=0,sum=0;
   for(const x of samples){const y=b0*x+b2*x2-a1*y1-a2*y2;x2=x1;x1=x;y2=y1;y1=y;sum+=y*y}
   return Math.max(.001,Math.sqrt(sum/length));
  });
  const limiter=context.createDynamicsCompressor();limiter.threshold.value=-1;limiter.knee.value=0;limiter.ratio.value=6;limiter.attack.value=.003;limiter.release.value=.25;limiter.connect(context.destination);
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
   const source=context.createBufferSource(),pulse=context.createGain(),pan=context.createStereoPanner(),bands=[];
   source.buffer=buffer;source.loop=true;pulse.gain.value=0;pulse.connect(pan).connect(limiter);
   for(const frequency of window.WIND_ACOUSTICS.frequencies){
    const filter=context.createBiquadFilter(),gain=context.createGain();filter.type='bandpass';filter.frequency.value=Math.min(frequency,context.sampleRate*.42);filter.Q.value=1.2;gain.gain.value=0;source.connect(filter).connect(gain).connect(pulse);bands.push(gain);
   }
   source.start(0,i*.347);return{source,pulse,pan,bands,t,phase:i*1.71};
  });
 }
 function stopSpeech(){
  speechRequest++;speechPending=false;speechPlaying=false;
  if(speech){const now=context.currentTime;speech.gain.gain.cancelScheduledValues(now);speech.gain.gain.setTargetAtTime(0,now,.035);speech.source.stop(now+.18);speech=null}
  speechButton.textContent=speechLabel;speechButton.setAttribute('aria-pressed','false');
 }
 function stopTurbines(){
  turbinesPlaying=false;if(context)for(const voice of voices)voice.pulse.gain.setTargetAtTime(0,context.currentTime,.1);
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
   else{stopSpeech();turbinesPlaying=true;button.textContent='■ 3 Voimalat';button.setAttribute('aria-pressed','true');context.resume().catch(error=>{stopTurbines();button.textContent='Ääni ei käytettävissä';button.title=error.message})}
  }catch(error){button.textContent='Ääni ei käytettävissä';button.title=error.message}
 }
 function toggleAmbient(){
  try{
   if(!context)create();
   if(ambientPlaying)stopAmbient();
   else{stopSpeech();ambientPlaying=true;context.resume().catch(error=>{stopAmbient();ambientButton.textContent='Maisema ei käytettävissä';ambientButton.title=error.message});ambientButton.textContent='■ 2 Maisema';ambientButton.setAttribute('aria-pressed','true')}
  }catch(error){ambientButton.textContent='Tausta ei käytettävissä';ambientButton.title=error.message}
 }
 function update(result,observer,yaw,windSpeed,phase,environment={}){
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
  for(let i=0;i<voices.length;i++){
   const voice=voices[i],source=result.sources[i];
   if(!turbinesPlaying||!source||!phase){voice.pulse.gain.setTargetAtTime(0,context.currentTime,.035);continue}
   const de=voice.t.e-observer.e,dn=voice.t.n-observer.n,bearing=Math.atan2(de,dn),relative=bearing-yaw;
   // A-weighted level and headphone output are not interchangeable. Undo
   // A-weighting per band for an indicative timbre, but do not claim SPL.
   for(let b=0;b<voice.bands.length;b++){
    const unweighted=source.bands[b]-window.WIND_ACOUSTICS.aWeight[b];
    // Use the same internal reference as the ambient bed. The listener's
    // headphone setting remains subjective and does not establish ear SPL.
    const amplitude=referenceRms/bandRms[b]*Math.pow(10,(unweighted-referenceDb)/20);
    voice.bands[b].gain.setTargetAtTime(Math.min(.12,Math.max(0,amplitude)),context.currentTime,.09);
   }
   // Blade-pass modulation is a restrained listening cue, not a prediction
   // of the site's eventual amplitude-modulation depth.
   const pulse=1+.10*Math.sin(context.currentTime*(.65+windSpeed*.035)*Math.PI*2+voice.phase);
   voice.pulse.gain.setTargetAtTime(pulse,context.currentTime,.06);
   voice.pan.pan.setTargetAtTime(Math.max(-.9,Math.min(.9,Math.sin(relative))),context.currentTime,.07);
  }
 }
 button.addEventListener('click',toggleTurbines);
 ambientButton.addEventListener('click',toggleAmbient);
 speechButton.addEventListener('click',toggleSpeech);
 return{update};
};
