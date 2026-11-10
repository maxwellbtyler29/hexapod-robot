'use strict';
(()=>{
 const panel=document.createElement('section');panel.className='hardware-controls';panel.hidden=true;
 panel.innerHTML=`<h3>PHYSICAL LEG CONTROL</h3>
 <label>Control mode<select id="hw-mode"><option value="manual">Manual</option><option value="setup">Setup · one servo</option><option value="walk">Walking test</option><option value="crab">Crabwalk · sideways</option></select></label>
 <label><input id="hw-ready" type="checkbox"> Chassis supported, feet clear, battery connected</label>
 <div class="hw-grid"><label>Control target<select id="hw-target">${HexMotion.names.map((n,i)=>`<option value="${i}">${n}</option>`).join('')}<option value="front">Both front legs</option><option value="four">Four front/rear legs</option><option value="six">All six legs</option></select></label>
 <label>Joystick mode<select id="hw-axis"><option value="both">Hip + knee</option><option value="hip">Hip only</option><option value="knee">Knee only</option><option value="foot">Foot only</option></select></label></div>
 <label class="setup-only">Servo joint<select id="hw-joint"><option value="0">Hip</option><option value="1">Knee</option><option value="2">Foot</option></select></label>
 <div class="hw-values"><div><span>HIP / µs</span><b id="hw-hip">Off</b></div><div><span>KNEE / µs</span><b id="hw-knee">Off</b></div><div><span>FOOT / µs</span><b id="hw-foot">Off</b></div></div>
 <label for="hw-speed">Slew speed <output id="hw-speed-value">100 µs/s</output></label><input id="hw-speed" type="range" min="50" max="5000" step="50" value="100">
 <label for="hw-foot-target">Foot extension from enabled pose <output id="hw-foot-value">0 µs</output></label><input id="hw-foot-target" type="range" min="-1000" max="1000" step="1" value="0">
 <p>500–2500 µs firmware ceiling · per-joint limits start at 1000–2000 µs · 50–5000 µs/s. Pulses are commanded, not measured angles. Widen each joint only after checking its mechanical clearance.</p>
 <details class="calibration-tools setup-only"><summary>Joint limits and precise position</summary><p>Select one leg above, then one joint. Change limits while outputs are off. Use a low slew speed and 10–25 µs steps near the mechanical ends.</p>
 <div class="hw-grid"><label>Minimum pulse (µs)<input id="hw-min" type="number" min="500" max="1499" step="1" value="1000"></label>
 <label>Maximum pulse (µs)<input id="hw-max" type="number" min="1501" max="2500" step="1" value="2000"></label>
 <label>Precise target (µs)<input id="hw-pulse" type="number" min="500" max="2500" step="1" value="1500"></label></div>
 <div class="hw-actions"><button id="hw-apply-limits" class="quiet">Save joint limits</button><button id="hw-apply-pulse" class="quiet">Move selected joint</button><button id="hw-minus" class="quiet">−10 µs</button><button id="hw-plus" class="quiet">+10 µs</button></div>
 <p>Stop when motion stalls, strains or approaches a collision. The software cannot detect the physical end stop.</p></details>
 <details class="calibration-tools setup-only"><summary>Calibration backup / import</summary><p>Export the ESP32 settings or paste an existing browser calibration JSON, then import it to the ESP32 with outputs off. Import replaces the current ESP32 settings.</p><textarea id="hw-calibration-json" rows="5" spellcheck="false" aria-label="Calibration JSON"></textarea><div class="hw-actions"><button id="hw-export" class="quiet">Export calibration</button><button id="hw-load-old" class="quiet">Load old browser settings</button><button id="hw-import" class="quiet">Import to ESP32</button></div></details>
 <div class="setup-only setup-controls"><h3>SET UP ONE SERVO</h3><p>Select one leg and joint above. Only that servo will receive a pulse; the other 17 outputs stay off. Save the adjusted pulse as its ready position.</p><div class="hw-actions"><button id="hw-single" class="primary">Center selected servo at 1500 µs</button><button id="hw-save-single" class="quiet">Save this servo position</button></div><p id="hw-single-status">No servo selected.</p><div class="hw-grid"><label>Crab direction for this joint<select id="hw-setup-crab-direction"><option value="0">Left</option><option value="1">Right</option></select></label><label>Crab phase<select id="hw-setup-crab-phase"><option value="0">Planted</option><option value="1">Lifted / swing</option></select></label></div><button id="hw-capture-crab" class="quiet">Copy current pulse into crab draft</button><p>After capturing the three joints for a leg phase, switch outputs off and save that phase in Crabwalk.</p></div>
 <div class="hw-actions manual-only"><button id="hw-center" class="primary">Ready pose & enable</button><button id="hw-calibrate" class="quiet">1500 calibration</button><button id="hw-save" class="quiet">Save ready pose</button></div><div class="hw-actions"><button id="hw-off" class="stop">■ Outputs off</button></div>
 <p id="hw-pose-status"></p><p id="hw-message" role="status">Connected. Outputs off.</p>
 <details><summary>All joint commands / saved ready poses</summary><table class="pose-table"><thead><tr><th>Leg</th><th>Commanded H / K / F</th><th>Saved ready H / K / F</th></tr></thead><tbody id="hw-table"></tbody></table><p>Values are commanded pulses, not measured angles. Calibration center is always 1500 µs; ready poses are saved on the ESP32.</p></details>
 <div class="crab-controls" hidden><h3>CRABWALK · SIDEWAYS</h3><p>First tune and save planted and lifted positions for each leg, separately for left and right. Values are commanded pulses, not measured foot positions.</p><div class="hw-grid"><label>Direction<select id="hw-crab-direction"><option value="0">Left</option><option value="1">Right</option></select></label><label>Phase<select id="hw-crab-phase"><option value="0">Planted</option><option value="1">Lifted / swing</option></select></label><label>Leg<select id="hw-crab-leg">${HexMotion.names.map((n,i)=>`<option value="${i}">${n}</option>`).join('')}</select></label><label>Hip (µs)<input id="hw-crab-hip" type="number" min="500" max="2500" step="1" value="1500"></label><label>Knee (µs)<input id="hw-crab-knee" type="number" min="500" max="2500" step="1" value="1500"></label><label>Foot (µs)<input id="hw-crab-foot" type="number" min="500" max="2500" step="1" value="1500"></label></div><div class="hw-actions"><button id="hw-crab-save" class="quiet">Save leg phase</button><button id="hw-crab-test" class="primary">Test one cycle</button></div><p id="hw-crab-status">0 of 24 leg phases saved. Test one cycle before holding the joystick left or right.</p><p>After a successful one-cycle test, hold left or right on the joystick to repeat. Release finishes the current cycle and returns to ready. Outputs off cancels immediately.</p></div>
 <div class="walk-controls"><h3>WALKING TEST</h3><div class="hw-grid">
 <label>Pattern<select id="hw-gait"><option value="1">Tripod forward</option><option value="-1">Tripod backward</option><option value="0">Step in place</option></select></label>
 <label>Cycles<input id="hw-cycles" type="number" min="1" max="20" value="1"></label>
 <label>Hip step size (µs)<input id="hw-stride" type="number" min="0" max="1000" step="5" value="75"></label>
 <label>Knee lift (µs)<input id="hw-lift" type="number" min="0" max="1000" step="5" value="75"></label>
 <label>Foot extension during lift (µs)<input id="hw-extend" type="number" min="0" max="1000" step="5" value="0"></label></div>
 <label><input id="hw-gait-ready" type="checkbox"> All six saved poses are aligned; step clearance checked on the support</label>
 <div class="hw-actions"><button id="hw-walk" class="primary">Run walking test</button><button id="hw-return" class="quiet">Return to ready pose</button></div>
 <p>Alternates LF/LR/RM and LM/RF/RR. Open-loop stepping test, not a validated floor gait. Uses the speed slider above. Ends holding ready pose; Stop switches outputs off.</p></div>
 <p>Joystick right = hip forward; up = knee lift. Foot-only up extends. Release holds position. Stop removes PWM, not battery power.</p><button id="hw-disconnect" class="quiet">Disconnect</button>`;
 document.querySelector('.viewport').appendChild(panel);
 const cockpit=buildControllerLayout(panel);
 let repeatDrive=false;
 const baseRender=render,baseStop=stop,baseEnable=$('enable').onclick,storeKey='hexapod-ready-poses-v3';
 let saved=Array(18).fill(1500),confirmed=Array(6).fill(false);
 let jointFlags=0,crabPulses=Array(72).fill(1500),crabFlags=0,crabTested=[false,false],singleMode=false,crabRunning=false,crabDrafts=new Map();
 const persist=()=>localStorage.setItem(storeKey,JSON.stringify({version:5,pulses:saved,confirmed,limits:HexMotion.limits,jointFlags,crabPulses,crabFlags}));
 const wifi=location.origin==='http://192.168.4.1',pollDelay=wifi?150:80;
 if(wifi)document.body.classList.add('wifi-device');
 let live=false,armed=false,busy=false,walking=false,gen=0,timer=null,targets=Array(18).fill(1500),footBase=[...targets],lastTick=0,state=null,connecting=false,activeMask=0;
 const mode=()=>$('hw-mode').value;
 const profileIndex=(direction,leg,phase,joint=0)=>(direction*6+leg)*6+phase*3+joint;
 const profileBit=(direction,leg,phase)=>1<<((direction*6+leg)*2+phase);
 const allCrab=direction=>Array.from({length:12},(_,i)=>Boolean(crabFlags&profileBit(direction,Math.floor(i/2),i%2))).every(Boolean);
 async function loadDeviceSettings(){const cal=await link.request('CALDATA'),crab=await link.request('CRABDATA');const limits=cal.centers.map((_,i)=>[cal.minimum[i],cal.maximum[i]]);if(!HexMotion.validLimits(limits))throw Error('Invalid calibration stored on ESP32.');HexMotion.limits=limits;saved=[...cal.centers];jointFlags=cal.confirmed;confirmed=Array.from({length:6},(_,i)=>[0,1,2].every(j=>jointFlags&(1<<(i*3+j))));crabPulses=[...crab.pulses];crabFlags=crab.flags;crabDrafts.clear();crabTested=[false,false];showJoint();showCrab();ui();}
 const selection=()=>HexMotion.mask($('hw-target').value),rate=()=>Number($('hw-speed').value),chosen=()=>HexMotion.legs(selection());
 const jointId=()=>{const leg=Number($('hw-target').value),joint=Number($('hw-joint').value);return Number.isInteger(leg)&&leg>=0&&leg<6?leg*3+joint:-1;};
 function showJoint(){const id=jointId();if(id<0)return;[$('hw-min').value,$('hw-max').value]=HexMotion.limits[id];$('hw-pulse').value=armed&&state?.frame&&state.current[id]?state.current[id]:saved[id];$('hw-single-status').textContent=`${HexMotion.names[Math.floor(id/3)]} ${['hip','knee','foot'][id%3]} · saved ${jointFlags&(1<<id)?saved[id]+' µs':'not yet'}`;}
 function showCrab(){const direction=Number($('hw-crab-direction').value),leg=Number($('hw-crab-leg').value),phase=Number($('hw-crab-phase').value),id=profileIndex(direction,leg,phase),draft=crabDrafts.get(id);for(let j=0;j<3;++j)$(['hw-crab-hip','hw-crab-knee','hw-crab-foot'][j]).value=draft?.[j]??(crabFlags&profileBit(direction,leg,phase)?crabPulses[id+j]:saved[leg*3+j]);$('hw-crab-status').textContent=`${Array.from({length:24},(_,i)=>Boolean(crabFlags&(1<<i))).filter(Boolean).length}/24 leg phases saved. ${allCrab(direction)?'This direction is ready for a one-cycle test.':'Save all 12 phases for this direction.'}`;}
 const hasReady=mask=>HexMotion.legs(mask).every(l=>confirmed[l]);
 function telemetry(s){state=s;if(!s.frame)return;const leg=chosen()[0];['hip','knee','foot'].forEach((n,j)=>$('hw-'+n).textContent=s.current[leg*3+j]||'Off');drawTable();}
 const link=wifi?new SetupWifi(telemetry,e=>{void recoverLink(e);}):new SetupSerial(telemetry,e=>{void recoverLink(e);});
 function note(s){$('hw-message').textContent=s;$('pilot-message').textContent=s;status(s);}
 function drawTable(){
  $('hw-table').innerHTML=HexMotion.names.map((n,i)=>`<tr><th>${n}</th><td>${state?.frame?state.current.slice(i*3,i*3+3).map(v=>v||'Off').join(' / '):'Off'}</td><td>${confirmed[i]?saved.slice(i*3,i*3+3).join(' / '):'Not saved'}</td></tr>`).join('');
 }
 function ui(){
  const permitted=live&&link.connected&&$('hw-ready').checked;
  const currentMode=mode();
  document.querySelectorAll('.setup-only').forEach(el=>el.hidden=currentMode!=='setup');
  document.querySelectorAll('.manual-only').forEach(el=>el.hidden=currentMode!=='manual');
  document.querySelector('.walk-controls').hidden=currentMode!=='walk';document.querySelector('.crab-controls').hidden=currentMode!=='crab';
  $('hw-target').disabled=armed||busy;$('hw-joint').disabled=armed||busy;$('hw-mode').disabled=busy;
  $('hw-single').disabled=!permitted||armed||busy||currentMode!=='setup'||jointId()<0;
  $('hw-save-single').disabled=!permitted||!armed||!singleMode||busy;
  $('hw-capture-crab').disabled=!permitted||!armed||!singleMode||busy;
  $('hw-crab-save').disabled=!live||armed||busy||currentMode!=='crab';
  $('hw-crab-test').disabled=!permitted||busy||walking||!confirmed.every(Boolean)||!allCrab(Number($('hw-crab-direction').value));
  $('hw-axis').disabled=walking||busy;$('hw-crab-direction').disabled=walking||busy;
  $('hw-center').disabled=!permitted||armed||busy||!hasReady(selection());
  $('hw-calibrate').disabled=!permitted||armed||busy;
  $('hw-save').disabled=!permitted||!armed||singleMode||walking||busy;
  $('hw-foot-target').disabled=!armed||singleMode||walking||busy;
  $('hw-disconnect').disabled=busy;
  $('hw-walk').disabled=!permitted||busy||walking||!confirmed.every(Boolean)||!$('hw-gait-ready').checked||(armed&&activeMask!==63);
  $('hw-return').disabled=!permitted||busy||walking||!hasReady(armed?activeMask:selection());
  $('hw-apply-limits').disabled=armed||busy||jointId()<0;
  for(const id of ['hw-apply-pulse','hw-minus','hw-plus'])$(id).disabled=!permitted||!armed||walking||busy||jointId()<0;
  $('hw-import').disabled=armed||busy;
  for(const id of ['hw-gait','hw-cycles','hw-stride','hw-lift','hw-extend'])$(id).disabled=walking||busy;
  $('hw-speed-value').textContent=rate()+' µs/s';
  $('hw-pose-status').textContent=`Ready poses saved: ${confirmed.filter(Boolean).length}/6 · ${Array.from({length:18},(_,i)=>Boolean(jointFlags&(1<<i))).filter(Boolean).length}/18 servos. `+(hasReady(selection())?'Enable starts at your saved pose.':'Finish Setup before walking.');
  const missing=18-Array.from({length:18},(_,i)=>Boolean(jointFlags&(1<<i))).filter(Boolean).length;
   const reason=!live||!link.connected?'Connect to the robot first.':currentMode==='setup'?(jointId()<0?'Select one leg and servo.':!$('hw-ready').checked?'Check “Robot clear and ready” before centering.':''):!hasReady(currentMode==='walk'||currentMode==='crab'?63:selection())?`${missing}/18 ready positions missing. Use Setup to center, adjust, and save each servo.`:!$('hw-ready').checked?'Check “Robot clear and ready” to enable.':currentMode==='walk'&&!$('hw-gait-ready').checked?'Confirm ready poses and step clearance.':currentMode==='crab'&&!allCrab(Number($('hw-crab-direction').value))?'Save this direction’s crab poses in Tune crab poses first.':'';
   cockpit.sync({mode:currentMode,armed,busy,walking,single:singleMode,reason,readyCount:18-missing});
  $('pilot-test').disabled=Boolean(reason)||busy||walking||(currentMode==='crab'&&!allCrab(Number($('hw-crab-direction').value)));
  drawTable();if(live)render();
 }
 render=function(){baseRender();if(!live)return;enabled=armed&&!busy&&(!walking||repeatDrive);active=null;
  document.querySelector('.connection').innerHTML=`<i></i> ${wifi?'Wi-Fi':'USB'} / ESP32 <span>JOINT & GAIT TEST</span>`;
  $('armed').textContent=armed?'OUTPUTS ON':'OUTPUTS OFF';$('enable').textContent=armed?'■ Outputs off':'Ready pose & enable';$('enable').disabled=!link.connected||busy||!$('hw-ready').checked||(!armed&&!hasReady(selection()));
  $('joystick').setAttribute('aria-disabled',String(!enabled));$('joystick').setAttribute('aria-label',mode()==='crab'?'Hold left or right for sideways crab steps. Release to finish the cycle.':'Physical joystick. Release to hold.');
  $('pose').textContent=walking?'WALKING TEST':armed?'COMMANDED / NOT MEASURED':'OUTPUTS OFF';$('direction').textContent=mode()==='walk'?'FORWARD / BACKWARD':mode()==='crab'?'LEFT / RIGHT':mode()==='setup'?'ONE SERVO':'HIP / KNEE';$('scene-mode').textContent='HARDWARE CONTROL';
 };
 async function halt(message='Outputs off.'){
  if(!live)return;++gen;armed=false;singleMode=false;crabRunning=false;walking=false;repeatDrive=false;busy=false;activeMask=0;clearTimeout(timer);enabled=false;active=null;release();
  try{await link.stop();await link.request('STATE');note(message);}catch{note('Link unavailable. Disconnect battery if needed.');}ui();
 }
  async function recoverLink(error){
   if(!live)return;
   await halt(error?.message||'Controller connection lost.');
   live=false;panel.hidden=true;document.body.classList.remove('usb-live');
   resetStartup('LINK LOST');connectionError('Controller link lost. Outputs were stopped; reconnect to continue.');
   await link.close();
  }
 stop=function(message){if(live){void halt(typeof message==='string'?message.replace(/Simulation paused/g,'Outputs off'):'Outputs off.');return;}baseStop(message);};
 async function begin(calibration=false,mask=selection()){
  if(!live||armed||busy||!$('hw-ready').checked||(!calibration&&!hasReady(mask)))return false;
  busy=true;ui();const token=++gen;targets=calibration?Array(18).fill(1500):[...saved];
  try{await link.stop();if(token!==gen)return false;
   await link.request(`START ${mask} ${targets.join(' ')}`);if(token!==gen)return false;
   armed=true;singleMode=false;activeMask=mask;resetFoot();lastTick=performance.now();await link.request('STATE');
   note(calibration?'1500 calibration active. Adjust the selected leg, then save its ready pose.':'Saved ready pose enabled. Release joystick to hold.');return true;
  }catch(e){if(token===gen)await halt(e.message);return false;}finally{busy=false;ui();}
 }
 async function beginSingle(){const id=jointId();if(!live||armed||busy||mode()!=='setup'||id<0||!$('hw-ready').checked)return;busy=true;ui();const token=++gen;
  try{await link.stop();if(token!==gen)return;await link.request(`JSTART ${id}`);if(token!==gen)return;singleMode=true;armed=true;activeMask=0;targets[id]=1500;$('hw-pulse').value=1500;lastTick=performance.now();await link.request('STATE');note(`Only ${HexMotion.names[Math.floor(id/3)]} ${['hip','knee','foot'][id%3]} is powered at 1500 µs.`);}
  catch(e){if(token===gen)await halt(e.message);}finally{busy=false;ui();if(token===gen&&armed)tick();}
 }
 function resetFoot(){footBase=[...targets];$('hw-foot-target').value=0;$('hw-foot-value').textContent='0 µs';}
 async function tick(){
  if(!live||!armed||walking||busy)return;const token=gen;
   try{const now=performance.now(),dt=Math.min(.25,(now-lastTick)/1000);lastTick=now;
   if(singleMode){const id=jointId(),leg=Math.floor(id/3),j=id%3,s=HexMotion.sign(leg),axis=j===0?x:y,delta=rate()*dt*axis*(j===2?-s:s);targets[id]=HexMotion.clamp(targets[id]+delta,id);await link.request(`JFRAME ${Math.round(rate()/50)} ${Math.round(targets[id])}`);if(token!==gen)return;const report=await link.request('STATE');if(!report.ready||report.current[id]===0)throw Error('Selected servo stopped.');if(document.activeElement!==$('hw-pulse'))$('hw-pulse').value=report.current[id];}
   else if(mode()==='walk'){
    await link.request('PING');const report=await link.request('STATE');if(!report.ready||report.mask!==63)throw Error('Outputs stopped.');
    if(Math.abs(y)>.35){void runWalk(true,y>0?1:-1);return;}
   }
   else if(mode()==='crab'){await link.request('PING');const report=await link.request('STATE');if(!report.ready||report.mask!==63)throw Error('Outputs stopped.');if(Math.abs(x)>.35&&!crabRunning){const d=x<0?0:1;if(crabTested[d]){void runCrab(false,d);return;}note(`Test one ${d?'right':'left'} crab cycle first. Select that direction in Tune crab poses.`);}}
   else{
   targets=HexMotion.jog(targets,activeMask,$('hw-axis').value,x,y,rate(),dt);
   if($('hw-axis').value!=='foot')for(const leg of HexMotion.legs(activeMask)){const id=leg*3+2;targets[id]=HexMotion.clamp(footBase[id]-HexMotion.sign(leg)*Number($('hw-foot-target').value),id);}
   if(token!==gen||!armed)return;
   await link.request(`FRAME ${Math.round(rate()/50)} ${targets.map(Math.round).join(' ')}`);
   if(token!==gen||!armed)return;
   const report=await link.request('STATE');if(!report.ready||report.mask!==activeMask)throw Error('Outputs stopped. Re-enable to continue.');
   }
  }catch(e){if(token===gen)await halt(e.message);}
  if(token===gen&&armed)timer=setTimeout(tick,pollDelay);
 }
 async function savePose(){
  if(!armed||walking||busy)return;clearTimeout(timer);busy=true;release();ui();const token=++gen;
  try{const s=await link.request('STATE');if(token!==gen)return;
   if(!s.ready||s.mask!==activeMask)throw Error('Outputs are off; enable before saving.');
   for(const leg of HexMotion.legs(activeMask))for(let j=0;j<3;j++){const id=leg*3+j;if(Math.abs(s.current[id]-s.target[id])>2)throw Error('Let the leg finish moving, then save again.');}
   const candidate=[...saved],flags=[...confirmed];
   for(const leg of HexMotion.legs(activeMask)){for(let j=0;j<3;j++)candidate[leg*3+j]=s.current[leg*3+j];flags[leg]=true;}
   if(!HexMotion.validPose(candidate))throw Error('Invalid pose data.');
   for(const leg of HexMotion.legs(activeMask))for(let j=0;j<3;j++){const id=leg*3+j;await link.request(`CALSAVE ${id} ${candidate[id]}`);}
   saved=candidate;confirmed=flags;for(const leg of HexMotion.legs(activeMask))for(let j=0;j<3;j++)jointFlags|=1<<(leg*3+j);crabTested=[false,false];persist();$('hw-gait-ready').checked=false;showJoint();note('Ready pose saved on the ESP32.');
  }catch(e){note(e.message);}finally{busy=false;ui();if(token===gen&&armed){lastTick=performance.now();tick();}}
 }
 async function saveSingle(){const id=jointId();if(!live||!armed||!singleMode||busy||id<0)return;busy=true;clearTimeout(timer);ui();const token=++gen;
  try{const s=await link.request('STATE');if(token!==gen)return;if(s.current[id]!==s.target[id])throw Error('Wait for this servo to finish moving, then save.');await link.request(`CALSAVE ${id} ${s.current[id]}`);saved[id]=s.current[id];jointFlags|=1<<id;confirmed[Math.floor(id/3)]=[0,1,2].every(j=>jointFlags&(1<<(Math.floor(id/3)*3+j)));crabTested=[false,false];persist();showJoint();note(`${HexMotion.names[Math.floor(id/3)]} ${['hip','knee','foot'][id%3]} saved at ${s.current[id]} µs on the ESP32.`);}
  catch(e){note(e.message);}finally{busy=false;ui();if(token===gen&&armed){lastTick=performance.now();tick();}}
 }
 async function captureCrabJoint(){const id=jointId();if(!armed||!singleMode||busy||id<0)return;const s=await link.request('STATE');if(s.current[id]!==s.target[id]){note('Wait for this servo to finish moving before capturing.');return;}const direction=Number($('hw-setup-crab-direction').value),phase=Number($('hw-setup-crab-phase').value),leg=Math.floor(id/3),offset=profileIndex(direction,leg,phase),draft=crabDrafts.get(offset)||Array.from({length:3},(_,j)=>crabFlags&profileBit(direction,leg,phase)?crabPulses[offset+j]:saved[leg*3+j]);draft[id%3]=s.current[id];crabDrafts.set(offset,draft);$('hw-crab-direction').value=direction;$('hw-crab-leg').value=leg;$('hw-crab-phase').value=phase;note(`${HexMotion.names[leg]} ${['hip','knee','foot'][id%3]} copied into ${direction?'right':'left'} ${phase?'lifted':'planted'} draft at ${s.current[id]} µs. Turn outputs off before saving the leg phase.`);}
 async function saveLimits(){
  const id=jointId(),lo=Number($('hw-min').value),hi=Number($('hw-max').value);
  if(armed||busy||id<0){note('Stop outputs and select one leg to change limits.');return;}
  const candidate=HexMotion.limits.map(a=>[...a]);candidate[id]=[lo,hi];
  if(!HexMotion.validLimits(candidate)){note('Limits must stay within 500–2500 µs and include 1500 µs.');return;}
  const old=HexMotion.limits;HexMotion.limits=candidate;
  if(!HexMotion.validPose(saved)){HexMotion.limits=old;note('A saved ready pose falls outside those limits. Adjust the pose first.');return;}
  try{await link.request(`LIMIT ${id} ${lo} ${hi}`);persist();$('hw-gait-ready').checked=false;note(`${HexMotion.names[Math.floor(id/3)]} ${['hip','knee','foot'][id%3]} limits saved on ESP32: ${lo}–${hi} µs.`);}catch(e){HexMotion.limits=old;note(e.message);}ui();
 }
 async function precisePosition(value){
  const id=jointId(),pulse=Number(value);
  if(!armed||busy||walking||id<0)return;
  if(!Number.isInteger(pulse)||pulse<HexMotion.limits[id][0]||pulse>HexMotion.limits[id][1]){note(`Choose a pulse within ${HexMotion.limits[id].join('–')} µs.`);return;}
  clearTimeout(timer);busy=true;release();ui();const token=++gen;
  try{targets[id]=pulse;resetFoot();await link.request(singleMode?`JFRAME ${Math.round(rate()/50)} ${pulse}`:`FRAME ${Math.round(rate()/50)} ${targets.map(Math.round).join(' ')}`);if(token!==gen)return;
   await link.request('STATE');$('hw-pulse').value=pulse;note(`Moving ${HexMotion.names[Math.floor(id/3)]} ${['hip','knee','foot'][id%3]} to ${pulse} µs.`);
  }catch(e){if(token===gen)await halt(e.message);}finally{busy=false;ui();if(token===gen&&armed){lastTick=performance.now();tick();}}
 }
 function exportCalibration(){
  $('hw-calibration-json').value=JSON.stringify({version:5,pulses:saved,confirmed,limits:HexMotion.limits,jointFlags,crabPulses,crabFlags},null,2);
  note('ESP32 calibration JSON is ready to copy as a backup.');
 }
 async function importCalibration(){
  if(armed||busy){note('Switch outputs off before importing.');return;}
  let data,flags,crabData,crabSaved;
  try{data=JSON.parse($('hw-calibration-json').value);if(!HexMotion.validLimits(data.limits))throw Error('Invalid joint limits.');const old=HexMotion.limits;HexMotion.limits=data.limits;const valid=HexMotion.validPose(data.pulses);HexMotion.limits=old;if(!valid||!Array.isArray(data.confirmed)||data.confirmed.length!==6||!data.confirmed.every(v=>typeof v==='boolean'))throw Error('Invalid saved ready poses.');flags=Number.isInteger(data.jointFlags)?data.jointFlags:data.confirmed.reduce((m,on,l)=>on?m|(7<<(l*3)):m,0);if(flags<0||flags>262143)throw Error('Invalid joint flags.');crabData=Array.isArray(data.crabPulses)?data.crabPulses:Array(72).fill(1500);crabSaved=Number.isInteger(data.crabFlags)?data.crabFlags:0;if(crabData.length!==72||crabSaved<0||crabSaved>16777215||crabData.some((n,i)=>!Number.isInteger(n)||((crabSaved&(1<<Math.floor(i/3)))&&(n<data.limits[(Math.floor(i/6)%6)*3+i%3][0]||n>data.limits[(Math.floor(i/6)%6)*3+i%3][1]))))throw Error('Invalid crab profile.');}
  catch(e){note(e.message);return;}
  busy=true;ui();try{await link.request('CALRESET');for(let i=0;i<18;++i)await link.request(`LIMIT ${i} ${data.limits[i][0]} ${data.limits[i][1]}`);for(let i=0;i<18;++i)if(flags&(1<<i))await link.request(`CALSAVE ${i} ${data.pulses[i]}`);for(let direction=0;direction<2;++direction)for(let leg=0;leg<6;++leg)for(let phase=0;phase<2;++phase){const bit=profileBit(direction,leg,phase);if(crabSaved&bit){const offset=profileIndex(direction,leg,phase);await link.request(`CRABSET ${direction} ${leg} ${phase} ${crabData.slice(offset,offset+3).join(' ')}`);}}await loadDeviceSettings();persist();$('hw-gait-ready').checked=false;note('Calibration imported to ESP32. Check each leg before enabling.');}
  catch(e){note(`Import stopped: ${e.message}. Restore the backup before motion.`);}finally{busy=false;ui();}
 }
 async function moveFrame(pulses,token){
  if(token!==gen||!armed)throw Error('Cancelled.');
  const speed=rate();if(!HexMotion.validPose(pulses))throw Error('Step exceeds the command window.');
  targets=[...pulses];await link.request(`FRAME ${Math.round(speed/50)} ${targets.join(' ')}`);
  const travel=Math.max(...pulses.map((n,i)=>Math.abs(n-(state?.current[i]||saved[i]))));const end=performance.now()+Math.max(5000,travel/rate()*1000+5000);
  while(performance.now()<end){if(token!==gen||!armed)throw Error('Cancelled.');await link.request('PING');const s=await link.request('STATE');
   if(!s.ready||s.mask!==activeMask)throw Error('Controller stopped.');
   if(HexMotion.legs(activeMask).every(l=>[0,1,2].every(j=>s.current[l*3+j]===pulses[l*3+j])))return;
   await new Promise(r=>setTimeout(r,100));
  }throw Error('Motion command timed out.');
 }
 async function saveCrabProfile(){if(!live||armed||busy)return;const direction=Number($('hw-crab-direction').value),leg=Number($('hw-crab-leg').value),phase=Number($('hw-crab-phase').value),values=['hw-crab-hip','hw-crab-knee','hw-crab-foot'].map(id=>Number($(id).value));if(values.some((n,j)=>!Number.isInteger(n)||n<HexMotion.limits[leg*3+j][0]||n>HexMotion.limits[leg*3+j][1])){note('Crab pose must fit this leg’s saved joint limits.');return;}busy=true;ui();try{await link.request(`CRABSET ${direction} ${leg} ${phase} ${values.join(' ')}`);const offset=profileIndex(direction,leg,phase);crabPulses.splice(offset,3,...values);crabDrafts.delete(offset);crabFlags|=profileBit(direction,leg,phase);crabTested[direction]=false;persist();showCrab();note(`${HexMotion.names[leg]} ${direction?'right':'left'} ${phase?'lifted':'planted'} pose saved on ESP32.`);}catch(e){note(e.message);}finally{busy=false;ui();}}
 function crabFrames(direction){if(!allCrab(direction)||!confirmed.every(Boolean))throw Error('Save all leg phases and ready poses before Crabwalk.');const groups=[[0,2,4],[1,3,5]],frames=[];for(const swing of groups){const pose=[...saved];for(let leg=0;leg<6;++leg){const phase=swing.includes(leg)?1:0,offset=profileIndex(direction,leg,phase);pose.splice(leg*3,3,...crabPulses.slice(offset,offset+3));}if(!HexMotion.validPose(pose))throw Error('A crab pose is outside saved joint limits.');frames.push(pose);const lower=[...pose];for(const leg of swing){const offset=profileIndex(direction,leg,0);lower.splice(leg*3,3,...crabPulses.slice(offset,offset+3));}if(!HexMotion.validPose(lower))throw Error('A crab planted pose is outside saved limits.');frames.push(lower);}frames.push([...saved]);return frames;}
 async function runCrab(test,direction){if(crabRunning||walking||busy||!live||!$('hw-ready').checked)return;let frames;try{frames=crabFrames(direction);}catch(e){note(e.message);return;}if(!test&&!crabTested[direction])return;if(!armed){$('hw-target').value='six';if(!await begin(false,63))return;}if(activeMask!==63){note('Stop outputs and select all six legs for Crabwalk.');return;}crabRunning=walking=true;repeatDrive=!test;clearTimeout(timer);ui();const token=++gen;try{await moveFrame(saved,token);for(const [i,frame] of frames.entries()){note(`${test?'One-cycle test':'Crabwalk'} ${direction?'right':'left'} · phase ${i+1}/${frames.length}`);await moveFrame(frame,token);}if(token!==gen)return;walking=crabRunning=false;repeatDrive=false;if(test){crabTested[direction]=true;note(`${direction?'Right':'Left'} one-cycle test complete. Check clearance before holding the joystick.`);}else note('Crab cycle complete. Holding ready pose.');ui();lastTick=performance.now();timer=setTimeout(tick,pollDelay);}catch(e){if(token===gen)await halt(e.message);}}
 async function runWalk(repeat=false,driveDirection=1){
  if(busy||walking||!$('hw-gait-ready').checked||!confirmed.every(Boolean)||!$('hw-ready').checked)return;
  const count=repeat?1:Number($('hw-cycles').value);let frames;
  try{if(!Number.isInteger(count)||count<1||count>20)throw Error('Choose 1–20 cycles.');frames=HexMotion.tripod(saved,{direction:repeat?driveDirection:Number($('hw-gait').value),stride:Number($('hw-stride').value),lift:Number($('hw-lift').value),extend:Number($('hw-extend').value)});}catch(e){note(e.message);return;}
  if(!armed){$('hw-target').value='six';if(!await begin(false,63))return;}
  if(activeMask!==63){note('Stop, then select all six legs.');return;}
  walking=true;repeatDrive=repeat;clearTimeout(timer);if(!repeat)release();ui();const token=++gen;
  try{await moveFrame(saved,token);for(let cycle=0;cycle<count;cycle++)for(const frame of frames){note(`${cycle+1}/${count} · ${frame.name}`);await moveFrame(frame.pulses,token);}
   await moveFrame(saved,token);if(token!==gen)return;walking=false;repeatDrive=false;resetFoot();lastTick=performance.now();note('Walking test complete. Holding the saved ready pose.');ui();timer=setTimeout(tick,pollDelay);
  }catch(e){if(token===gen)await halt(e.message);}
 }
 async function returnReady(){
  if(!armed){if(await begin())tick();return;}if(walking||busy||!hasReady(activeMask))return;
  walking=true;clearTimeout(timer);release();ui();const token=++gen;
  try{await moveFrame(saved,token);if(token!==gen)return;walking=false;resetFoot();lastTick=performance.now();note('Holding ready pose.');ui();tick();}catch(e){if(token===gen)await halt(e.message);}
 }
 $('hw-center').onclick=async()=>{if(await begin())tick();};$('hw-calibrate').onclick=async()=>{if(await begin(true))tick();};$('hw-save').onclick=savePose;$('hw-walk').onclick=()=>runWalk(false);$('hw-return').onclick=returnReady;$('hw-off').onclick=()=>halt();
 $('hw-single').onclick=beginSingle;$('hw-save-single').onclick=saveSingle;$('hw-capture-crab').onclick=captureCrabJoint;$('hw-crab-save').onclick=saveCrabProfile;$('hw-crab-test').onclick=()=>runCrab(true,Number($('hw-crab-direction').value));
 $('hw-apply-limits').onclick=saveLimits;$('hw-apply-pulse').onclick=()=>precisePosition($('hw-pulse').value);
 $('hw-minus').onclick=()=>precisePosition(Number($('hw-pulse').value)-10);$('hw-plus').onclick=()=>precisePosition(Number($('hw-pulse').value)+10);
 $('hw-export').onclick=exportCalibration;$('hw-load-old').onclick=()=>{const value=localStorage.getItem(storeKey);if(value){$('hw-calibration-json').value=value;note('Old browser calibration loaded into the import box. Review it before importing.');}else note('No old calibration is stored in this browser.');};$('hw-import').onclick=importCalibration;$('hw-joint').onchange=showJoint;
 async function armMode(){
  if(armed){await halt();return;}
  if(mode()==='setup'){await beginSingle();return;}
  if(mode()==='walk'&&!$('hw-gait-ready').checked)return;
  if(mode()==='walk'||mode()==='crab')$('hw-target').value='six';
  if(await begin())tick();
 }
 $('enable').onclick=()=>{if(!live)return baseEnable();return armMode();};
 $('pilot-arm').onclick=armMode;
 $('pilot-test').onclick=()=>{if(mode()==='walk'){$('hw-cycles').value=1;runWalk(false);}else runCrab(true,Number($('hw-crab-direction').value));};
 $('pilot-options').onclick=()=>{release();cockpit.open({walk:'walk',crab:'crab',manual:'manual',setup:'limits'}[mode()]);};
 $('hw-target').onchange=()=>{release();showJoint();ui();if(state)telemetry(state);};$('hw-axis').onchange=()=>{release();resetFoot();};$('hw-speed').oninput=ui;
 $('hw-mode').onchange=async()=>{
  release();if(armed||walking)await halt();
  if(mode()==='setup'&&!/^\d$/.test($('hw-target').value))$('hw-target').value='0';
  if(mode()==='walk'||mode()==='crab')$('hw-target').value='six';
  showJoint();if(mode()==='crab')showCrab();ui();note('Mode selected. Enable when ready.');
 };
 for(const id of ['hw-crab-direction','hw-crab-leg','hw-crab-phase'])$(id).onchange=()=>{showCrab();ui();};
 $('hw-foot-target').oninput=()=>{$('hw-foot-value').textContent=$('hw-foot-target').value+' µs';};
 $('hw-ready').onchange=()=>{if(!$('hw-ready').checked)halt();ui();};$('hw-gait-ready').onchange=()=>{if(!$('hw-gait-ready').checked&&walking)halt();ui();};
 async function disconnect(){await halt();await link.close();live=false;panel.hidden=true;document.body.classList.remove('usb-live');$('hw-ready').checked=false;resetStartup();location.reload();}
 $('hw-disconnect').onclick=disconnect;const back=$('show-startup').onclick;$('show-startup').onclick=()=>{if(live)disconnect();else back();};
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&live)halt('Paused because this tab is hidden.');});window.addEventListener('pagehide',()=>{if(live){armed=false;clearTimeout(timer);void link.stop();}});
 if(!demo){
  $('connect-robot').innerHTML=wifi?'Connect ESP32 via Wi-Fi <span>→</span>':'Connect ESP32 via USB <span>→</span>';
  const help=document.createElement('p');help.className='usb-note';
  if(wifi)help.textContent='Connected to the ESP32 network. Your phone or laptop can control it here.';
  else help.innerHTML='Desktop Chrome / Edge: connect by USB. For Wi-Fi, join <b>Hexapod-Control</b> (password <b><your-AP-password></b>) and open <a href="http://192.168.4.1">192.168.4.1</a>. Export calibration here before switching.';
  document.querySelector('.boot-copy').appendChild(help);
  $('connect-robot').onclick=async()=>{
   if(connecting)return;if(!wifi&&!navigator.serial){connectionError('USB control needs desktop Chrome or Edge. Join the ESP32 Wi-Fi network for phone control.');return;}
   connecting=true;const token=++gen;
   try{const port=wifi?undefined:await navigator.serial.requestPort();setBootStatus('VERIFYING CONTROLLER');$('connect-robot').disabled=true;await link.connect(port);if(token!==gen){await link.close();return;}
    window.hexapodLink?.detach();baseStop('Controller connected. Outputs off.');live=true;panel.hidden=false;document.body.classList.add('usb-live');
    $('hw-target').value=mode()==='setup'?'0':'six';
    document.querySelector('.library-note').textContent='Use Walking test in the center panel. These animation presets are separate.';document.querySelectorAll('.routine').forEach(b=>b.disabled=true);
    await link.request('STATE');await loadDeviceSettings();if(token!==gen){await link.close();return;}
    linkEstablished({usb:true});setBootStatus('CONTROLLER VERIFIED');note(`${wifi?'Wi-Fi':'USB'} verified; outputs off. Connect battery and check readiness.`);ui();
   }catch(e){live=false;panel.hidden=true;document.body.classList.remove('usb-live');await link.close();resetStartup();connectionError(e.message);}finally{connecting=false;}
  };
 }
 showJoint();showCrab();ui();
})();

