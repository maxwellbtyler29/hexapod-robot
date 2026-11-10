// node firmware/tests/test_link.js — unit tests for firmware/deck/link.js (no dependencies)
'use strict';
const assert=require('assert');
const HX=require('../deck/link.js');
let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('ok -',name);};
const fast={sleep:()=>Promise.resolve(),backoffMs:1};
(async()=>{
await test('parseLine numbers and strings',()=>{const p=HX.parseLine('GAIT v=2 ready=1 phase=0.250 drive=10,0,-5 err=none mode=hold');
  assert.strictEqual(p.kind,'GAIT');assert.strictEqual(p.ready,1);assert.strictEqual(p.phase,0.25);assert.strictEqual(p.drive,'10,0,-5');assert.strictEqual(p.err,'none');
  assert.deepStrictEqual(HX.list('1,2,3'),[1,2,3]);});
await test('faultText knows i2c/heartbeat and falls back',()=>{assert(/I2C/.test(HX.faultText('i2c')));assert(/watchdog/.test(HX.faultText('heartbeat')));assert(/xyz/.test(HX.faultText('xyz')));assert.strictEqual(HX.faultText('none'),'');});
await test('retry reuses the same sequence and does not disconnect',async()=>{
  const seen=[];let fails=2;const t={seq:0,async claim(){},async send(cmd,seq){seen.push(seq);if(fails-->0)throw new Error('timeout');return {status:200,text:'OK '+cmd};}};
  const l=new HX.Link(t,fast);await l.connect();const r=await l.command('PING');
  assert.strictEqual(r,'OK PING');assert.deepStrictEqual(seen,[1,1,1]);assert.strictEqual(l.state,'live');
  assert.strictEqual(await l.command('PING'),'OK PING');assert.strictEqual(seen[3],2);});
await test('exhausted retries reject but keep the session (unstable, not offline)',async()=>{
  const t={seq:0,async claim(){},async send(){throw new Error('down');}};const l=new HX.Link(t,fast);await l.connect();
  await assert.rejects(l.command('PING'));assert.notStrictEqual(l.state,'offline');});
await test('goes "lost" after the lost window',async()=>{let now=0;const t={seq:0,async claim(){},async send(){now+=2000;throw new Error('down');}};
  const l=new HX.Link(t,Object.assign({now:()=>now},fast));await l.connect();await assert.rejects(l.command('PING'));assert.strictEqual(l.state,'lost');});
await test('403 session re-claims once and resends',async()=>{let claims=0,n=0;const t={seq:0,async claim(){claims++;},async send(cmd){return ++n===1?{status:403,text:'ERR session'}:{status:200,text:'OK '+cmd};}};
  const l=new HX.Link(t,fast);await l.connect();assert.strictEqual(await l.command('PING'),'OK PING');assert.strictEqual(claims,2);});
await test('400/409 replies are returned as ERR text, not thrown',async()=>{const t={seq:0,async claim(){},async send(){return {status:409,text:'ERR another client owns motion'};}};
  const l=new HX.Link(t,fast);await l.connect();assert(/^ERR/.test(await l.command('GDRIVE 1 0 0')));});
await test('coalesce replaces a queued command; urgent jumps the queue',async()=>{const sent=[];let release;const gate=new Promise(r=>release=r);
  const t={seq:0,async claim(){},async send(cmd){sent.push(cmd);if(sent.length===1)await gate;return {status:200,text:'OK'};}};
  const l=new HX.Link(t,fast);await l.connect();const p0=l.command('GSTATUS');const p1=l.command('GDRIVE 10 0 0',{coalesce:'d'});const p2=l.command('GDRIVE 50 0 0',{coalesce:'d'});const p3=l.command('OFF',{urgent:true});
  assert.strictEqual(p1,p2);release();await Promise.all([p0,p1,p3]);assert.deepStrictEqual(sent,['GSTATUS','OFF','GDRIVE 50 0 0']);});
await test('connect retries then gives up on 409 immediately',async()=>{let n=0;const t={seq:0,async claim(){n++;throw Object.assign(new Error('busy'),{status:409});}};
  const l=new HX.Link(t,fast);await assert.rejects(l.connect());assert.strictEqual(n,1);assert.strictEqual(l.state,'offline');});
await test('mock robot: stand, test-gating, walk, stop, park',async()=>{const r=new HX.MockRobot();const run=(c)=>r.exec(c);
  assert(/^OK/.test(run('POWER 63 1')));for(let i=0;i<20;i++)r.tick();assert.strictEqual(HX.parseLine(run('GSTATUS')).out,262143);
  assert(/one-cycle test/.test(run('GDRIVE 50 0 0')));
  assert(/^OK/.test(run('GTEST 1')));r.cycles=2;r.tick();assert.strictEqual(r.tested&1,1);
  assert(/^OK/.test(run('GDRIVE 50 0 0')));assert.strictEqual(r.mode,'gait');run('GSTOP');r.cycles=r.stopAt+0.1;r.tick();assert.strictEqual(r.mode,'hold');
  assert(/^OK/.test(run('PARK')));r.parkAt=0;r.tick();assert.strictEqual(r.out,0);assert.strictEqual(r.err,'parked');});
await test('mock robot GSTATUS has every field the deck reads',()=>{const p=HX.parseLine(new HX.MockRobot().exec('GSTATUS'));
  for(const k of ['ready','out','mode','walking','test','phase','cycles','tested','tempo','cap','auto','need','limiting','clip','drive','blocked','confirmed','dirok','i2c','err'])assert(k in p,k);});
console.log(`\n${passed} JS tests passed`);
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
// keep the preview robot in step with the firmware's GSTATUS format
(()=>{const fs=require('fs');const src=fs.readFileSync(require('path').join(__dirname,'../src/six_leg_setup.cpp'),'utf8');
  const fmt=/"GAIT v=2 ([^"]+)\\n"/.exec(src)[1];const fw=fmt.split(' ').map(s=>s.split('=')[0]);
  const mock=Object.keys(HX.parseLine(new HX.MockRobot().exec('GSTATUS'))).filter(k=>k!=='kind'&&k!=='v');
  assert.deepStrictEqual(mock,fw,'mock GSTATUS fields differ from firmware');console.log('ok - mock GSTATUS fields match firmware printf');})();
