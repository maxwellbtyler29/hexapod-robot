// P3DRO command deck (served by the ESP32 at http://192.168.4.1/).
(function(){
'use strict';
const $=(id)=>document.getElementById(id);
const link=HX.makeLink();
const ALL=262143;
let status=null,params=null,polling=false,lastMsgAt=0;
const prefs=Object.assign({tempo:0,cap:0,mode:'walk'},JSON.parse(localStorage.getItem('hx-deck')||'{}'));
function savePrefs(){localStorage.setItem('hx-deck',JSON.stringify(prefs));}
function say(text,kind){const m=$('msg');m.textContent=text;m.className='msg'+(kind?' '+kind:'');lastMsgAt=Date.now();}
async function send(cmd,opts){
  try{const r=await link.command(cmd,opts);if(/^ERR/.test(r)&&!(opts&&opts.quiet))say(r.replace(/^ERR\s*/,''),'bad');return r;}
  catch(e){if(!(opts&&opts.quiet))say('No reply from the robot yet — retrying. ('+e.message+')','warn');return 'ERR link';}}

// ---------------------------------------------------------------- connection
$('boot-mode').textContent=link.preview?'PREVIEW MODE · SIMULATED ROBOT, NO HARDWARE':'';
if(link.preview)$('boot-text').textContent='Preview mode: everything runs against a simulated robot in this browser.';
$('cal-link').href=link.preview?'calibration.html?preview=1':'/calibration/';
link.on((state)=>{const p=$('link-pill');
  const map={live:['live',link.preview?'PREVIEW':'LINK LIVE'],connecting:['warn','CONNECTING'],unstable:['warn','LINK RETRYING'],lost:['bad','LINK LOST'],offline:['','OFFLINE']};
  const [cls,text]=map[state]||['',state];p.className='pill '+cls;p.textContent=text;
  if(state==='lost')render();});
$('connect').addEventListener('click',connect);
async function connect(){
  $('connect').disabled=true;$('boot-text').textContent='Connecting…';
  try{await link.connect();}
  catch(e){$('connect').disabled=false;$('boot-text').textContent=(e.status===409?e.message.replace(/^ERR\s*/,''):'Could not reach 192.168.4.1. Check you are on the Hexapod-Control Wi-Fi.')+' Tap to try again.';return;}
  $('boot').hidden=true;
  params=HX.parseLine(await send('GPARAM',{quiet:true}));renderParams();
  await send(`GCONFIG ${prefs.cap} ${prefs.tempo}`,{quiet:true});
  say(link.preview?'Preview robot connected. Try Stand up, then the tests.':'Connected. Support the chassis for the first tests.');
  if(!polling){polling=true;poll();}}
async function poll(){
  for(;;){
    const r=await send('GSTATUS',{coalesce:'status',quiet:true});
    if(/^GAIT/.test(r)){status=HX.parseLine(r);render();}
    else if(link.state==='lost'){status=null;render();}
    await new Promise(res=>setTimeout(res,stick.active?300:400));}}

// ---------------------------------------------------------------- rendering
function renderParams(){if(!params||params.kind!=='GPARAM')return;
  $('eco-ms').textContent=(params.eco/1000).toFixed(1)+' s / cycle';$('sport-ms').textContent=(params.sport/1000).toFixed(1)+' s / cycle';}
function setPressed(){ $('eco').setAttribute('aria-pressed',prefs.tempo===0);$('sport').setAttribute('aria-pressed',prefs.tempo===1);
  $('cap').value=prefs.cap;$('cap-value').textContent=prefs.cap?prefs.cap+' µs/s':'AUTO';$('drive-mode').value=prefs.mode;
  $('stick-label').textContent=prefs.mode==='walk'?'FORWARD / TURN':'SLIDE / FORWARD';}
function render(){
  const s=status,lost=link.state==='lost'||!s;
  const ro=$('readout'),big=$('state-big'),detail=$('state-detail');
  const on=s?popcount(s.out):0;
  let state='OFFLINE',cls='',det='Not connected';
  if(!lost){
    if(!s.ready){state='FAULT';cls='fault';det='Outputs off · '+s.err;}
    else if(s.mode==='gait'&&s.test){state='TESTING';cls='walking';det=['','Forward','Backward','Crab left','Crab right'][s.test]+' · one cycle';}
    else if(s.mode==='gait'){state='WALKING';cls='walking';det=`drive ${s.drive} · cycle ${(s.tempo?params&&params.sport:params&&params.eco)/1000||'?'} s`;}
    else if(s.mode==='enabling'){state='STANDING UP';cls='armed';det=`${on}/18 servos on`;}
    else if(s.mode==='park'){state='SITTING';cls='armed';det='Lowering, then outputs off';}
    else if(s.mode==='hold'){state=on===18?'READY':'HOLDING';cls='armed';det=`${on}/18 servos holding`;}
    else {state='OUTPUTS OFF';det=s.err==='heartbeat'?'Dropped by link watchdog':(s.err==='parked'?'Parked':'Safe · servos limp');}
    det+=` · limit ${s.cap} µs/s${s.auto?' (auto)':''}`;}
  else if(status===null&&link.state==='lost'){state='LINK LOST';cls='fault';det='The robot switches outputs off after 1 s without messages';}
  big.textContent=state;detail.textContent=det;ro.className='readout '+cls;
  $('phase-bar').style.width=(!lost&&s.mode==='gait'?Math.round(s.phase*100):0)+'%';
  const arm=$('arm-pill');arm.className='pill state '+(on?'armed':'');arm.textContent=on?`ARMED ${on}/18`:'OUTPUTS OFF';
  // fault / watchdog banner
  const fb=$('fault');
  if(!lost&&!s.ready){fb.hidden=false;fb.className='banner';$('fault-text').textContent=HX.faultText(s.err);$('recover').hidden=false;}
  else if(!lost&&!on&&s.err==='heartbeat'){fb.hidden=false;fb.className='banner warn';$('fault-text').textContent=HX.faultText('heartbeat');$('recover').hidden=true;}
  else fb.hidden=true;
  $('i2c-state').textContent=lost?'—':(s.ready?`I2C ${s.i2c} kHz`:'FAULT');
  $('setup-state').textContent=lost?'—':(s.confirmed&&s.dirok?'SETUP OK':'SETUP NEEDED');
  // tests
  for(const tag of document.querySelectorAll('[data-tested]')){const b=1<<(Number(tag.dataset.tested)-1);const done=!lost&&(s.tested&b);tag.textContent=lost?'—':(done?'✓ TESTED':'NOT TESTED');tag.className='tag '+(lost?'':(done?'done':'todo'));}
  // availability
  const holding=!lost&&s.ready&&s.mode==='hold',full=!lost&&s.out===ALL;
  const can={stand:!lost&&s.ready&&s.mode!=='gait'&&s.mode!=='park'&&s.mode!=='enabling'&&!(full&&holding),ready:holding&&on>0,park:full&&holding};
  for(const b of document.querySelectorAll('[data-act]'))b.disabled=!can[b.dataset.act];
  for(const b of document.querySelectorAll('[data-test]'))b.disabled=!(full&&holding);
  const js=$('joystick');js.setAttribute('aria-disabled',!(full&&s&&(s.mode==='hold'||s.mode==='gait')&&!s.test));
  $('drive-state').textContent=lost?'IDLE':(s.mode==='gait'?(s.test?'TEST':'WALKING'):(full&&holding?'READY TO DRIVE':'IDLE'));
  // speed limit report
  const capBox=$('cap-box');const lim=!lost&&s.limiting;capBox.className='cap'+(lim?' limiting':'');
  if(!lost){const need=s.need;$('tempo-note').textContent=`needs ≈ ${need} µs/s`;
    if(lim)say(`Speed limit ${s.cap} µs/s is below what this tempo needs (≈${need} µs/s): the steps are being slowed/shortened. Raise the limit or pick Eco.`,'warn');
    else if(s.clip>=0&&s.mode==='gait'&&Date.now()-lastMsgAt>3000)say('A joint reached its saved limit during the step; motion is clamped there.','warn');}
  $('outputs-off').disabled=lost&&!link.preview?false:false;}
function popcount(n){let c=0;n=Number(n)||0;while(n){c+=n&1;n>>>=1;}return c;}

// ---------------------------------------------------------------- controls
$('eco').onclick=()=>{prefs.tempo=0;savePrefs();setPressed();send(`GCONFIG ${prefs.cap} 0`);};
$('sport').onclick=()=>{prefs.tempo=1;savePrefs();setPressed();send(`GCONFIG ${prefs.cap} 1`);};
$('cap').oninput=()=>{let v=Number($('cap').value);if(v>0&&v<100)v=100;prefs.cap=v;setPressed();};
$('cap').onchange=()=>{savePrefs();send(`GCONFIG ${prefs.cap} ${prefs.tempo}`);};
$('drive-mode').onchange=()=>{prefs.mode=$('drive-mode').value;savePrefs();setPressed();};
$('outputs-off').onclick=async()=>{stickRelease(true);const r=await send('OFF',{urgent:true});if(/^OK/.test(r))say('Outputs off. Servos are limp.');};
$('recover').onclick=async()=>{const r=await send('RECOVER');if(/^OK/.test(r))say('Controller recovered. Stand up again when ready.');};
for(const b of document.querySelectorAll('[data-act]'))b.addEventListener('click',async()=>{
  const act=b.dataset.act;
  if(act==='stand'){const r=await send('POWER 63 1');if(/^OK/.test(r))say('Standing up: servos come on one at a time, then ease to ready.');}
  if(act==='ready'){const r=await send('READY');if(/^OK/.test(r))say('Easing back to the ready pose.');}
  if(act==='park'){const r=await send('PARK');if(/^OK/.test(r))say('Sitting down slowly; outputs switch off when done.');}});
for(const b of document.querySelectorAll('[data-test]'))b.addEventListener('click',async()=>{
  const n=b.dataset.test;const r=await send('GTEST '+n);if(/^OK/.test(r))say('Running one '+['','forward','backward','crab-left','crab-right'][n]+' cycle. It stops by itself.');});

// ---------------------------------------------------------------- joystick
const stick={active:false,x:0,y:0,lastSent:'',lastAt:0,pointer:null};
const js=$('joystick'),knob=$('knob');
function stickVector(clientX,clientY){const r=js.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,rad=r.width/2-24;
  let x=(clientX-cx)/rad,y=-(clientY-cy)/rad;const m=Math.hypot(x,y);if(m>1){x/=m;y/=m;}return [x,y];}
function driveFor(x,y){const dz=(v)=>Math.abs(v)<0.12?0:Math.sign(v)*(Math.abs(v)-0.12)/0.88;x=dz(x);y=dz(y);
  const q=(v)=>Math.round(Math.max(-1,Math.min(1,v))*100);
  return prefs.mode==='walk'?[q(y),q(x),0]:[q(y),0,q(x)];}
function showStick(){const r=js.getBoundingClientRect(),rad=r.width/2-24;knob.style.transform=`translate(${stick.x*rad}px,${-stick.y*rad}px)`;
  $('x-value').textContent=(stick.x>=0?'+':'')+stick.x.toFixed(2);$('y-value').textContent=(stick.y>=0?'+':'')+stick.y.toFixed(2);}
function pushDrive(force){if(!stick.active)return;const d=driveFor(stick.x,stick.y).join(' ');const now=Date.now();
  if(!force&&d===stick.lastSent&&now-stick.lastAt<250)return;if(!force&&now-stick.lastAt<90)return;
  stick.lastSent=d;stick.lastAt=now;send('GDRIVE '+d,{coalesce:'drive'});}
function stickRelease(silent){if(!stick.active)return;stick.active=false;stick.x=stick.y=0;showStick();stick.lastSent='';send('GSTOP',{coalesce:'drive',quiet:silent});}
js.addEventListener('pointerdown',(e)=>{if(js.getAttribute('aria-disabled')==='true'){say('Stand up first (all 18 servos at ready), and run the one-cycle test for each direction.','warn');return;}
  js.setPointerCapture(e.pointerId);stick.pointer=e.pointerId;stick.active=true;[stick.x,stick.y]=stickVector(e.clientX,e.clientY);showStick();pushDrive(true);});
js.addEventListener('pointermove',(e)=>{if(!stick.active||e.pointerId!==stick.pointer)return;[stick.x,stick.y]=stickVector(e.clientX,e.clientY);showStick();pushDrive(false);});
for(const ev of ['pointerup','pointercancel','lostpointercapture'])js.addEventListener(ev,()=>stickRelease(false));
setInterval(()=>pushDrive(false),120);   // keep-alive + rate-limited updates while held
const keys={};js.addEventListener('keydown',(e)=>{const k={ArrowUp:[0,1],ArrowDown:[0,-1],ArrowLeft:[-1,0],ArrowRight:[1,0]}[e.key];if(!k||js.getAttribute('aria-disabled')==='true')return;e.preventDefault();keys[e.key]=k;
  stick.active=true;stick.x=Object.values(keys).reduce((a,v)=>a+v[0],0);stick.y=Object.values(keys).reduce((a,v)=>a+v[1],0);showStick();pushDrive(true);});
js.addEventListener('keyup',(e)=>{delete keys[e.key];if(!Object.keys(keys).length)stickRelease(false);});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stickRelease(true);});

setPressed();render();
if(/[?&]autoconnect=1/.test(location.search))connect();
window.HXDeck={link,get status(){return status;}};
})();
