const {test}=require('node:test'),assert=require('node:assert/strict');
const SetupSerial=require('../dist/serial-link.js');
function mock(){
 const link=new SetupSerial(),commands=[];
 link.writer={write:async bytes=>{const c=new TextDecoder().decode(bytes).trim();commands.push(c);queueMicrotask(()=>link.line(c==='STATUS'?'SETUP v=1 ready=1 leg=-1 current=0,0,0 target=1500,1500,1500 frontPair=0 groupMask=0':c==='CAPS'?'CAPS v=5 min=500 max=2500 rate=100 frames=18 joint=1 nvs=1 crab=1 wifi=1':'OK '+c.split(' ')[0]));}};
 return {link,commands};
}
test('parses current group firmware and rejects malformed/old statuses',()=>{
 const s=SetupSerial.parse('SETUP v=1 ready=1 leg=0 current=1500,1550,1500 target=1500,1550,1500 frontPair=1 groupMask=63');
 assert.equal(s.mask,63);assert.deepEqual(s.current,[1500,1550,1500]);
 assert.equal(SetupSerial.parse('LEG ready=1'),null);
 assert.equal(SetupSerial.parse('SETUP v=1 ready=1 leg=0 current=9999,0,0 target=1500,1500,1500 frontPair=0 groupMask=0'),null);
});
test('requests serialize and capability check must match exactly',async()=>{
 const {link,commands}=mock();
 await Promise.all([link.request('OFF'),link.request('CAPS'),link.request('STATUS')]);
 assert.deepEqual(commands,['OFF','CAPS','STATUS']);
});
test('parses all 18 raw joint commands and rejects incomplete frames',()=>{
 const pulses=Array(18).fill(1500).join(',');
 const state=SetupSerial.parse(`POSE v=3 ready=1 mask=63 current=${pulses} target=${pulses}`);
 assert.equal(state.frame,true);assert.equal(state.mask,63);assert.equal(state.current.length,18);
 assert.equal(SetupSerial.parse(`POSE v=3 ready=1 mask=63 current=1500 target=${pulses}`),null);
});
test('parses persistent joint calibration and both crab directions without treating them as telemetry',async()=>{
 const {link}=mock();let telemetry=0;link.onState=()=>telemetry++;
 const centers=Array(18).fill(1500),minimum=Array(18).fill(1000),maximum=Array(18).fill(2000),pulses=Array(72).fill(1500);
 centers[2]=1238;minimum[2]=900;
 const cal=`CALDATA v=1 confirmed=4 centers=${centers} minimum=${minimum} maximum=${maximum}`;
 const crab=`CRABDATA v=1 flags=8388609 pulses=${pulses}`;
 const saved=SetupSerial.parse(cal),profile=SetupSerial.parse(crab);
 assert.equal(saved.centers[2],1238);assert.equal(saved.minimum[2],900);assert.equal(saved.confirmed,4);
 assert.equal(profile.flags,8388609);assert.equal(profile.pulses.length,72);
 assert.equal(SetupSerial.parse(cal.replace('1238,','2600,')),null);
 assert.equal(SetupSerial.parse(crab.replace(/,1500$/,'')),null);
 link.line(cal);link.line(crab);assert.equal(telemetry,0);
});
test('Stop invalidates queued movement before OFF; no movement follows OFF',async()=>{
 const {link,commands}=mock();
 const cancelled=Promise.allSettled([link.request('MOVE 0 1600 100'),link.request('MOVE 1 1600 100')]);
 await link.stop();assert((await cancelled).every(r=>r.status==='rejected'));
 assert.deepEqual(commands,['OFF','STATUS']);
});
test('firmware error cancels queued work and marks link disconnected',async()=>{
 const {link}=mock();link.connected=true;
 link.writer.write=async()=>queueMicrotask(()=>link.line('ERR I2C fault'));
 await assert.rejects(link.request('PING'),/I2C fault/);assert.equal(link.connected,false);
});
test('unresponsive controller times out instead of retaining a command queue',async()=>{
 const {link}=mock();link.connected=true;link.writer.write=async()=>{};
 await assert.rejects(link.request('PING'),/timed out/);assert.equal(link.connected,false);
});
