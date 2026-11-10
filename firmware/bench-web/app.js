'use strict';
const $=id=>document.getElementById(id), sleep=ms=>new Promise(r=>setTimeout(r,ms));
let parentAxesAt=0;
// Fallback matches the last uploaded firmware; broader ranges require its reply.
let jointMin=[1400,1350,1250],jointMax=[1650,1750,1550];
function showLimits(){ $('footTarget').min=jointMin[2];$('footTarget').max=jointMax[2];$('limitStatus').textContent='Controller command limits (us): Hip '+jointMin[0]+'–'+jointMax[0]+', Knee '+jointMin[1]+'–'+jointMax[1]+', Foot '+jointMin[2]+'–'+jointMax[2]; }

let liveOn=false,liveTimer=null,liveSending=false,lastReply=0,liveTarget=[1500,1500,1500],stickX=0,stickY=0;
let port,reader,writer,readTask,pending=null,busy=false,connected=false,generation=0,writeChain=Promise.resolve();
function message(text){$('message').textContent=text;}
function log(text){$('log').textContent=($('log').textContent+text+'\n').slice(-9000);$('log').scrollTop=$('log').scrollHeight;}
function controls(){$('stepSpeed').disabled=busy||liveOn;const armed=connected&&$('armed').checked;$('step').disabled=$('center').disabled=!armed||busy||liveOn;$('stop').disabled=!connected;$('disconnect').disabled=!port||busy||liveOn;$('connect').disabled=!!port||!$('unplugged').checked||!navigator.serial;$('armed').disabled=!connected;$('live').disabled=!armed||busy||liveOn;$('stick').disabled=!liveOn;$('footTarget').disabled=!liveOn;if(window.parent!==window)window.parent.postMessage({type:'live-state',enabled:liveOn},'http://127.0.0.1:8765');}
function failPending(error){if(pending){const p=pending;pending=null;clearTimeout(p.timer);p.reject(error);}}
function line(text){log(text);const limits=text.match(/^LIMITS min=(\d+),(\d+),(\d+) max=(\d+),(\d+),(\d+)$/);if(limits){const v=limits.slice(1).map(Number);if(v.every(n=>n>=1000&&n<=2000)&&v.slice(0,3).every((n,i)=>n<1500&&v[i+3]>1500)){jointMin=v.slice(0,3);jointMax=v.slice(3);showLimits();}return;}if(liveOn&&/FAULT|rejected|Not ready|Send CENTER|timeout:/.test(text)){stop(text);}if(/FAULT|rejected|Not ready|Send CENTER|Commands:|timeout:/.test(text))failPending(new Error(text));const m=text.match(/LEG ready=(\d) active=(\d) current_us=(\d+,\d+,\d+) target_us=(\d+,\d+,\d+)/);if(!m)return;lastReply=performance.now();const s={ready:+m[1],active:+m[2],current:m[3],target:m[4]};s.current.split(',').forEach((v,i)=>$( ['hip','knee','foot'][i]).textContent=v==='0'?'Off':v+' µs');if(pending){if(!s.ready){failPending(new Error('Controller fault. Unplug battery.'));return;}if(pending.accept(s)){const p=pending;pending=null;clearTimeout(p.timer);p.resolve(s);}}}
async function read(){const decoder=new TextDecoder();let buffer='';try{while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let n;while((n=buffer.indexOf('\n'))>=0){line(buffer.slice(0,n).trim());buffer=buffer.slice(n+1);}}}catch(e){message('USB connection lost. Unplug battery if needed.');log(e.message);}finally{liveOn=false;clearInterval(liveTimer);connected=false;generation++;failPending(new Error('USB closed'));controls();}}
function send(command){const task=writeChain.then(()=>{if(!writer)throw new Error('USB is not connected');log('SEND '+command);return writer.write(new TextEncoder().encode(command+'\n'));});writeChain=task.catch(()=>{});return task;}
function request(command,accept,timeout=3500){if(pending)return Promise.reject(new Error('Another command is pending'));return new Promise((resolve,reject)=>{pending={resolve,reject,accept,timer:setTimeout(()=>failPending(new Error('Controller response timed out')),timeout)};send(command).catch(failPending);});}
async function stop(reason){reason=typeof reason==='string'?reason:'';liveOn=false;clearInterval(liveTimer);releaseStick();generation++;failPending(new Error('Stopped'));try{if(writer){await send('OFF');await request('STATUS',s=>s.active===0);message(reason?reason+' Outputs off.':'Outputs off. Battery still supplies power.');}}catch(e){message(e.message+' — disconnect battery if needed.');}finally{busy=false;controls();}}
async function run(step){if(busy||liveOn||!connected||!$('armed').checked)return;const stepSpeed=Number($('stepSpeed').value);if(step&&(!Number.isFinite(stepSpeed)||stepSpeed<250||stepSpeed>5000||stepSpeed%50!==0)){message('Choose a step speed from 250 to 5000 us/s.');return;}const count=step?Number($('repeatCount').value):1;if(!Number.isInteger(count)||count<1||count>10){message('Choose 1 to 10 steps.');return;}if(step&&count>1&&!$('poseChecked').checked){message('Check one full step for clearance before repeating it.');return;}busy=true;controls();const mine=++generation;try{await request('STATUS',()=>true);if(mine!==generation)return;const commands=['CENTER'];if(step)commands.push('STEP_RATE '+Math.round(stepSpeed/50));if(step)for(let cycle=0;cycle<count;cycle++)commands.push('STEP_LIFT','STEP_FORWARD','STEP_LOWER','STEP_RETURN');for(const command of commands){if(mine!==generation)return;message(command.replaceAll('_',' '));await request(command,s=>s.active===1&&s.current===s.target);await sleep(400);}if(mine===generation)await stop();}catch(e){if(mine===generation){const error=e.message;await stop();message(error+' — outputs stop requested.');}}finally{if(mine===generation){busy=false;controls();}}}
async function disconnect(){await stop();if(reader){await reader.cancel();await readTask;reader.releaseLock();reader=null;}if(writer){writer.releaseLock();writer=null;}if(port){await port.close();port=null;}connected=false;$('armed').checked=false;controls();message('Disconnected.');}
$('connect').onclick=async()=>{if(!$('unplugged').checked)return;try{port=await navigator.serial.requestPort();await port.open({baudRate:115200,flowControl:'none'});await port.setSignals({dataTerminalReady:false,requestToSend:false});writer=port.writable.getWriter();reader=port.readable.getReader();readTask=read();await sleep(1800);await send('OFF');await request('STATUS',s=>s.active===0);jointMin=[1400,1350,1250];jointMax=[1650,1750,1550];showLimits();await send('LIMITS');connected=true;message('Connected; outputs off. Reconnect battery, then check the readiness box.');}catch(e){message(e.message);try{if(reader)await reader.cancel();if(readTask)await readTask;if(reader)reader.releaseLock();if(writer)writer.releaseLock();if(port)await port.close();}catch{}reader=writer=port=null;connected=false;}controls();};
$('disconnect').onclick=()=>disconnect().catch(e=>message(e.message));$('step').onclick=()=>run(true);$('center').onclick=()=>run(false);$('stop').onclick=stop;$('unplugged').onchange=controls;$('armed').onchange=()=>{controls();if(!$('armed').checked&&connected)stop();};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&connected)stop();});window.addEventListener('pagehide',()=>{if(writer)send('OFF').catch(()=>{});});
if(!navigator.serial)$('support').textContent='Open this page in desktop Chrome or Edge for USB control. iPhone USB control is not supported by this page.';controls();


function releaseStick(){stickX=stickY=0;$('knob').style.transform='translate(0px,0px)';}
function positionStick(event){if(!liveOn)return;const r=$('stick').getBoundingClientRect();let x=(event.clientX-r.left-r.width/2)/(r.width*.4),y=(event.clientY-r.top-r.height/2)/(r.height*.4);const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}stickX=Math.abs(x)<.08?0:x;stickY=Math.abs(y)<.08?0:y;$('knob').style.transform=`translate(${stickX*70}px,${stickY*70}px)`;}
$('stick').onpointerdown=e=>{if(!liveOn)return;$('stick').setPointerCapture(e.pointerId);positionStick(e);};
$('stick').onpointermove=e=>{if($('stick').hasPointerCapture(e.pointerId))positionStick(e);};
$('stick').onpointerup=$('stick').onpointercancel=$('stick').onlostpointercapture=releaseStick;
$('stick').onkeydown=e=>{if(!liveOn)return;const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(d){e.preventDefault();[stickX,stickY]=d;}};
$('stick').onkeyup=$('stick').onblur=releaseStick;
$('speed').oninput=()=>{$('speedLabel').textContent=$('speed').value+' us/s';};
$('footTarget').oninput=()=>{$('footLabel').textContent=$('footTarget').value+' us';};
$('live').onclick=async()=>{
 if(busy||liveOn||!connected||!$('armed').checked)return;
 busy=true;controls();const mine=++generation;
 try{
  await request('CENTER',s=>s.active===1&&s.current===s.target);
  if(mine!==generation)return;
  liveTarget=[1500,1500,1500];$('footTarget').value=1500;$('footTarget').oninput();releaseStick();
  liveOn=true;busy=false;lastReply=performance.now();controls();message('Joystick enabled. Release to hold. Stop turns outputs off.');
  let previous=performance.now();
  liveTimer=setInterval(async()=>{
   if(!liveOn||liveSending)return;
   if(performance.now()-lastReply>600){await stop();message('Connection stalled; outputs stop requested.');return;}
   if(window.parent!==window&&performance.now()-parentAxesAt>300)releaseStick();
   const now=performance.now(),dt=Math.min(.1,(now-previous)/1000);previous=now;
   const axis=$('calibrationJoint').value;
   const calibrating=['hip','knee','foot'].includes(axis);
   const speed=calibrating?Math.min(100,Number($('speed').value)):Number($('speed').value);
   if(!calibrating||axis==='hip')liveTarget[0]=Math.max(jointMin[0],Math.min(jointMax[0],liveTarget[0]+stickX*speed*dt));
   if(!calibrating||axis==='knee')liveTarget[1]=Math.max(jointMin[1],Math.min(jointMax[1],liveTarget[1]-stickY*speed*dt));
   if(!calibrating)liveTarget[2]=Math.max(jointMin[2],Math.min(jointMax[2],Number($('footTarget').value)));
   else if(axis==='foot'){liveTarget[2]=Math.max(jointMin[2],Math.min(jointMax[2],liveTarget[2]+stickY*speed*dt));$('footTarget').value=Math.round(liveTarget[2]);$('footTarget').oninput();}
   liveSending=true;
   try{await send(`J ${liveTarget.map(Math.round).join(' ')} ${Math.round(speed/50)}`);}catch(e){await stop();message(e.message);}finally{liveSending=false;}
  },100);
 }catch(e){if(mine===generation){await stop();message(e.message);}}
 finally{if(!liveOn&&mine===generation){busy=false;controls();}}
};

window.addEventListener('message',e=>{
 if(e.origin!=='http://127.0.0.1:8765'||e.source!==window.parent)return;
 if(e.data?.type==='speed'){const n=e.data.value;if(Number.isFinite(n)&&n>=50&&n<=5000&&n%50===0){$('speed').value=n;$('speed').oninput();}return;}
 if(e.data?.type==='stop'){if(connected)stop();return;}
 if(e.data?.type==='axes'&&liveOn){const {x,y}=e.data;if(!Number.isFinite(x)||!Number.isFinite(y))return;parentAxesAt=performance.now();stickX=Math.max(-1,Math.min(1,x));stickY=-Math.max(-1,Math.min(1,y));}
});
if(new URLSearchParams(location.search).has('embedded')){document.querySelector('header').hidden=true;$('stick').hidden=true;document.querySelector('body>p').hidden=true;$('speed').hidden=true;$('speed').previousElementSibling.hidden=true;$('speed').nextElementSibling.hidden=true;}

$('calibrationJoint').onchange=()=>{releaseStick();$('footTarget').value=Math.round(liveTarget[2]);$('footTarget').oninput();};

showLimits();

$('stepSpeed').oninput=()=>{$('stepSpeedLabel').textContent=$('stepSpeed').value+' us/s';};
