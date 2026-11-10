'use strict';
const $=id=>document.getElementById(id);
const shell=$('app');
const demo=new URLSearchParams(location.search).get('preview')==='1';
const lowMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const localDevice=location.origin==='http://192.168.4.1';
const startup=document.createElement('section');
startup.className='startup';
startup.setAttribute('aria-label','Hexapod connection');
startup.innerHTML='<div class="boot-brand"><span>⬡</span> HEXAPOD <small>NEURAL INTERFACE / 01</small></div>'+
 '<div class="boot-top-right">'+(demo?'LAYOUT PREVIEW':'LOCAL LINK / ESP32')+'</div>'+
 '<div class="holo-stage"><div class="holo-reticle"></div><div class="holo-sweep"></div><canvas id="hologram" aria-label="Rotating isometric hexapod hologram" role="img"></canvas><span class="hud-label left">P3DRO<br><b>18 AXES / 6 LIMBS</b></span><span class="hud-label right">KINEMATIC ARRAY<br><b>STANDBY</b></span><div class="lock-flash"></div></div>'+
 '<div class="boot-copy"><div class="link-state" role="status"><span class="link-spinner"></span><span id="link-status">AWAITING CONNECTION</span></div><button id="connect-robot" class="primary">Connect to hexapod <span>→</span></button><p id="connection-error" hidden role="alert"></p><a id="local-controller" href="http://192.168.4.1/" hidden>Open the ESP32 on its Wi-Fi network ↗</a></div>'+
 '<div class="boot-bottom"><span>HEXAPOD / CONTROL SYSTEM</span><span>'+ (demo?'PREVIEW · NO ROBOT CONNECTION':'LOCAL COMMAND INTERFACE') +'</span></div>';
document.body.appendChild(startup);shell.inert=true;shell.setAttribute('aria-hidden','true');

let link=null,live=false,preview=false,armed=false,busy=false,recovering=false,connecting=false;
let saved=Array(18).fill(1500),limits=Array.from({length:18},()=>[1000,2000]),confirmed=0,crabFlags=0;
let tempo=0,direction=0,gaitActive=false,gaitKind=-1,gaitDirection=0,gaitEnding=false;
let x=0,y=0,pointer=null,monitor=null,monitorBusy=false,configPending=false;
let testedMask=0,lastConfiguredRate=0,lastConfiguredTempo=-1;
const keys=new Set();
const allSaved=()=>confirmed===262143;
const speed=()=>Number($('servo-rate').value);
const mode=()=>$('drive-mode').value;
const neededCrab=d=>Array.from({length:12},(_,i)=>1<<((d?12:0)+i)).reduce((a,b)=>a|b,0);
const crabReady=d=>(crabFlags&neededCrab(d))===neededCrab(d);
function message(value){$('control-message').textContent=value;}
function resetBoot(value='AWAITING CONNECTION'){
 startup.hidden=false;startup.classList.remove('connecting','linked','departing','connection-failed');
 document.body.classList.add('booting');document.body.classList.remove('deck-ready');
 shell.inert=true;shell.setAttribute('aria-hidden','true');
 $('connect-robot').disabled=false;$('connect-robot').innerHTML='Connect to hexapod <span>→</span>';
 $('connection-error').hidden=true;$('local-controller').hidden=true;$('link-status').textContent=value;
}
function showBootError(value,offerLocal=false){
 resetBoot('LINK UNAVAILABLE');startup.classList.add('connection-failed');
 $('connection-error').textContent=value;$('connection-error').hidden=false;
 $('local-controller').hidden=!offerLocal;$('connect-robot').innerHTML='Retry connection <span>↻</span>';
}
function reveal(){
 startup.classList.remove('connecting');startup.classList.add('linked');$('link-status').textContent=preview?'PREVIEW READY':'ESP32 LINK VERIFIED';
 $('connect-robot').innerHTML='Initializing control center <span>✓</span>';
 const delay=lowMotion?40:550;
 setTimeout(()=>{startup.classList.add('departing');document.body.classList.remove('booting');document.body.classList.add('deck-ready');shell.inert=false;shell.removeAttribute('aria-hidden');},delay);
 setTimeout(()=>{startup.hidden=true;$('enable-motion').focus({preventScroll:true});},delay+(lowMotion?40:900));
}
async function connect(){
 if(connecting)return;connecting=true;startup.classList.add('connecting');$('connection-error').hidden=true;$('connect-robot').disabled=true;$('link-status').textContent='VERIFYING CONTROLLER';
 try{
  if(demo){preview=true;message('Layout preview. No robot commands are sent.');updateUI();reveal();return;}
  if(localDevice){link=new SetupWifi(()=>{},error=>{void recover(error);});await link.connect();}
  else if(navigator.serial){link=new SetupSerial(()=>{},error=>{void recover(error);});const port=await navigator.serial.requestPort();await link.connect(port);}
  else throw Error('On your phone, join Hexapod-Control and open http://192.168.4.1. Desktop Chrome or Edge can use USB.');
  const cal=await link.request('CALDATA'),crab=await link.request('CRABDATA'),gait=await link.request('GSTATUS');
  if(!cal?.calibration||!crab?.crab)throw Error('ESP32 calibration data was incomplete.');
  saved=[...cal.centers];limits=cal.centers.map((_,i)=>[cal.minimum[i],cal.maximum[i]]);
  if(!HexMotion.validLimits(limits))throw Error('ESP32 joint limits are invalid.');
  HexMotion.limits=limits;confirmed=cal.confirmed;crabFlags=crab.flags;testedMask=gait.tested;live=true;preview=false;
  $('link-pill').textContent=localDevice?'WI-FI / ESP32':'USB / ESP32';$('link-pill').classList.add('live');
  message(allSaved()?'Ready poses loaded from ESP32. Enable when the robot is clear.':'Only '+confirmed.toString(2).replace(/0/g,'').length+'/18 poses saved. Finish calibration at /calibration/.');
  updateUI();reveal();monitor=setInterval(()=>{void heartbeat();},250);
 }catch(error){
  if(link){try{await link.close();}catch{}}
  link=null;live=false;showBootError(error?.message||'Could not reach the controller.',!localDevice);
 }finally{connecting=false;}
}
$('connect-robot').onclick=()=>{void connect();};
async function recover(error){
 if(recovering||!live)return;recovering=true;clearInterval(monitor);monitor=null;live=false;armed=false;busy=false;gaitActive=false;direction=0;releaseStick();
 const old=link;link=null;try{await old?.stop();await old?.close();}catch{}
 $('link-pill').classList.remove('live');$('link-pill').textContent='DISCONNECTED';updateUI();
 showBootError('Controller link lost: '+(error?.message||'no response')+'. Outputs switch off on the ESP32 watchdog.',false);
 recovering=false;
}
function updateUI(){
 const ready=live&&allSaved(),canMove=ready&&armed&&!busy;
 $('enable-motion').disabled=!ready||busy||preview;
 $('enable-motion').innerHTML=armed?'■ Outputs off':'Enable ready pose <span>→</span>';
 $('test-cycle').disabled=!canMove||gaitActive||(mode()==='crab'&&!crabReady(1));
 $('drive-mode').disabled=busy||gaitActive;
 $('joystick').setAttribute('aria-disabled',String(!canMove));
 $('system-state').textContent=preview?'PREVIEW':gaitActive?'GAIT ACTIVE':armed?'READY':'STANDBY';
 $('output-state').textContent=armed?'OUTPUTS ON':'OUTPUTS OFF';
 $('stick-label').textContent=mode()==='crab'?'LEFT / RIGHT':'FORWARD / BACKWARD';
 $('stick-foot').textContent=mode()==='crab'?'Hold left or right to crabwalk. Release to finish the cycle.':'Hold up or down to walk. Release to finish the cycle.';
 $('eco').setAttribute('aria-pressed',String(tempo===0));$('sport').setAttribute('aria-pressed',String(tempo===1));
 for(const b of document.querySelectorAll('.move-card[data-move]'))b.disabled=!ready||busy||preview;
 $('servo-rate-value').textContent=speed()+' µs/s';
}
async function enable(){
 if(!live||preview||busy)return;
 if(armed){await off();return;}
 if(!allSaved()){message('Finish saving all 18 ready positions in the separate calibration utility.');return;}
 busy=true;updateUI();
 try{
  await link.stop();await link.request('START 63 '+saved.join(' '));const pose=await link.request('STATE');
  if(!pose?.frame||pose.mask!==63)throw Error('Ready pose was not enabled.');
  armed=true;gaitActive=false;message('Saved ready pose is holding. Use the joystick or test one cycle.');
 }catch(error){message(error.message);try{await link.stop();}catch{}}
 finally{busy=false;updateUI();}
}
async function off(){
 direction=0;releaseStick();gaitActive=false;gaitEnding=false;armed=false;busy=true;updateUI();
 try{if(link?.connected)await link.stop();message('Outputs off. Battery power remains connected.');}
 catch(error){message('Could not confirm Outputs off: '+error.message+'. Disconnect battery if needed.');}
 finally{busy=false;updateUI();}
}
$('outputs-off').onclick=()=>{void off();};
$('enable-motion').onclick=()=>{void enable();};
function setTempo(value){tempo=value;updateUI();if(live&&armed&&gaitActive)void updateGaitConfig();else message((tempo?'Sport':'Eco')+' cycle selected. Servo speed is independent.');}
$('eco').onclick=()=>setTempo(0);$('sport').onclick=()=>setTempo(1);
$('servo-rate').oninput=()=>{updateUI();if(live&&armed&&gaitActive&&!configPending)void updateGaitConfig();};
async function updateGaitConfig(){
 if(configPending)return;configPending=true;
 try{while(live&&armed&&gaitActive&&(speed()!==lastConfiguredRate||tempo!==lastConfiguredTempo)){
  const requestedRate=speed(),requestedTempo=tempo;
  await link.request('GCONFIG '+requestedRate+' '+requestedTempo);
  lastConfiguredRate=requestedRate;lastConfiguredTempo=requestedTempo;
 }}catch(error){message(error.message);}finally{configPending=false;}
}
$('drive-mode').onchange=()=>{direction=0;releaseStick();updateUI();message(mode()==='crab'?'Crabwalk uses saved sideways poses from the calibration utility.':'Walking uses the saved ready pose.');};
function chosenDirection(){const value=mode()==='walk'?y:x;return value>.35?1:value<-.35?-1:0;}
async function changeDirection(){
 const next=chosenDirection();if(next===direction)return;direction=next;
 if(!live||!armed||busy)return;
 if(gaitActive){if(!gaitEnding){gaitEnding=true;try{await link.request('GRELEASE');message('Finishing this cycle, then returning to ready.');}catch(error){void recover(error);}}return;}
 if(next)await startGait(mode(),next,false);
}
function renderStick(){
 $('x-value').textContent=(x>=0?'+':'')+x.toFixed(2);$('y-value').textContent=(y>=0?'+':'')+y.toFixed(2);
 const r=$('joystick'),knob=$('knob'),travel=Math.max(0,(r.clientWidth-knob.clientWidth)/2-7);
 knob.style.transform='translate('+Math.round(x*travel)+'px,'+Math.round(-y*travel)+'px)';
}
function vector(a,b){
 const magnitude=Math.max(1,Math.hypot(a,b));x=a/magnitude;y=b/magnitude;renderStick();void changeDirection();
}
function releaseStick(){
 if(pointer!==null&&$('joystick').hasPointerCapture(pointer))$('joystick').releasePointerCapture(pointer);
 pointer=null;keys.clear();x=y=0;renderStick();void changeDirection();
}
function pointerVector(event){
 const r=$('joystick').getBoundingClientRect(),radius=r.width*.38;
 vector((event.clientX-r.left-r.width/2)/radius,-(event.clientY-r.top-r.height/2)/radius);
}
$('joystick').addEventListener('pointerdown',event=>{if(!armed||busy||pointer!==null)return;event.preventDefault();pointer=event.pointerId;$('joystick').setPointerCapture(pointer);pointerVector(event);});
$('joystick').addEventListener('pointermove',event=>{if(pointer===event.pointerId)pointerVector(event);});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('joystick').addEventListener(name,event=>{if(pointer===event.pointerId)releaseStick();});
function keyboardVector(){vector(Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')),Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown')));}
$('joystick').addEventListener('keydown',event=>{if(!event.key.startsWith('Arrow')||!armed)return;event.preventDefault();keys.add(event.key);keyboardVector();});
$('joystick').addEventListener('keyup',event=>{if(!event.key.startsWith('Arrow'))return;event.preventDefault();keys.delete(event.key);keyboardVector();});
$('joystick').addEventListener('blur',releaseStick);
async function startGait(kind,dir,once){
 if(!live||!armed||busy||gaitActive)return;
 if(kind==='crab'&&!crabReady(dir<0?0:1)){message('That crab direction needs 12 saved leg phases in the separate calibration utility.');direction=0;return;}
 const testedBit=1<<((kind==='walk'?0:2)+(dir<0?0:1));
 if(!once&&!(testedMask&testedBit)){message('Test one complete cycle in this direction before holding the joystick.');return;}
 busy=true;updateUI();
 try{
  await link.request('GSTART '+(kind==='walk'?0:1)+' '+dir+' '+tempo+' '+speed()+' '+(once?1:0));
  gaitActive=true;gaitEnding=once;gaitKind=kind==='walk'?0:1;gaitDirection=dir;
  lastConfiguredRate=speed();lastConfiguredTempo=tempo;
  message(once?'One cycle running. Keep the robot clear.':'Gait running on the ESP32. Release the joystick to finish.');
  if(!once&&(direction!==dir||mode()!==kind)){
   await link.request('GRELEASE');gaitEnding=true;message('Finishing this cycle, then returning to ready.');
  }
 }catch(error){direction=0;message(error.message);}
 finally{busy=false;updateUI();}
}
async function heartbeat(){
 if(!live||monitorBusy||recovering)return;monitorBusy=true;
 try{
  if(armed){
   const g=await link.request('GSTATUS');
   if(!g?.gait)throw Error('Missing gait status.');
   testedMask=g.tested;
   if(g.active){gaitActive=true;gaitEnding=!!g.ending;}
   else if(gaitActive){gaitActive=false;gaitEnding=false;message('Cycle complete. Holding saved ready pose.');}
   if(!gaitActive&&direction&&!busy)void startGait(mode(),direction,false);
  }else await link.request('STATUS');
  updateUI();
 }catch(error){void recover(error);}
 finally{monitorBusy=false;}
}
async function testCycle(dir){
 if(!armed){message('Enable the ready pose before testing a cycle.');return;}
 if(gaitActive){message('Finish the current cycle first.');return;}
 await startGait(mode(),dir,true);
}
$('test-cycle').onclick=()=>{void testCycle(1);};
for(const button of document.querySelectorAll('.move-card[data-move]'))button.onclick=async()=>{
 if(!live||preview)return;
 const move=button.dataset.move;
 if(move==='wake'){if(!armed)await enable();else message('Ready pose is already holding.');return;}
 if(move==='park'){if(gaitActive){direction=0;releaseStick();if(!gaitEnding)await link.request('GRELEASE');gaitEnding=true;message('Finishing cycle and returning to ready.');}else if(armed)message('Holding saved ready pose.');else message('Enable the robot to hold its ready pose.');return;}
 if(!armed){message('Enable the ready pose before a library move.');return;}
 if(gaitActive){message('Finish the current cycle first.');return;}
 const nextMode=move.startsWith('crab')?'crab':'walk';$('drive-mode').value=nextMode;updateUI();
 await startGait(nextMode,move==='backward'||move==='crab-left'?-1:1,true);
};
$('view-camera').onclick=()=>{releaseStick();document.body.classList.add('camera-mode');$('camera-view').hidden=false;};
$('close-camera').onclick=()=>{document.body.classList.remove('camera-mode');$('camera-view').hidden=true;};
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&live)void off();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&live)void off();});
window.addEventListener('pagehide',()=>{if(live&&link?.connected){armed=false;void link.stop();}});
updateUI();renderStick();
