'use strict';
const $=id=>document.getElementById(id);
const routines=[['wake','↗','Wake & stretch','Unfold. Rise. Say hello.',8],['park','↘','Curl up & park','A well-earned little rest.',6],['jab','⇢','Front-leg jab','A little attitude.',5],['bow','⌄','A polite bow','Make an entrance.',4],['sway','↔','Side to side','Find your rhythm.',6],['breathe','≋','Take a breath','Slow down. Reset.',6]];
$('routines').innerHTML=routines.map(([id,symbol,name,desc,time])=>`<button class="routine" data-id="${id}" aria-pressed="false"><span class="symbol">${symbol}</span><span><strong>${name}</strong><small>${desc}</small></span><span class="arrow">${String(time).padStart(2,'0')}s</span></button>`).join('');
$('phase-bars').innerHTML='<i></i>'.repeat(24);
let enabled=false,x=0,y=0,pointer=null,active=null,start=0,parked=false,phase=0,last=0;
const keys=new Set(),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function status(s){$('status').textContent=s;}
function render(){const mode=$('mode').value;const speed=enabled&&!active?(mode==='normal'?Math.abs(y):mode==='crab'?Math.hypot(x,y):0)*35*Number($('limit').value)/100:0;$('speed').innerHTML=`${speed.toFixed(1)} <small>mm/s</small>`;$('x').textContent=(x>=0?'+':'')+x.toFixed(2);$('y').textContent=(y>=0?'+':'')+y.toFixed(2);$('knob').style.transform=`translate(${x*Math.max(0,($("joystick").clientWidth-$("knob").clientWidth)/2-5)}px,${-y*Math.max(0,($("joystick").clientWidth-$("knob").clientWidth)/2-5)}px)`;$('armed').textContent=enabled?'ENABLED':'PAUSED';$('armed').style.color=enabled?'var(--cyan)':'';$('enable').innerHTML=enabled?'Pause simulation <span>Ⅱ</span>':'Enable simulation <span>→</span>';$('joystick').setAttribute('aria-disabled',String(!enabled||!!active));$('scene-mode').textContent={normal:'TRIPOD',crab:'CRABWALK',roll:'BODY ATTITUDE'}[mode];$('direction').textContent=mode==='roll'?'PITCH':'FORWARD';$('gait').innerHTML=mode==='roll'?'Planted <small>6 feet</small>':'Tripod <small>3 + 3</small>';$('pose').textContent=active?active[2].toUpperCase():enabled?'READY':parked?'PARKED':'STANDBY';document.querySelectorAll('.routine').forEach(b=>{const selected=b.dataset.id===active?.[0];b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});}
function release(){const p=pointer;pointer=null;if(p!==null&&$('joystick').hasPointerCapture(p))$('joystick').releasePointerCapture(p);keys.clear();x=y=0;render();}
function stop(message='Motion stopped. Simulation paused.'){enabled=false;active=null;release();status(message);}
function vector(a,b){const n=Math.max(1,Math.hypot(a,b));x=a/n;y=b/n;render();}
function move(e){const r=$('joystick').getBoundingClientRect();vector((e.clientX-r.left-r.width/2)/60,-(e.clientY-r.top-r.height/2)/60);}
$('joystick').addEventListener('pointerdown',e=>{if(!enabled||active||pointer!==null)return;e.preventDefault();pointer=e.pointerId;$('joystick').setPointerCapture(pointer);move(e);});
$('joystick').addEventListener('pointermove',e=>{if(pointer===e.pointerId)move(e);});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('joystick').addEventListener(name,e=>{if(pointer===e.pointerId)release();});
function keyboard(){vector(Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')),Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown')));}
$('joystick').addEventListener('keydown',e=>{if(!e.key.startsWith('Arrow')||!enabled||active)return;e.preventDefault();keys.add(e.key);keyboard();});
$('joystick').addEventListener('keyup',e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();keys.delete(e.key);keyboard();});
$('joystick').addEventListener('blur',release);
$('enable').onclick=()=>{if(enabled){stop();return;}enabled=true;parked=false;render();status('Simulation enabled. Drag the joystick or focus it and hold the arrow keys.');};
$('stop').onclick=()=>stop();document.addEventListener('keydown',e=>{if(e.key==='Escape')stop();});
$('mode').onchange=()=>{active=null;release();status(`${$('mode').selectedOptions[0].text} selected. Browser simulation only.`);};
$('limit').oninput=()=>{$('limit-value').textContent=$('limit').value+'%';render();};
document.querySelectorAll('.routine').forEach(b=>b.onclick=()=>{release();active=routines.find(r=>r[0]===b.dataset.id);enabled=true;start=performance.now();render();status(`${active[2]} · ${active[4]} second illustrative animation. Stop cancels immediately.`);});
window.addEventListener('blur',()=>stop('Simulation paused while this window is inactive.'));document.addEventListener('visibilitychange',()=>{if(document.hidden)stop('Simulation paused while this tab is hidden.');});
$('about').onclick=()=>{stop('Simulation paused while you view project details.');$('about-dialog').showModal();};$('close').onclick=$('done').onclick=()=>$('about-dialog').close();
const ns='http://www.w3.org/2000/svg';const legEls=[];
for(let i=0;i<6;i++){const g=document.createElementNS(ns,'g');g.innerHTML='<path fill="none" stroke="#0a1016" stroke-width="21" stroke-linejoin="round"/><path fill="none" stroke="#496774" stroke-width="14" stroke-linejoin="bevel"/><path fill="none" stroke="#8aa7b2" stroke-width="2"/><circle r="8" fill="#182c36" stroke="#78a3ae" stroke-width="2"/><circle r="4" fill="#67f5dc"/>';$('legs').appendChild(g);legEls.push(g);}
function animate(now){const dt=Math.min((now-last)/1000,.05);last=now;let amount=!document.body.classList.contains('usb-live')&&enabled&&!active?Math.hypot(x,y):0;phase+=dt*(1+Number($('limit').value)/100)*amount*5;let tilt=0,scale=parked?.80:1,sway=0,jab=0;let p=active?Math.min((now-start)/(active[4]*1000),1):0;
if(active){const wave=Math.sin(p*Math.PI);switch(active[0]){case 'wake':scale=.80+.20*p;sway=Math.sin(p*Math.PI*6)*wave*5;break;case 'park':scale=1-.2*p;break;case 'bow':tilt=wave*12;break;case 'sway':sway=Math.sin(p*Math.PI*4)*12;break;case 'breathe':scale=1-Math.sin(p*Math.PI*4)*.035;break;case 'jab':jab=wave*35;break;}}
if(enabled&&!active&&$('mode').value==='roll'){tilt=y*10;sway=x*12;amount=0;}
if(reduced){tilt=sway=jab=0;scale=parked?.8:1;amount=0;}
$('body').setAttribute('transform',`translate(${sway} ${tilt}) translate(300 205) scale(${scale} ${scale-tilt/250}) translate(-300 -205)`);
for(let i=0;i<6;i++){const side=i<3?-1:1,row=i%3;const step=amount*Math.sin(phase+(i%2)*Math.PI)*13;const sx=300+side*49*scale+sway,sy=160+row*39+tilt;const mx=300+side*(row===1?126:109)*scale,my=133+row*96+step;const fx=300+side*(row===1?193:165)*scale,fy=105+row*120+step-(row===0?jab:0);const d=`M${sx},${sy} L${mx},${my} L${fx},${fy}`;const children=legEls[i].children;for(let j=0;j<3;j++)children[j].setAttribute('d',d);children[3].setAttribute('cx',mx);children[3].setAttribute('cy',my);children[4].setAttribute('cx',fx);children[4].setAttribute('cy',fy);}
const progress=active?p:amount?(phase%(Math.PI*2))/(Math.PI*2):0;document.querySelectorAll('#phase-bars i').forEach((el,i)=>el.classList.toggle('on',i<progress*24));$('phase').textContent=active?Math.round(p*100)+'%':amount?'ACTIVE':'IDLE';
if(active&&p>=1){const completed=active;parked=completed[0]==='park';active=null;enabled=!parked;render();status(`${completed[2]} complete. ${parked?'Simulation parked.':'Ready for your next move.'}`);}
requestAnimationFrame(animate);}
render();requestAnimationFrame(animate);
