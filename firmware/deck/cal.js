// P3DRO calibration page.
(function(){
'use strict';
const $=(id)=>document.getElementById(id);
const link=HX.makeLink();
const LEGS=['LF','LM','LR','RF','RM','RR'],JOINTS=['hip','knee','foot'];
const name=(id)=>LEGS[Math.floor(id/3)]+' '+JOINTS[id%3];
let cal=null,status=null,pose=null,sel=-1,pending=null,testsRun=Number(sessionStorage.getItem('hx-tests')||0);
function say(t,k){const m=$('msg');m.textContent=t;m.className='msg'+(k?' '+k:'');}
async function send(cmd,opts){try{const r=await link.command(cmd,opts);if(/^ERR/.test(r)&&!(opts&&opts.quiet))say(r.replace(/^ERR\s*/,''),'bad');return r;}
  catch(e){if(!(opts&&opts.quiet))say('No reply yet — retrying ('+e.message+')','warn');return 'ERR link';}}
const bit=(m,id)=>(Number(m)>>>id&1)===1;
$('deck-link').href=link.preview?'index.html?preview=1':'/';
link.on((s)=>{const p=$('link-pill');const map={live:['live',link.preview?'PREVIEW':'LINK LIVE'],connecting:['warn','CONNECTING'],unstable:['warn','LINK RETRYING'],lost:['bad','LINK LOST'],offline:['','OFFLINE']};
  const [c,t]=map[s]||['',s];p.className='pill '+c;p.textContent=t;});

function buildLegs(){const box=$('legs');box.innerHTML='';
  for(let l=0;l<6;l++){const d=document.createElement('div');d.className='leg';d.innerHTML=`<h3>${LEGS[l]} · ${['LEFT FRONT','LEFT MIDDLE','LEFT REAR','RIGHT FRONT','RIGHT MIDDLE','RIGHT REAR'][l]}</h3>`;
    for(let j=0;j<3;j++){const id=l*3+j,b=document.createElement('button');b.type='button';b.className='joint';b.dataset.id=id;
      b.innerHTML=`<b>${JOINTS[j].toUpperCase()}</b><small data-v></small><span class="marks" data-m></span>`;b.onclick=()=>select(id);d.appendChild(b);}
    box.appendChild(d);}}
function render(){
  if(cal){let ready=0,dirs=0;
    for(const b of document.querySelectorAll('.joint')){const id=Number(b.dataset.id);const on=status&&bit(status.out,id);
      b.setAttribute('aria-pressed',id===sel);
      b.querySelector('[data-v]').textContent=`${cal.centers[id]} µs · ${cal.minimum[id]}–${cal.maximum[id]}${bit(cal.invert,id)?' · INV':''}`;
      const r=bit(cal.confirmed,id),d=bit(cal.dirok,id);ready+=r;dirs+=d;
      b.querySelector('[data-m]').innerHTML=`<span class="${r?'ok':'no'}">${r?'✓':'·'}R</span> <span class="${d?'ok':'no'}">${d?'✓':'·'}D</span>${on?' <span class="live">●</span>':''}`;}
    $('summary').textContent=`${ready}/18 READY · ${dirs}/18 DIR`;}
  if(status){const on=popcount(status.out);const arm=$('arm-pill');arm.className='pill state '+(on?'armed':'');arm.textContent=on?`ARMED ${on}/18`:'OUTPUTS OFF';
    const fb=$('fault');if(!status.ready){fb.hidden=false;fb.className='banner';$('fault-text').textContent=HX.faultText(status.err);$('recover').hidden=false;}
    else if(!on&&status.err==='heartbeat'){fb.hidden=false;fb.className='banner warn';$('fault-text').textContent=HX.faultText('heartbeat');$('recover').hidden=true;}else fb.hidden=true;
    for(const t of document.querySelectorAll('[data-tested]')){const done=Number(status.tested)>>(Number(t.dataset.tested)-1)&1;t.textContent=done?'✓':'NOT TESTED';t.className='tag '+(done?'done':'todo');}
    const canTest=status.out===262143&&status.mode==='hold';for(const b of document.querySelectorAll('[data-test]'))b.disabled=!canTest;}
  $('tests-count').textContent=`${testsRun} RUN HERE`;
  const has=sel>=0&&cal;for(const id of ['slider','save-ready','release','wiggle','invert','dir-ok','save-limits','lim-min','lim-max'])$(id).disabled=!has;
  for(const b of document.querySelectorAll('[data-n]'))b.disabled=!has;
  if(has){$('sel-name').textContent=name(sel).toUpperCase();const p=pending!=null?pending:cal.centers[sel];$('pulse').textContent=p+' µs';
    $('sel-saved').textContent=`saved ready ${cal.centers[sel]} µs`;$('sel-limits').textContent=`limits ${cal.minimum[sel]}–${cal.maximum[sel]}`;
    const s=$('slider');s.min=cal.minimum[sel];s.max=cal.maximum[sel];if(document.activeElement!==s)s.value=p;
    $('invert').checked=bit(cal.invert,sel);
    $('dir-hint').textContent=['Hip +: the foot should swing toward the HEAD.','Knee +: the foot should LIFT up.','Foot +: the foot should TUCK inward, under the body.'][sel%3]+' Wiggle, watch, flip Invert if needed, then save.';}}
function popcount(n){let c=0;n=Number(n)||0;while(n){c+=n&1;n>>>=1;}return c;}
async function refreshCal(){const r=await send('CALDATA',{quiet:true});if(!/^CALDATA/.test(r))return;const p=HX.parseLine(r);
  cal={confirmed:p.confirmed,invert:p.invert,dirok:p.dirok,centers:HX.list(p.centers),minimum:HX.list(p.minimum),maximum:HX.list(p.maximum)};render();}
async function refreshParams(){const r=await send('GPARAM',{quiet:true});if(!/^GPARAM/.test(r))return;const p=HX.parseLine(r);
  for(const i of document.querySelectorAll('[data-p]'))i.value=p[i.dataset.p];$('need').textContent=`NEEDS ${p.needEco}/${p.needSport} µs/s`;}
async function poll(){for(;;){const r=await send('GSTATUS',{coalesce:'status',quiet:true});if(/^GAIT/.test(r)){const prev=status;status=HX.parseLine(r);
    if(prev&&prev.mode==='gait'&&status.mode!=='gait')refreshCal();render();}await new Promise(r=>setTimeout(r,450));}}
async function connect(){$('connect').disabled=true;try{await link.connect();}catch(e){$('connect').disabled=false;say('Could not connect: '+e.message,'bad');return;}
  $('connect').textContent='Connected';buildLegs();await refreshCal();await refreshParams();say('Connected. Tap a joint to start.');poll();}
$('connect').onclick=connect;

async function select(id){sel=id;pending=null;render();
  if(status&&bit(status.out,id)){pending=await currentTarget(id);say(`${name(id)} is already holding at ${pending} µs. Nudge it, or save.`);render();return;}
  const r=await send(`JSET ${id} ${cal.centers[id]} 400`);
  if(/^OK/.test(r)){pending=cal.centers[id];say(`${name(id)} energised at its saved ${pending} µs. Other powered joints keep holding.`);}render();}
async function currentTarget(id){const r=await send('STATE',{quiet:true});if(!/^POSE/.test(r))return cal.centers[id];const p=HX.parseLine(r);const t=HX.list(p.target);return t[id]||cal.centers[id];}
let moveTimer=null;
function moveTo(v){if(sel<0)return;v=Math.max(cal.minimum[sel],Math.min(cal.maximum[sel],Math.round(v)));pending=v;render();
  clearTimeout(moveTimer);moveTimer=setTimeout(()=>send(`JSET ${sel} ${v} 600`,{coalesce:'jset'}),40);}
for(const b of document.querySelectorAll('[data-n]'))b.onclick=()=>moveTo((pending!=null?pending:cal.centers[sel])+Number(b.dataset.n));
$('slider').oninput=()=>moveTo(Number($('slider').value));
$('save-ready').onclick=async()=>{const v=pending!=null?pending:cal.centers[sel];if(pending==null)await send(`JSET ${sel} ${v} 400`);const r=await send(`CALSAVE ${sel} ${v}`);if(/^OK/.test(r)){say(`${name(sel)} ready pulse saved: ${v} µs.`);await refreshCal();}};
$('release').onclick=async()=>{const r=await send(`JOFF ${sel}`);if(/^OK/.test(r))say(`${name(sel)} released (limp).`);};
$('wiggle').onclick=async()=>{const base=pending!=null?pending:cal.centers[sel];const sign=bit(cal.invert,sel)?-1:1;
  const t=Math.max(cal.minimum[sel],Math.min(cal.maximum[sel],base+sign*40));await send(`JSET ${sel} ${t} 300`);await new Promise(r=>setTimeout(r,700));await send(`JSET ${sel} ${base} 300`);
  say('Moved in the + direction and back. Did it match the description? If not, toggle Invert and wiggle again.');};
$('invert').onchange=async()=>{const r=await send(`DIR ${sel} ${$('invert').checked?1:0}`);await refreshCal();
  if(/^OK/.test(r)){
    say('Invert saved (and direction marked checked). Wiggle again to be sure.');}};
$('dir-ok').onclick=async()=>{const r=await send(`DIR ${sel} ${$('invert').checked?1:0}`);if(/^OK/.test(r)){say(`${name(sel)} direction saved.`);await refreshCal();}};
$('save-limits').onclick=async()=>{const lo=Number($('lim-min').value),hi=Number($('lim-max').value);const r=await send(`LIMIT ${sel} ${lo} ${hi}`);if(/^OK/.test(r)){say('Limits saved.');await refreshCal();}};
$('hold-all').onclick=async()=>{const r=await send('POWER 63 0');if(/^OK/.test(r))say('Energising all joints one at a time at their saved ready pulses.');};
$('outputs-off').onclick=async()=>{const r=await send('OFF',{urgent:true});if(/^OK/.test(r)){say('Outputs off.');}};
$('recover').onclick=async()=>{const r=await send('RECOVER');if(/^OK/.test(r))say('Recovered.');};
for(const b of document.querySelectorAll('[data-test]'))b.onclick=async()=>{const r=await send('GTEST '+b.dataset.test);if(/^OK/.test(r)){testsRun++;sessionStorage.setItem('hx-tests',testsRun);say('Test cycle running; it stops by itself.');render();}};
$('save-params').onclick=async()=>{const v=['stride','lift','tuck','reach','mix','eco','sport','park'].map(k=>Number(document.querySelector(`[data-p=${k}]`).value));
  const r=await send('GPARAM '+v.join(' '));if(/^OK/.test(r)){say('Gait settings saved. Re-run the one-cycle tests.');await refreshParams();}};
$('default-params').onclick=()=>{const d={stride:150,lift:140,tuck:40,reach:120,mix:50,eco:2400,sport:1200,park:220};for(const i of document.querySelectorAll('[data-p]'))i.value=d[i.dataset.p];say('Defaults filled in; press Save to apply.');};
$('export').onclick=()=>{if(!cal)return;const blob=new Blob([JSON.stringify({format:'hx01-calibration-v6',saved:new Date().toISOString(),cal,params:Object.fromEntries([...document.querySelectorAll('[data-p]')].map(i=>[i.dataset.p,Number(i.value)]))},null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='hx01-calibration.json';a.click();};
$('import').onchange=async()=>{const f=$('import').files[0];if(!f)return;try{const j=JSON.parse(await f.text());const c=j.cal;
  for(let id=0;id<18;id++){const r=await send(`CALSET ${id} ${c.centers[id]} ${c.minimum[id]} ${c.maximum[id]} ${bit(c.invert,id)?1:0} ${bit(c.dirok,id)?1:0} ${bit(c.confirmed,id)?1:0}`);if(!/^OK/.test(r))throw new Error(r);}
  if(j.params){const p=j.params;await send(`GPARAM ${p.stride} ${p.lift} ${p.tuck} ${p.reach} ${p.mix} ${p.eco} ${p.sport} ${p.park}`);}
  say('Backup restored.');await refreshCal();await refreshParams();}catch(e){say('Restore failed: '+e.message+' (outputs must be off)','bad');}};
// fill limit inputs on selection
const origRender=render;render=function(){origRender();if(sel>=0&&cal&&document.activeElement!==$('lim-min')&&document.activeElement!==$('lim-max')){$('lim-min').value=cal.minimum[sel];$('lim-max').value=cal.maximum[sel];}};
buildLegs();render();connect();
})();
