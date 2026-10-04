// Niinimäki YVA 18.2.2025 §4.1.3 and Traficom guidance 7.9.2020:
// day 100,000 cd white B; twilight 20,000 cd white B; night permits
// 2,000 cd white B, red B or steady red C. This demo offers red B/C,
// not a confirmed project permit. Intermediate steady red B lights <=52 m apart.
// Display point sizes/brightness are illustrative, not a photometric cd simulation.
window.createObstructionLights=function(scene,turbines,renderer){
 const levels=[45,90,135],roofPositions=new Float32Array(turbines.length*2*3),towerPositions=new Float32Array(turbines.length*levels.length*4*3);
 let mode='day',phase=1,nightFlashing=false,lastSeconds=0;
 function makeLights(positions,size){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const material=new THREE.ShaderMaterial({
   uniforms:{lightColor:{value:new THREE.Color(0xffffff)},brightness:{value:1},glowScale:{value:1.8},glowStrength:{value:.5},pointSize:{value:size},minPointSize:{value:size>4?2.4:1.8},pixelRatio:{value:renderer.getPixelRatio()}},
   vertexShader:'uniform float glowScale;uniform float pointSize;uniform float minPointSize;uniform float pixelRatio;varying float vDistance;void main(){vec4 view=viewMatrix*modelMatrix*vec4(position,1.0);vDistance=length(view.xyz);gl_Position=projectionMatrix*view;gl_PointSize=glowScale*pixelRatio*clamp(pointSize*sqrt(1800.0/max(vDistance,1.0)),minPointSize,pointSize*1.9);}',
   // A stronger night-time additive halo inside each existing point sprite. The bright core
   // stays compact; no full-screen bloom pass or extra light/shadow draw is needed.
   fragmentShader:'uniform vec3 lightColor;uniform float brightness;uniform float glowScale;uniform float glowStrength;varying float vDistance;void main(){float r=length(gl_PointCoord-vec2(0.5))*2.0;if(r>1.0)discard;float core=1.0-smoothstep(0.03,0.648/glowScale,r);float halo=(exp(-r*r*5.0)*0.65+exp(-r*r*2.0)*0.20)*glowStrength*(1.0-smoothstep(0.65,1.0,r));float alpha=min(1.0,(core+halo)*brightness*exp(-vDistance/40000.0));vec3 color=mix(lightColor,vec3(1.0),core*0.48);gl_FragColor=vec4(color,alpha);}',
   transparent:true,blending:THREE.AdditiveBlending,depthTest:true,depthWrite:false,toneMapped:false
  });
  const points=new THREE.Points(geometry,material);points.frustumCulled=false;points.renderOrder=2;scene.add(points);return points;
 }
 const roof=makeLights(roofPositions,7.4),tower=makeLights(towerPositions,3.6),point=new THREE.Vector3();
 roof.name='Lentoestevalot: konehuoneet';tower.name='Lentoestevalot: tornien välitasot';
 function updatePlacement(){
  let r=0,k=0;
  for(const {group} of turbines){
   group.updateMatrixWorld(true);
   for(const x of [-5,5]){point.set(x,185,-3).applyMatrix4(group.matrixWorld);point.toArray(roofPositions,r);r+=3;}
   for(const y of levels){const radius=6.5-(6.5-2.2)*y/180+.35;for(let i=0;i<4;i++){const angle=(i+.5)*Math.PI/2;point.set(Math.cos(angle)*radius,y,Math.sin(angle)*radius).applyMatrix4(group.matrixWorld);point.toArray(towerPositions,k);k+=3;}}
  }
  roof.geometry.attributes.position.needsUpdate=true;tower.geometry.attributes.position.needsUpdate=true;
 }
 function setSunAltitude(altitude){
  // Solar altitude is only an approximation to the permit's ambient-light switching.
  mode=altitude>=0?'day':altitude>-Math.PI/30?'twilight':'night';
  roof.material.uniforms.lightColor.value.set(mode==='night'?0xff2a1b:0xffffff);
  roof.material.uniforms.pointSize.value=mode==='day'?7.4:mode==='twilight'?6.9:6.6;
  tower.material.uniforms.lightColor.value.set(0xff2416);
  // Widen the soft red halo at night, keeping the physical-looking core compact.
  for(const lights of [roof,tower]){lights.material.uniforms.glowScale.value=mode==='night'?2.6:mode==='twilight'?2.2:1.8;lights.material.uniforms.glowStrength.value=mode==='night'?1.15:mode==='twilight'?.8:.5;}
  setPhase(phase);
 }
 function setPhase(value){phase=value;roof.visible=phase===1;tower.visible=phase===1&&mode!=='day';}
 function setNightFlashing(value){nightFlashing=Boolean(value);update(lastSeconds)}
 function update(seconds){
  lastSeconds=seconds;
  // 50 flashes/minute, synchronous across all nine turbines. Use elapsed real time,
  // so pausing/speeding up the landscape clock or stopping rotors changes no cadence.
  const pulse=(seconds%1.2)<.16?1:0;
  roof.material.uniforms.brightness.value=1.25*(mode==='night'&&!nightFlashing?1:pulse);
  tower.material.uniforms.brightness.value=1;
  const ratio=renderer.getPixelRatio();roof.material.uniforms.pixelRatio.value=ratio;tower.material.uniforms.pixelRatio.value=ratio;
  setPhase(phase);
 }
 updatePlacement();return{setSunAltitude,setPhase,setNightFlashing,updatePlacement,update,roof,tower,get mode(){return mode},get nightFlashing(){return nightFlashing}};
};
