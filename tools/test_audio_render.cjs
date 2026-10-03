// Optional browser integration check: npm package playwright + local Chrome.
// Run with a local static server URL as the first argument. No microphone use.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const url=process.argv[2]||'http://127.0.0.1:8881';
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
  for(const [distance,count] of [[700,1],[1500,9],[6000,9]]){
   const page=await browser.newPage();await page.goto(url+'/assets/');
   await page.setContent('<button id="speechToggle"></button><button id="ambientToggle"></button><button id="audioToggle"></button>');
   for(const name of ['acoustics','audio-levels','audio'])await page.addScriptTag({url:url+'/assets/'+name+'.js'});
   const check=await page.evaluate(async({distance,count})=>{
    let offline,time=0;const filters=[];
    window.AudioContext=function(){offline=new OfflineAudioContext(2,48000*60,48000);const createFilter=offline.createBiquadFilter.bind(offline);offline.createBiquadFilter=()=>{const filter=createFilter();filters.push(filter);return filter};Object.defineProperty(offline,'currentTime',{configurable:true,get:()=>time});offline.resume=async()=>{};return offline};
    Object.defineProperty(performance,'now',{configurable:true,value:()=>time*1000});
    const turbines=Array.from({length:count},(_,i)=>({e:-i*220,n:(i%3)*180})),observer={e:distance,n:0,height:1.7};
    const result=WIND_ACOUSTICS.evaluate({observer,turbines,terrain:()=>0,windSpeed:8,windFrom:270,bladeDetail:true});
    const audio=createWindAudio(turbines);document.getElementById('audioToggle').click();
    // Fetch/decode runs asynchronously, without a hardware audio output.
    for(let i=0;i<1000&&!audio.isPlaying();i++)await new Promise(resolve=>setTimeout(resolve,10));
    if(!audio.isPlaying())throw Error(document.getElementById('audioToggle').title||'Audio did not start');
    const steadyFilters=filters.filter(filter=>filter.type==='lowpass'&&filter.frequency.value===7260);
    if(steadyFilters.length!==count)throw Error('Each turbine needs its own steady-only lowpass');
    for(const filter of steadyFilters){const magnitude=new Float32Array(3),phase=new Float32Array(3);filter.getFrequencyResponse(new Float32Array([1000,7260,16000]),magnitude,phase);if(!(magnitude[0]>.95&&Math.abs(magnitude[1]-.43)<1e-5&&magnitude[2]<.15))throw Error('Native lowpass response must match 7260 Hz / linear Q 0.43');}
    for(time=0;time<60;time+=.05){const rotors=turbines.map((_,i)=>({rotor:{rotation:{z:time*WIND_AUDIO_SHAPE.rotorAngularSpeed(8,i)+i*.43}}}));audio.update(result,observer,0,8,1,{windFrom:270},rotors)}
    delete offline.currentTime;const rendered=await offline.startRendering();
    const channels=Array.from({length:rendered.numberOfChannels},(_,i)=>rendered.getChannelData(i).slice(48000*4));
    const power=WIND_AUDIO_LEVELS.spectrum(channels,48000).reduce((sum,bin)=>sum+bin.aPower,0);
    let peak=0;for(const data of channels)for(const x of data)peak=Math.max(peak,Math.abs(x));
    return{distance,count,target:result.level,rendered:60+10*Math.log10(power/.07**2),peak};
   },{distance,count});
   console.log(check);assert.ok(Math.abs(check.target-check.rendered)<1.0,'actual Web Audio output differs from total target by >1 dB');assert.ok(check.peak<.88,'limiter must not be changing normal listening levels');await page.close();
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
