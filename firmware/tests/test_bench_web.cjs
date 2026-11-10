const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../bench-web/app.js'),'utf8');
async function scenario(interrupt=false,live=false,count=1,confirmed=true,axis='both',stepSpeed=250){
  const elements={};const commands=[];let ctx;
  const document={hidden:false,getElementById(id){return elements[id]??={checked:false,disabled:false,textContent:'',scrollHeight:0,style:{},value:'100'};},addEventListener(){}};
  const poses={CENTER:'1500,1500,1500',STEP_LIFT:'1500,2000,1238',STEP_FORWARD:'1650,2000,1238',STEP_LOWER:'1650,1850,1238',STEP_RETURN:'1500,1850,1238'};
  let active=0,current='0,0,0';
  const mockWriter={async write(bytes){const cmd=new TextDecoder().decode(bytes).trim();commands.push(cmd);if(cmd==='OFF'){active=0;current='0,0,0';return;}if(cmd.startsWith('J ')){active=1;current=cmd.split(' ').slice(1,4).join(',');}if(poses[cmd]){active=1;current=poses[cmd];}if(interrupt&&cmd==='STEP_LIFT'){queueMicrotask(()=>vm.runInContext('stop()',ctx));return;}queueMicrotask(()=>vm.runInContext(`line(${JSON.stringify(`LEG ready=1 active=${active} current_us=${current} target_us=${current}`)})`,ctx));}};
  const win={addEventListener(){}};win.parent=win;
  ctx=vm.createContext({document,navigator:{serial:{}},window:win,location:{search:''},URLSearchParams,performance,TextEncoder,TextDecoder,setTimeout,clearTimeout,setInterval,clearInterval,console,mockWriter});
  vm.runInContext(source,ctx);
  assert.equal(elements.footTarget.min,1250);
  vm.runInContext("line('LIMITS min=1000,1000,1000 max=2000,2000,2000')",ctx);
  assert.equal(elements.footTarget.min,1000);
  assert(elements.step.disabled&&elements.center.disabled&&elements.connect.disabled);
  assert.deepEqual(commands,[]);
  document.getElementById("stepSpeed").value=String(stepSpeed);
  document.getElementById("repeatCount").value=String(count);document.getElementById("poseChecked").checked=confirmed;
  vm.runInContext('writer=mockWriter;connected=true;$("armed").checked=true;controls()',ctx);
  document.getElementById('calibrationJoint').value=axis;
  if(live){await vm.runInContext('$("live").onclick()',ctx);vm.runInContext('stickX=1;stickY=-1;$("speed").value=5000',ctx);await new Promise(r=>setTimeout(r,250));await vm.runInContext('stop()',ctx);}else await vm.runInContext('run(true)',ctx);
  await new Promise(r=>setTimeout(r,10));
  if(live){if(axis==='both')assert(commands.some(c=>c.startsWith('J 2000 2000 1500 100')));else {const moves=commands.filter(c=>c.startsWith('J ')).map(c=>c.split(' ').slice(1).map(Number));assert(moves.length);for(const [h,k,f,rate] of moves){assert.equal(rate,2);if(axis==='hip'){assert.equal(k,1500);assert.equal(f,1500);assert(h>1500&&h<1550);}if(axis==='knee'){assert.equal(h,1500);assert.equal(f,1500);assert(k>1500&&k<1550);}if(axis==='foot'){assert.equal(h,1500);assert.equal(k,1500);assert(f<1500&&f>1450);}}}const count=commands.length;await new Promise(r=>setTimeout(r,150));assert.equal(commands.length,count);}
  else if(count>1&&!confirmed){assert.deepEqual(commands,[]);}
  else if(interrupt){assert(!commands.includes('STEP_FORWARD'));assert(commands.includes('OFF'));}
  else assert.deepEqual(commands,['STATUS','CENTER','STEP_RATE '+stepSpeed/50,...Array.from({length:count},()=>['STEP_LIFT','STEP_FORWARD','STEP_LOWER','STEP_RETURN']).flat(),'OFF','STATUS']);
  assert.equal(active,0);
}
(async()=>{await scenario();await scenario(false,false,1,true,'both',5000);await scenario(true);await scenario(false,true);await scenario(false,false,3);await scenario(false,false,3,false);for(const axis of ['hip','knee','foot'])await scenario(false,true,1,true,axis);console.log('PASS: startup locked, full step order, reported targets, stop cancellation, outputs off');})().catch(e=>{console.error(e);process.exit(1);});

