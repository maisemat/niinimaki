const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(require.resolve('../assets/audio.js'),'utf8'),context);
const shape=context.window.WIND_AUDIO_SHAPE;
for(const phase of [0,.12,.47,.77]){
 const original=shape.envelope(phase,6,-.045);
 assert.ok(Math.abs(shape.splitEnvelope(phase,6,-.045,1,1)-original)<1e-12,'default dev mix must preserve the original sound');
}
assert.ok(Math.abs(shape.splitEnvelope(0,6,0,1,0)-shape.splitEnvelope(.5,6,0,1,0))<1e-12,'steady control should remove blade pulses');
assert.ok(Math.abs(shape.advanceCycle(2.98,2.98,.02,1)-3.02)<1e-12,'normal rotor cycle must pass seamlessly through wrap');
assert.ok(Math.abs(shape.advanceCycle(2.98,2.98,.02,2)-3.06)<1e-12,'speed control must double the swish rate without a wrap jump');
assert.equal(shape.advanceCycle(.02,3.06,.02,.5),3.06,'moving the speed slider must not jump the sound phase');

for(const depth of [1,3,5,7]){
 let power=0,min=Infinity,max=0;
 for(let i=0;i<10000;i++){
  const gain=shape.envelope(i/10000,depth);
  power+=gain*gain/10000;
  min=Math.min(min,gain);max=Math.max(max,gain);
 }
 assert.ok(Math.abs(power-1)<.002,`AM changed average power at ${depth} dB`);
 assert.ok(Math.abs(20*Math.log10(max/min)-depth)<.01,'AM depth is wrong');
}

const model=require('../assets/acoustics.js');
const receiver=model.evaluate({observer:{e:2000,n:0,height:1.7},turbines:[{e:0,n:0}],terrain:()=>0,windFrom:270,windSpeed:8}).sources[0];
const rendered=shape.audibleBands(receiver.bands,model.aWeight);
const lowOne=shape.parkLowRms([receiver],model.aWeight,.07,60);
const lowTwo=shape.parkLowRms([receiver,receiver],model.aWeight,.07,60);
assert.ok(Math.abs(lowTwo/lowOne-Math.SQRT2)<1e-12,'whole-park low layer should sum turbine energies into one voice');
const sumDb=bands=>10*Math.log10(bands.reduce((power,db)=>power+10**(db/10),0));
assert.ok(Math.abs(sumDb(rendered)-receiver.level)<1e-9,'auralization changed predicted mean level');
assert.ok(rendered[0]<rendered[2],'distant 63 Hz bass dominates the audible 250 Hz band');
assert.ok(shape.modulationDepth(250,2000)>shape.modulationDepth(63,2000));
assert.ok(rendered[2]-rendered[4]>10,'steady 1 kHz hiss is too prominent beside the 250 Hz swish');
assert.ok(shape.modulationDepth(250,2000)>6,'low-mid blade swish should stand out from the bed');
assert.ok(shape.modulationDepth(63,1500)>4,'the low wroom should follow blade passes');
assert.ok(shape.bandFilter(63).q>2,'low wroom must be resonant rather than plain broadband noise');
assert.notEqual(shape.filterFrequency(63,.04,0),shape.filterFrequency(63,.04,8),'nine turbines should not share one fixed low note');
assert.ok(shape.bandTiming(500)>shape.bandTiming(250)&&shape.bandTiming(250)>shape.bandTiming(125),'swish colour must travel from higher to lower bands');
assert.notEqual(shape.filterFrequency(250,.04),shape.filterFrequency(250,.96),'low-mid filter should move through each blade pass');
assert.equal(new Set(Array.from({length:9},(_,i)=>shape.bladePassHz(8,i))).size,9);
assert.equal(shape.rotorAngularSpeed(2,0),0);
assert.ok(Math.abs(shape.rotorAngularSpeed(8,4)*3/(2*Math.PI)-shape.bladePassHz(8,4))<1e-12);
const cycle=shape.bladeCycle(.4,1200,8,4);
assert.ok(Math.abs(shape.bladeCycle(.4+2*Math.PI/3,1200,8,4)-cycle-1)<1e-12,'one blade passage must be one sound cycle');
assert.ok(Math.abs(shape.bladeCycle(.4+shape.rotorAngularSpeed(8,4),1200,8,4)-cycle-shape.bladePassHz(8,4))<1e-12,'sound rate must follow rotor speed');
const profile=model.evaluate({observer:{e:1000,n:0,height:1.7},turbines:[{e:0,n:0}],terrain:e=>e>450&&e<550?80:0,windSpeed:8,bladeDetail:true}).sources[0];
assert.ok(profile.bladeHeightDb.lower[2]<profile.bladeHeightDb.upper[2]-1,'lower blade should be more screened behind the ridge');
const moving=shape.movingBladeTable(6,0,profile,2,shape.bladePassHz(8,0));
const flat=shape.movingBladeTable(6,0,null,2,shape.bladePassHz(8,0));
let movingPower=0,shapeDifference=0;
let previousDifference=0;
for(let i=0;i<2000;i++){
 const time=i/2000,a=shape.sampleMovingBlade(moving,time),b=shape.sampleMovingBlade(flat,time);
 movingPower+=a*a/2000;shapeDifference+=Math.abs(a-b)/2000;
 previousDifference+=Math.abs(a-shape.envelope(time,6))/2000;
}
assert.ok(Math.abs(movingPower-1)<.005,'moving blades must preserve the predicted mean acoustic energy');
assert.ok(shapeDifference>.01,'source-height propagation should alter the swish shape');
assert.ok(previousDifference>.01,'moving-blade synthesis should differ from the old hub-height envelope');
assert.ok(Math.abs(shape.sampleMovingBlade(moving,0)-shape.sampleMovingBlade(moving,1))<1e-10,'blade-pass waveform must wrap seamlessly');
assert.equal(shape.distanceGainDb(shape.defaultDistanceCurves.steady,3000),0);
assert.equal(shape.distanceGainDb(shape.defaultDistanceCurves.swoosh,3000),4);
assert.equal(shape.distanceGainDb(shape.defaultDistanceCurves.swoosh,2250),3,'distance gain must interpolate between knots');
assert.equal(shape.distanceGainDb(shape.defaultDistanceCurves.swoosh,20000),7,'distance gain must hold its far endpoint');
context.document={getElementById:()=>({addEventListener(){}})};
const audio=context.window.createWindAudio([{e:0,n:0}]);
assert.equal(audio.getModel,undefined,'old sound-model selection must be removed');
assert.equal(audio.distanceCurves.swoosh[4],6,'the distant swish preset must be present');
audio.setDistanceCurves({swoosh:[0,1,2,3,4,5]});
assert.equal(audio.distanceCurves.swoosh[3],3);
audio.setDistanceCurves({swoosh:[1,2]});
assert.equal(audio.distanceCurves.swoosh[3],3,'incomplete curves must be ignored');
audio.setDistanceCurves({swoosh:[0,1,2,3,4,100]});
assert.equal(audio.distanceCurves.swoosh[5],18,'curve edits must be bounded');
console.log('Audio auralization checks passed');
