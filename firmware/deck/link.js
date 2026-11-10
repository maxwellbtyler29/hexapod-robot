// P3DRO link layer: session claim, sequenced commands, retry-without-disconnect,
// status parsing, and an offline preview robot (?preview=1).
(function(root){
'use strict';
const HEADER='control-v6';
function parseLine(line){ // "GAIT v=2 a=1 b=x,y" -> {kind:'GAIT', a:1, b:'x,y'}
  const parts=String(line||'').trim().split(/\s+/);const out={kind:parts[0]||''};
  for(const p of parts.slice(1)){const i=p.indexOf('=');if(i<1)continue;const k=p.slice(0,i),v=p.slice(i+1);
    out[k]=/^-?\d+(\.\d+)?$/.test(v)?Number(v):v;}
  return out;}
function list(v){return String(v||'').split(',').filter(Boolean).map(Number);}
const ERRORS={none:'',heartbeat:'Outputs dropped by the link watchdog (no message for 1 s). Stand up again when ready.',
  i2c:'Servo-board I2C write failed; outputs were switched off. Check the SDA/SCL wires and servo power, then press Recover.',
  boards:'Servo boards 0x40/0x41 not found. Check wiring and power, then press Recover.',
  prescale:'Servo board did not accept 50 Hz. Power-cycle the boards, then press Recover.',
  parked:'Parked. Outputs are off.'};
function faultText(code){return ERRORS[code]!==undefined?ERRORS[code]:('Controller reports: '+code);}

class HttpTransport{
  constructor(base){this.base=base||'';this.token='';this.seq=0;}
  async post(path,body,headers,timeoutMs){
    const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),timeoutMs||1200);
    try{const r=await fetch(this.base+path,{method:'POST',body,headers:Object.assign({'X-Hexapod':HEADER,'Content-Type':'text/plain'},headers||{}),signal:ctl.signal,cache:'no-store'});
      return {status:r.status,text:(await r.text()).trim()};}
    finally{clearTimeout(t);}}
  async claim(){const r=await this.post('/api/session','',{});if(r.status!==200)throw Object.assign(new Error(r.text||('HTTP '+r.status)),{status:r.status});this.token=r.text;this.seq=0;return true;}
  async send(command,seq){return this.post('/api/command',seq+'\n'+command,{'X-Session':this.token});}
}

// Serialised command queue. A failed request is retried with the SAME sequence
// number (the controller replays its cached reply), so a dropped Wi-Fi packet
// never causes a disconnect or a double move.
class Link{
  constructor(transport,opts){this.t=transport;this.opts=Object.assign({retries:3,backoffMs:150,lostAfterMs:4000,sleep:(ms)=>new Promise(r=>setTimeout(r,ms)),now:()=>Date.now()},opts||{});
    this.busy=false;this.queue=[];this.state='offline';this.lastOk=0;this.failStreak=0;this.listeners=[];}
  on(fn){this.listeners.push(fn);}
  emit(){for(const f of this.listeners)f(this.state,this);}
  setState(s){if(this.state!==s){this.state=s;this.emit();}}
  async connect(){this.setState('connecting');
    for(let i=0;;++i){try{await this.t.claim();this.lastOk=this.opts.now();this.failStreak=0;this.setState('live');return true;}
      catch(e){if(i>=this.opts.retries||e.status===409){this.setState('offline');throw e;}await this.opts.sleep(this.opts.backoffMs*(i+1));}}}
  // Returns the reply text. Rejects only after retries are exhausted (state 'unstable'/'lost', not disconnected).
  command(cmd,{coalesce,urgent}={}){
    if(coalesce){const old=this.queue.find(q=>q.key===coalesce);if(old){old.cmd=cmd;return old.promise;}}
    let res,rej;const promise=new Promise((a,b)=>{res=a;rej=b;});
    const job={cmd,key:coalesce,promise,res,rej};if(urgent)this.queue.unshift(job);else this.queue.push(job);this.pump();return promise;}
  async pump(){if(this.busy)return;this.busy=true;
    while(this.queue.length){const job=this.queue.shift();
      try{job.res(await this.exchange(job.cmd));}catch(e){job.rej(e);}}
    this.busy=false;}
  async exchange(cmd){
    const seq=++this.t.seq;let last;let reclaimed=false;
    for(let attempt=0;attempt<=this.opts.retries;++attempt){
      try{const r=await this.t.send(cmd,seq);
        if(r.status===200||(r.status===409&&/owns motion|stale/.test(r.text))||r.status===400){this.lastOk=this.opts.now();this.failStreak=0;this.setState('live');
          if(r.status!==200&&!/^ERR/.test(r.text))return 'ERR '+r.text;return r.text;}
        if(r.status===403&&/session/.test(r.text)&&!reclaimed){reclaimed=true;await this.t.claim();this.t.seq=0;return this.exchange(cmd);}
        last=new Error(r.text||('HTTP '+r.status));
      }catch(e){last=e;}
      ++this.failStreak;this.setState(this.opts.now()-this.lastOk>this.opts.lostAfterMs?'lost':'unstable');
      await this.opts.sleep(this.opts.backoffMs*(attempt+1));}
    throw last||new Error('no reply');}
}

// ---------------------------------------------------------------- preview robot
class MockRobot{ // behaves like firmware v6 closely enough for UI work and tests
  constructor(){this.centers=Array.from({length:18},(_,i)=>1500+((i*37)%60)-30);this.min=Array(18).fill(700);this.max=Array(18).fill(2300);
    this.confirmed=(1<<18)-1;this.invert=0x3FE00;this.dirok=(1<<18)-1;this.tested=0;this.out=0;this.cur=Array(18).fill(0);this.tgt=Array(18).fill(0);
    this.mode='off';this.err='none';this.gait={stride:150,lift:140,tuck:40,reach:120,mix:50,eco:2400,sport:1200,park:220};
    this.tempo=0;this.cap=0;this.phase=0;this.cycles=0;this.walking=0;this.test=0;this.drive=[0,0,0];this.ready=1;this.enQueue=[];this.last=Date.now();}
  need(t){const c=t?this.gait.sport:this.gait.eco,tsw=0.44*c/1000;return Math.round(Math.max(1.875*this.gait.stride/(0.65*tsw),1.5708*this.gait.lift/(0.3*tsw)+1.875*this.gait.reach/(0.65*tsw)*this.gait.mix/100));}
  tick(){const now=Date.now(),dt=Math.min(200,now-this.last);this.last=now;
    if(this.mode==='enabling'){if(this.enQueue.length){const id=this.enQueue.shift();this.out|=1<<id;this.cur[id]=this.centers[id];}else this.mode='hold';}
    if(this.mode==='gait'){this.phase=(this.phase+dt/(this.tempo?this.gait.sport:this.gait.eco))%1;this.cycles+=dt/(this.tempo?this.gait.sport:this.gait.eco);
      if(this.test&&this.cycles>=1.75){this.tested|=1<<(this.test-1);this.test=0;this.mode='hold';this.walking=0;}
      else if(!this.test&&!this.drive.some(Boolean)&&this.cycles>=this.stopAt){this.mode='hold';this.walking=0;}}
    if(this.mode==='park'&&now>this.parkAt){this.out=0;this.mode='off';this.err='parked';}
    for(let i=0;i<18;i++)if(this.out>>i&1)this.cur[i]+=(this.tgt[i]-this.cur[i])*0.5;}
  exec(cmd){this.tick();const [verb,...a]=cmd.trim().split(/\s+/);const n=a.map(Number);const ok=()=>'OK '+verb;
    const on=this.out!==0||this.mode==='enabling';
    switch(verb){
    case 'CAPS':return 'CAPS v=6 min=500 max=2500 joints=18 nvs=3 gait=2 drive=1 park=1 tests=4 wifi=1 preview=1';
    case 'GSTATUS':case 'STATUS':return `GAIT v=2 ready=${this.ready} out=${this.out} mode=${this.mode} walking=${this.walking} test=${this.test} phase=${this.phase.toFixed(3)} cycles=${this.cycles.toFixed(2)} tested=${this.tested} tempo=${this.tempo} cap=${this.cap||Math.round(this.need(this.tempo)*1.25+50)} auto=${this.cap?0:1} need=${this.need(this.tempo)} limiting=${this.cap&&this.mode==='gait'&&this.cap<this.need(this.tempo)?1:0} clip=-1 drive=${this.drive.map(v=>Math.round(v*100)).join(',')} blocked=0 confirmed=${this.confirmed===262143?1:0} dirok=${this.dirok===262143?1:0} i2c=400 err=${this.err}`;
    case 'CALDATA':return `CALDATA v=2 confirmed=${this.confirmed} invert=${this.invert} dirok=${this.dirok} centers=${this.centers} minimum=${this.min} maximum=${this.max}`;
    case 'GPARAM':if(!a.length){const g=this.gait;return `GPARAM v=1 stride=${g.stride} lift=${g.lift} tuck=${g.tuck} reach=${g.reach} mix=${g.mix} eco=${g.eco} sport=${g.sport} park=${g.park} needEco=${this.need(0)} needSport=${this.need(1)}`;}
      [this.gait.stride,this.gait.lift,this.gait.tuck,this.gait.reach,this.gait.mix,this.gait.eco,this.gait.sport,this.gait.park]=n;this.tested=0;return ok();
    case 'STATE':return `POSE v=4 ready=1 out=${this.out} current=${this.cur.map((v,i)=>this.out>>i&1?Math.round(v):0)} target=${this.tgt}`;
    case 'PING':return ok();
    case 'OFF':this.out=0;this.mode='off';this.walking=0;this.test=0;if(this.err!=='parked')this.err='none';return ok();
    case 'RECOVER':this.ready=1;this.err='none';return ok();
    case 'POWER':if(this.mode==='gait')return 'ERR POWER: wait for the current motion to finish';
      for(let l=0;l<6;l++)if(n[0]>>l&1)for(let j=0;j<3;j++){const id=l*3+j;this.tgt[id]=this.centers[id];if(!(this.out>>id&1))this.enQueue.push(id);}this.mode='enabling';this.err='none';return ok();
    case 'JSET':{const id=n[0];if(n[1]<this.min[id]||n[1]>this.max[id])return `ERR JSET: limit is ${this.min[id]}..${this.max[id]}`;if(!(this.out>>id&1)){this.out|=1<<id;this.cur[id]=n[1];}this.tgt[id]=n[1];this.mode='hold';this.err='none';return ok();}
    case 'JOFF':this.out&=~(1<<n[0]);if(!this.out)this.mode='off';return ok();
    case 'READY':for(let i=0;i<18;i++)if(this.out>>i&1)this.tgt[i]=this.centers[i];return ok();
    case 'CALSAVE':this.centers[n[0]]=n[1];this.confirmed|=1<<n[0];this.tested=0;return ok();
    case 'LIMIT':if(!(n[1]<n[2])||this.centers[n[0]]<n[1]||this.centers[n[0]]>n[2])return 'ERR LIMIT: saved ready pulse must stay inside the limits';this.min[n[0]]=n[1];this.max[n[0]]=n[2];this.tested=0;return ok();
    case 'DIR':if(n[1])this.invert|=1<<n[0];else this.invert&=~(1<<n[0]);this.dirok|=1<<n[0];this.tested=0;return ok();
    case 'CALSET':{const [id,c,lo,hi,inv,dk,cf]=n,b=1<<id;this.centers[id]=c;this.min[id]=lo;this.max[id]=hi;this.invert=inv?this.invert|b:this.invert&~b;this.dirok=dk?this.dirok|b:this.dirok&~b;this.confirmed=cf?this.confirmed|b:this.confirmed&~b;return ok();}
    case 'GCONFIG':this.cap=n[0];this.tempo=n[1];return ok();
    case 'GDRIVE':{this.drive=n.map(v=>v/100);const any=n.some(Boolean);if(this.mode==='gait'){if(!any)this.stopAt=Math.ceil(this.cycles*2)/2+0.5;return ok();}if(!any)return ok();
      if(this.out!==262143||this.mode!=='hold')return 'ERR GDRIVE: stand up (all 18 outputs on) first';
      const need=[n[0]>0?1:0,n[0]<0?2:0,n[1]?3:0,n[2]<0?4:0,n[2]>0?8:0].reduce((x,y)=>x|y,0);if((need&this.tested)!==need)return 'ERR GDRIVE: run the one-cycle test for this direction first (deck: Tests)';
      this.mode='gait';this.walking=1;this.cycles=0;return ok();}
    case 'GSTOP':this.drive=[0,0,0];if(this.mode==='gait'&&!this.test)this.stopAt=Math.ceil(this.cycles*2)/2+0.5;return ok();
    case 'GTEST':if(this.out!==262143||this.mode!=='hold')return 'ERR GTEST: stand up (all 18 outputs on) first';this.test=n[0];this.mode='gait';this.walking=1;this.cycles=0;return ok();
    case 'PARK':if(this.out!==262143||this.mode!=='hold')return 'ERR PARK: stand at the ready pose with all outputs on first';this.mode='park';this.parkAt=Date.now()+1800;return ok();
    }
    return on?'ERR unknown command':'ERR unknown command';}
}
class MockTransport{constructor(robot){this.robot=robot||new MockRobot();this.token='';this.seq=0;this.dropEvery=0;this.count=0;}
  async claim(){this.token='preview';return true;}
  async send(cmd){await new Promise(r=>setTimeout(r,15));if(this.dropEvery&&++this.count%this.dropEvery===0)throw new Error('dropped');return {status:200,text:this.robot.exec(cmd)};}}

function makeLink(){const preview=/[?&]preview=1/.test(location.search)||location.protocol==='file:';
  const t=preview?new MockTransport():new HttpTransport('');const l=new Link(t);l.preview=preview;return l;}
const api={parseLine,list,faultText,HttpTransport,Link,MockRobot,MockTransport,makeLink,HEADER};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HX=api;
})(typeof window!=='undefined'?window:globalThis);
