'use strict';
// Same-origin controller transport. Connection only observes; enabling is a separate explicit action.
(()=>{
 let live=false,state=null,seq=0,session=crypto.getRandomValues(new Uint32Array(1))[0]||1,timer=null,inflight=null,generation=0,action=0,routine=0,desired=0,pendingPreset=null,lease=false;
 const baseRender=render,baseStop=stop,baseVector=vector;
 const baseEnable=$('enable').onclick,baseMode=$('mode').onchange;
 const buttons=[...document.querySelectorAll('.routine')],originals=buttons.map(b=>b.onclick);
 const modeId=()=>({normal:0,crab:1,roll:2})[$('mode').value]??0;
 const owned=()=>state?.owner===session;
 const performing=()=>state&&(state.routine>=0||state.queuedRoutine>=0||state.transition);
 const canDrive=()=>live&&lease&&state?.enabled&&owned()&&!performing()&&!state.fault&&!document.hidden;
 function body(act=0){return new URLSearchParams({session,seq:++seq,mode:desired,x:canDrive()?x:0,y:canDrive()?y:0,gain:Number($('limit').value)/100,leg:state?.selectedLeg??0,lift:0,action:act,routine});}
 function halt(){action=0;pendingPreset=null;if(live&&owned()){fetch('/api/command',{method:'POST',body:body(2),keepalive:true}).catch(()=>{});}lease=false;}
 stop=function(message){if(live)halt();baseStop(message);};
 vector=function(a,b){if(live&&!canDrive()){a=b=0;}baseVector(a,b);};
 render=function(){baseRender();if(!live)return;enabled=canDrive();active=null;document.querySelector('.connection').innerHTML='<i></i> ESP32 LINK <span>DRY-RUN CONTROLLER</span>';$('armed').textContent=state.fault?'FAULT':performing()?'BUSY':state.enabled?'ENABLED':'PAUSED';$('enable').textContent=state.enabled?'Pause controller':'Wake & enable controller';$('enable').disabled=!!(state.fault||performing()||(!owned()&&state.owner&&state.ageMs<1000));$('joystick').setAttribute('aria-disabled',String(!canDrive()));$('mode').disabled=!!performing();buttons.forEach(b=>{b.disabled=!!(performing()||state.fault||(!owned()&&state.enabled));});$('pose').textContent='ESP32 / COMMANDED';status(state.message||'ESP32 connected. Motion remains disabled until enabled.');};
 function lose(){live=false;generation++;clearTimeout(timer);inflight?.abort();lease=false;action=0;pendingPreset=null;baseStop('Connection lost.');$('enable').disabled=false;$('mode').disabled=false;buttons.forEach(b=>b.disabled=false);window.dispatchEvent(new Event('hexapod-link-lost'));}
 async function poll(){const gen=generation;if(!live||document.hidden)return;const abort=new AbortController();inflight=abort;const timeout=setTimeout(()=>abort.abort(),1200);
 try{let act=action;action=0;if(pendingPreset!==null&&state.mode===4&&!performing()&&state.enabled){act=4;routine=pendingPreset;pendingPreset=null;}const sending=act!==0||lease&&(state.enabled||desired!==state.mode||pendingPreset!==null);const response=await fetch(sending?'/api/command':'/api/state',sending?{method:'POST',body:body(act),signal:abort.signal}:{cache:'no-store',signal:abort.signal});const next=await response.json();if(gen!==generation)return;if(!response.ok&&response.status!==409)throw Error();if(!validController(next)||next.hardwareOutput!==false)throw Error();state=next;if(sending&&!state.accepted){lease=false;pendingPreset=null;baseStop(state.message||'Controller rejected command.');}enabled=canDrive();active=null;render();}
 catch{if(gen===generation)lose();}finally{clearTimeout(timeout);if(gen===generation&&live)timer=setTimeout(poll,100);}}
 window.hexapodLink={attach(initial){if(initial.hardwareOutput!==false){throw Error('This interface is validated for dry-run firmware only.');}state=initial;live=true;lease=false;desired=initial.mode;generation++;active=null;enabled=false;render();poll();},detach(){halt();live=false;generation++;clearTimeout(timer);inflight?.abort();$('enable').disabled=false;$('mode').disabled=false;buttons.forEach(b=>b.disabled=false);}};
 $('enable').onclick=()=>{if(!live)return baseEnable();release();lease=true;action=state.enabled?2:8;desired=state.enabled?state.mode:0;};
 $('mode').onchange=()=>{if(!live)return baseMode();release();desired=modeId();lease=true;};
 const ids={bow:0,sway:1,breathe:2,park:3,wake:4,jab:5};buttons.forEach((b,i)=>b.onclick=()=>{if(!live)return originals[i]();release();lease=true;routine=ids[b.dataset.id];if(routine===4){desired=0;action=8;}else if(routine===3){desired=4;action=7;}else if(state.enabled){desired=4;pendingPreset=routine;}else status('Wake the controller before running a preset.');});
 document.addEventListener('visibilitychange',()=>{if(!live)return;if(document.hidden){halt();}else{lose();}});
 window.addEventListener('pagehide',halt);
})();
