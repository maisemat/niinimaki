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
 // A compact moving-blade approximation: three blades, each represented by
 // three radial sections. Every section receives its own source-height path
 // response and first-order travel-time offset. The Gaussian directivity
 // pulse remains illustrative because V172 blade aerodynamics are unpublished.
 function movingBladePower(cycle,depthDb,offset,lowerDb,upperDb,lowerDistance,upperDistance,passHz){
  const radial=[.68,.84,1],weight=[.2,.35,.45];
  let power=0;
  for(let blade=0;blade<3;blade++)for(let segment=0;segment<3;segment++){
   const height=radial[segment]*Math.cos(2*Math.PI*(cycle+blade)/3);
   const deltaDb=height<0?-height*lowerDb:height*upperDb;
   const distance=height<0?-height*lowerDistance:height*upperDistance;
   const delayed=cycle-distance/343*passHz;
   const gain=envelope(delayed,depthDb,offset);
   power+=weight[segment]*10**(deltaDb/10)*gain*gain/3;
  }
  return power;
 }
 function movingBladeTable(depthDb,offset,profile,band,passHz){
  const count=72,values=new Float32Array(count);
  const lower=profile?.bladeHeightDb?.lower?.[band]||0,upper=profile?.bladeHeightDb?.upper?.[band]||0;
  const lowDistance=profile?.bladePathDistance?.lower||0,highDistance=profile?.bladePathDistance?.upper||0;
  let meanPower=0;
  for(let i=0;i<count;i++){
   const power=movingBladePower(i/count,depthDb,offset,lower,upper,lowDistance,highDistance,passHz);
   values[i]=Math.sqrt(power);meanPower+=power/count;
  }
  const norm=Math.sqrt(Math.max(1e-9,meanPower));let minimum=Infinity;
  for(let i=0;i<count;i++){values[i]/=norm;minimum=Math.min(minimum,values[i])}
  return{values,minimum};
 }
 function sampleMovingBlade(table,cycle){
  const position=(((cycle%1)+1)%1)*table.values.length,index=Math.floor(position),fraction=position-index;
  return table.values[index]*(1-fraction)+table.values[(index+1)%table.values.length]*fraction;
 }
 function audibleBands(bands,aWeight){
  // Full inverse A-weighting made uncalibrated headphones reproduce distant
  // 63/125 Hz bands far too prominently. Retain a little bass colour, then
  // preserve the selected band proportions. The FULL mix is normalized below
  // using actual A-weighted filter energy, including the low recording.
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
 function advanceCycle(previousPhysical,audioCycle,physicalCycle,speed){
  if(previousPhysical===null)return physicalCycle;
  const delta=physicalCycle-previousPhysical;
  return audioCycle+(delta-Math.round(delta))*speed;
 }
 // Listening-only offsets applied after the propagation estimate. Knots are
 // denser near a turbine and are interpolated in physical distance.
 const curveDistances=[0,500,1500,3000,6000,12000];
 const defaultDistanceCurves=Object.freeze({steady:Object.freeze([0,0,-8,-9,-6,0]),swoosh:Object.freeze([0,3,6,6,14,18]),recording:Object.freeze([0,0,3,4,7,12])});
 const publicationProfile=Object.freeze({tuning:Object.freeze({steadyDb:8,steadyLowpassHz:7260,steadyLowpassQ:.43,swooshDb:12,swooshTone:.7,swooshSpeed:.5,swooshLowpassHz:372,lowMix:.8,lowDb:4}),curves:defaultDistanceCurves});
 function distanceGainDb(values,distance){
  const d=clamp(Number.isFinite(distance)?distance:0,0,curveDistances.at(-1));
  for(let i=1;i<curveDistances.length;i++)if(d<=curveDistances[i]){
   const fraction=(d-curveDistances[i-1])/(curveDistances[i]-curveDistances[i-1]);
   return values[i-1]+(values[i]-values[i-1])*fraction;
  }
  return values.at(-1);
 }
 return{envelope,splitEnvelope,parkLowRms,advanceCycle,bladePassHz,rotorAngularSpeed,bladeCycle,modulationDepth,bandTiming,bandFilter,filterFrequency,audibleBands,movingBladeTable,sampleMovingBlade,curveDistances,defaultDistanceCurves,publicationProfile,distanceGainDb};
})();
window.WIND_AUDIO_SHAPE=WIND_AUDIO_SHAPE;
window.createWindAudio=function(turbines){
 const shape=WIND_AUDIO_SHAPE,levels=window.WIND_AUDIO_LEVELS,acoustics=window.WIND_ACOUSTICS,profile=shape.publicationProfile,tuning=profile.tuning;
 const referenceRms=.07,referenceDb=60;
 let context=null,voices=[],ambient=null,calibration=null,turbineMix=null;
 let turbinesPlaying=false,turbinesPending=false,turbineRequest=0,ambientPlaying=false,lastUpdate=-Infinity;
 let parkLow=null,speechBuffer=null,speech=null,speechScale=1,speechPlaying=false,speechPending=false,speechRequest=0;
 let lastResult=null,lastRecording=null,plan=null;
 const button=document.getElementById('audioToggle'),ambientButton=document.getElementById('ambientToggle'),speechButton=document.getElementById('speechToggle');
 function create(){
  const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)throw Error('Selain ei tue Web Audioa');context=new AudioContext();
  const length=context.sampleRate*4,buffer=context.createBuffer(1,length,context.sampleRate),samples=buffer.getChannelData(0);let state=0x5ead123,pink=0;
  for(let i=0;i<length;i++){state=(Math.imul(state,1664525)+1013904223)>>>0;const white=state/2147483648-1;pink=.965*pink+.035*white;samples[i]=Math.max(-1,Math.min(1,.4*white+1.65*pink))}
  // Calibrate the actual filter responses, including covariance between bands
  // sharing noise and both component lowpasses. No noise-generating work in the render loop.
  calibration=levels.calibrateNoise(samples,context.sampleRate,shape,acoustics.frequencies,tuning,turbines.length);
  const limiter=context.createDynamicsCompressor();limiter.threshold.value=-1;limiter.knee.value=0;limiter.ratio.value=6;limiter.attack.value=.003;limiter.release.value=.25;limiter.connect(context.destination);
  turbineMix=context.createGain();turbineMix.gain.value=0;turbineMix.connect(limiter);
  const ambientMix=context.createGain();ambientMix.gain.value=0;ambientMix.connect(limiter);
  const makeAmbientBand=(frequency,offset)=>{const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();source.buffer=buffer;source.loop=true;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=1.2;gain.gain.value=0;source.connect(filter).connect(gain).connect(ambientMix);source.start(0,offset);return gain};
  ambient={mix:ambientMix,low:makeAmbientBand(500,1.17),leaves:makeAmbientBand(2000,2.39)};
  voices=turbines.map((t,i)=>{
   const source=context.createBufferSource(),pulse=context.createGain(),pan=context.createStereoPanner(),lowpass=context.createBiquadFilter(),steadyLowpass=context.createBiquadFilter(),bands=[],swooshBands=[],filters=[];
   source.buffer=buffer;source.loop=true;pulse.gain.value=0;pulse.connect(pan).connect(turbineMix);
   // Web Audio lowpass Q is expressed in dB; -3.01 dB gives linear Q=1/sqrt(2).
   lowpass.type='lowpass';lowpass.frequency.value=tuning.swooshLowpassHz;lowpass.Q.value=20*Math.log10(Math.SQRT1_2);lowpass.connect(pulse);
   steadyLowpass.type='lowpass';steadyLowpass.frequency.value=tuning.steadyLowpassHz;steadyLowpass.Q.value=20*Math.log10(tuning.steadyLowpassQ);steadyLowpass.connect(pulse);
   for(const frequency of acoustics.frequencies){const filter=context.createBiquadFilter(),gain=context.createGain(),swooshGain=context.createGain(),spec=shape.bandFilter(frequency);filter.type='bandpass';filter.frequency.value=spec.center*(frequency>63&&frequency<=500?tuning.swooshTone:1);filter.Q.value=spec.q;gain.gain.value=0;swooshGain.gain.value=0;source.connect(filter);filter.connect(gain).connect(steadyLowpass);filter.connect(swooshGain).connect(lowpass);bands.push(gain);swooshBands.push(swooshGain);filters.push(filter)}
   source.start(0,i*.347);return{source,pulse,pan,bands,swooshBands,filters,t,lastPhysicalCycle:null,audioCycle:0};
  });
 }
 async function loadParkLow(){
  if(parkLow)return;try{
   const response=await fetch('assets/myl13-low.mp3?v=2');if(!response.ok)throw Error('Matalan äänen lataus epäonnistui');
   const buffer=await context.decodeAudioData(await response.arrayBuffer()),channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
   let sum=0,count=0;for(const data of channels)for(const x of data){sum+=x*x;count++}const rawRms=Math.sqrt(sum/count);if(!(rawRms>.00001))throw Error('Matalan äänen aineisto on tyhjä');
   const weightedPower=levels.filteredPower(levels.spectrum(channels,context.sampleRate),'lowpass',tuning.swooshLowpassHz,Math.SQRT1_2,context.sampleRate);
   const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.frequency.value=tuning.swooshLowpassHz;filter.Q.value=20*Math.log10(Math.SQRT1_2);gain.gain.value=0;source.connect(filter).connect(gain).connect(turbineMix);source.start();
   parkLow={source,filter,gain,rawRms,weightedPower};lastRecording=null;
  }catch(error){console.warn('Matalan äänen aineisto ei latautunut; synteesin kokonaistaso säilyy samana.',error)}
 }
 function stopSpeech(){speechRequest++;speechPending=false;speechPlaying=false;if(speech){const now=context.currentTime;speech.gain.gain.cancelScheduledValues(now);speech.gain.gain.setTargetAtTime(0,now,.035);speech.source.stop(now+.18);speech=null}speechButton.textContent='▶ 1 Puhe';speechButton.setAttribute('aria-pressed','false')}
 function stopTurbines(){turbineRequest++;turbinesPlaying=false;turbinesPending=false;if(context)turbineMix.gain.setTargetAtTime(0,context.currentTime,.06);button.textContent='▶ 3 Voimalat';button.setAttribute('aria-pressed','false')}
 function stopAmbient(){ambientPlaying=false;if(context)ambient.mix.gain.setTargetAtTime(0,context.currentTime,.12);ambientButton.textContent='▶ 2 Maisema';ambientButton.setAttribute('aria-pressed','false')}
 async function toggleSpeech(){
  if(speechPlaying||speechPending){stopSpeech();return}try{
   if(!context)create();stopTurbines();stopAmbient();const request=++speechRequest;speechPending=true;speechButton.textContent='Ladataan puhe…';await context.resume();
   if(!speechBuffer){const response=await fetch('assets/puhevertailu.mp3?v=1');if(!response.ok)throw Error('Puhevertailu ei latautunut');speechBuffer=await context.decodeAudioData(await response.arrayBuffer());const channels=Array.from({length:speechBuffer.numberOfChannels},(_,i)=>speechBuffer.getChannelData(i)),power=levels.spectrum(channels,context.sampleRate,true).reduce((sum,bin)=>sum+bin.aPower,0);speechScale=referenceRms/Math.sqrt(Math.max(1e-12,power))}
   if(request!==speechRequest)return;const source=context.createBufferSource(),gain=context.createGain();source.buffer=speechBuffer;source.loop=true;gain.gain.value=0;source.connect(gain).connect(context.destination);source.start();gain.gain.setTargetAtTime(speechScale,context.currentTime,.05);speech={source,gain};speechPending=false;speechPlaying=true;speechButton.textContent='■ 1 Puhe';speechButton.setAttribute('aria-pressed','true');
  }catch(error){stopSpeech();speechButton.textContent='Puhe ei käytettävissä';speechButton.title=error.message}
 }
 async function toggleTurbines(){
  if(turbinesPlaying||turbinesPending){stopTurbines();return}try{
   if(!context)create();stopSpeech();const request=++turbineRequest;turbinesPending=true;button.textContent='Ladataan ääni…';await context.resume();await loadParkLow();
   if(request!==turbineRequest)return;turbinesPlaying=true;turbinesPending=false;lastUpdate=-Infinity;button.textContent='■ 3 Voimalat';button.setAttribute('aria-pressed','true');
  }catch(error){stopTurbines();button.textContent='Ääni ei käytettävissä';button.title=error.message}
 }
 async function toggleAmbient(){
  try{if(!context)create();if(ambientPlaying){stopAmbient();return}stopSpeech();await context.resume();ambientPlaying=true;ambientButton.textContent='■ 2 Maisema';ambientButton.setAttribute('aria-pressed','true')}catch(error){stopAmbient();ambientButton.textContent='Tausta ei käytettävissä';ambientButton.title=error.message}
 }
 function update(result,observer,yaw,windSpeed,phase,environment={},rotors=[]){
  if((!turbinesPlaying&&!ambientPlaying)||!context||performance.now()-lastUpdate<45)return;lastUpdate=performance.now();const now=context.currentTime;
  const forest=Math.min(1,Math.max(0,(environment.canopyHeight||0)/15));
  // The previous rural-background waveform is trimmed by 3 dB, AFTER its
  // existing gain ceiling, so the reduction also holds in strong wind.
  // It is a separate listening reference, never included in the turbine HUD.
  const backgroundDb=18+Math.min(16,windSpeed*1.4)+forest*Math.min(5,windSpeed*.8)+(environment.nearWater?3:0),backgroundRms=referenceRms*10**((backgroundDb-referenceDb)/20),ambientTrim=10**(-3/20);
  ambient.low.gain.setTargetAtTime(Math.min(.12,backgroundRms/calibration.ambientRms[0]*.7)*ambientTrim,now,.18);ambient.leaves.gain.setTargetAtTime(Math.min(.12,backgroundRms/calibration.ambientRms[1]*(forest?.78:.44))*ambientTrim,now,.18);ambient.mix.gain.setTargetAtTime(ambientPlaying?1:0,now,.12);
  if(!turbinesPlaying)return;
  if(lastResult!==result||lastRecording!==parkLow){plan=levels.buildPlan(result,turbines,windSpeed,environment.windFrom??270,calibration,parkLow,shape,acoustics,profile);lastResult=result;lastRecording=parkLow}
  turbineMix.gain.setTargetAtTime(phase&&windSpeed>=3?plan.normalization:0,now,.08);
  if(parkLow)parkLow.gain.gain.setTargetAtTime(plan.recordingGain/Math.max(1e-30,plan.normalization),now,.08);
  for(let i=0;i<voices.length;i++){
   const voice=voices[i],source=result.sources[i],mix=plan.voices[i];if(!source||!mix||!phase||windSpeed<3){voice.pulse.gain.setTargetAtTime(0,now,.035);voice.lastPhysicalCycle=null;continue}
   const physicalCycle=shape.bladeCycle(rotors[i]?.rotor.rotation.z||0,source.distance,windSpeed,i);voice.audioCycle=shape.advanceCycle(voice.lastPhysicalCycle,voice.audioCycle,physicalCycle,tuning.swooshSpeed);voice.lastPhysicalCycle=physicalCycle;const cycle=voice.audioCycle;
   for(let b=0;b<voice.bands.length;b++){
    const frequency=acoustics.frequencies[b],table=mix.tables[b],current=shape.sampleMovingBlade(table,cycle);
    voice.bands[b].gain.setTargetAtTime(mix.steady[b],now,.025);voice.swooshBands[b].gain.setTargetAtTime(mix.amplitudes[b]*Math.max(0,current-table.minimum)*mix.swooshGain,now,.025);
    voice.filters[b].frequency.setTargetAtTime(Math.min(context.sampleRate*.42,shape.filterFrequency(frequency,cycle,i)*(frequency>63&&frequency<=500?tuning.swooshTone:1)),now,.035);
   }
   // Equal-power stereo panning halves each ear's mean power at centre.
   // sqrt(2) keeps the binaural mean on the SAME scale as the mono speech.
   voice.pulse.gain.setTargetAtTime(Math.SQRT2,now,.06);
   const bearing=Math.atan2(voice.t.e-observer.e,voice.t.n-observer.n);voice.pan.pan.setTargetAtTime(Math.max(-.9,Math.min(.9,Math.sin(bearing-yaw))),now,.07);
  }
 }
 button.addEventListener('click',toggleTurbines);ambientButton.addEventListener('click',toggleAmbient);speechButton.addEventListener('click',toggleSpeech);
 // No mutable tuning API or saved experimental overrides in the publication.
 // All layers are normalized to this target even if the optional file fails.
 return Object.freeze({update,isPlaying(){return turbinesPlaying},estimateLevel(result){return result.level}});
};
