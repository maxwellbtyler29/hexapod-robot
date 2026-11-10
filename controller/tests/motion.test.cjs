const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('../dist/motion-plan.js');
test('right hip, knee and foot all reverse; unselected legs hold',()=>{
 const p=Array(18).fill(1500);
 const hipKnee=M.jog(p,9,'both',1,1,100,.1);
 assert.deepEqual(hipKnee.slice(0,3),[1510,1510,1500]);assert.deepEqual(hipKnee.slice(9,12),[1490,1490,1500]);
 assert.deepEqual(hipKnee.slice(3,9),p.slice(3,9));
 const feet=M.jog(p,63,'foot',0,1,100,.1);
 assert.equal(feet[2],1490);assert.equal(feet[11],1510);
});
test('tripod lift uses alternating nonadjacent sets and honors distinct ready poses',()=>{
 const p=Array.from({length:18},(_,i)=>1400+i*5),f=M.tripod(p,{stride:50,lift:60,extend:20});
 assert.equal(f.length,6);
 for(const leg of [0,2,4]){assert.equal(f[0].pulses[leg*3+1],p[leg*3+1]+M.sign(leg)*60);assert.equal(f[0].pulses[leg*3+2],p[leg*3+2]-M.sign(leg)*20);}
 for(const leg of [1,3,5])assert.deepEqual(f[0].pulses.slice(leg*3+1,leg*3+3),p.slice(leg*3+1,leg*3+3));
 for(let leg=0;leg<6;leg++)assert.deepEqual(f[5].pulses.slice(leg*3+1,leg*3+3),p.slice(leg*3+1,leg*3+3));
 assert.deepEqual(p,Array.from({length:18},(_,i)=>1400+i*5));
});
test('all six legs share one continuous mirrored six-phase cycle',()=>{
 const base=Array(18).fill(1500),frames=M.tripod(base,{stride:75,lift:75});
 const expected=[[-1,0,1,1,0,-1],[1,0,-1,-1,0,1]];
 for(let leg=0;leg<6;leg++){
  const group=leg===0||leg===2||leg===4?0:1,sign=M.sign(leg),id=leg*3;
  assert.deepEqual(frames.map(frame=>(frame.pulses[id]-base[id])/sign/75||0),expected[group],`${M.names[leg]} hip phases`);
  assert.deepEqual(frames.map(frame=>(frame.pulses[id+1]-base[id+1])/sign/75||0),group===0?[1,1,0,0,0,0]:[0,0,0,1,1,0],`${M.names[leg]} lift phases`);
  assert.equal(frames[5].pulses[id],frames[0].pulses[id],`${M.names[leg]} closes without a center detour`);
 }
});
test('backward reverses hip sweep; in-place never changes hips',()=>{
 const p=Array(18).fill(1500),a=M.tripod(p),b=M.tripod(p,{direction:-1}),c=M.tripod(p,{direction:0});
 for(let leg=0;leg<6;leg++){assert.equal(a[1].pulses[leg*3]+b[1].pulses[leg*3],3000);for(const f of c)assert.equal(f.pulses[leg*3],1500);}
});
test('out-of-range gait rejects whole plan rather than silently clipping',()=>{
 const p=Array(18).fill(1500);p[1]=1980;
 assert.throws(()=>M.tripod(p,{lift:75}),/exceeds/);
 assert.throws(()=>M.tripod(Array(18).fill(NaN)),/Invalid/);
});
test('per-joint limits can expand without changing other joints',()=>{
 const old=M.limits.map(a=>[...a]);
 try{
  const limits=old.map(a=>[...a]);limits[2]=[700,2300];assert(M.validLimits(limits));M.limits=limits;
  const pose=Array(18).fill(1500);pose[2]=2200;assert(M.validPose(pose));
  pose[5]=2200;assert(!M.validPose(pose));
  assert.equal(M.clamp(2400,2),2300);assert.equal(M.clamp(900,5),1000);
 }finally{M.limits=old;}
});
