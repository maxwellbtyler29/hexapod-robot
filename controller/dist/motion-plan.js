'use strict';
// Values are raw commanded microseconds. These are open-loop test trajectories, not IK.
const HexMotion={
  names:['Left front','Left middle','Left rear','Right front','Right middle','Right rear'],
  limits:Array.from({length:18},()=>[1000,2000]),
  sign(leg){return leg<3?1:-1;},
  validLimits(l){return Array.isArray(l)&&l.length===18&&l.every(a=>Array.isArray(a)&&a.length===2&&a.every(Number.isInteger)&&a[0]>=500&&a[1]<=2500&&a[0]<1500&&a[1]>1500);},
  validPose(p){return Array.isArray(p)&&p.length===18&&p.every((n,i)=>Number.isInteger(n)&&n>=this.limits[i][0]&&n<=this.limits[i][1]);},
  clamp(n,i){return Math.max(this.limits[i][0],Math.min(this.limits[i][1],n));},
  legs(mask){return Array.from({length:6},(_,i)=>i).filter(i=>mask&(1<<i));},
  mask(value){return ({front:9,four:45,six:63})[value]??(1<<Number(value));},
  jog(p,mask,axis,x,y,speed,dt){
    const next=[...p],d=speed*Math.min(.1,Math.max(0,dt));
    for(const leg of this.legs(mask)){
      const i=leg*3,s=this.sign(leg);
      if(axis==='both'||axis==='hip')next[i]+=s*x*d;
      if(axis==='both'||axis==='knee')next[i+1]+=s*y*d;
      if(axis==='foot')next[i+2]-=s*y*d;
    }
    return next.map((n,i)=>this.clamp(n,i));
  },
  tripod(base,{direction=1,stride=75,lift=75,extend=0}={}){
    if(!this.validPose(base)||![stride,lift,extend].every(n=>Number.isFinite(n)&&n>=0&&n<=1000)||![-1,0,1].includes(direction))throw Error('Invalid gait settings.');
    const group=leg=>leg===0||leg===2||leg===4?0:1;
    const hip=[[-1,0,1,1,0,-1],[1,0,-1,-1,0,1]],lifted=[1,1,0,2,2,0];
    const names=['Lift tripod A at rear','Swing tripod A through center','Plant tripod A at front','Lift tripod B at rear','Swing tripod B through center','Plant tripod B at front'];
    const frames=[];
    for(let phase=0;phase<6;phase++){
      const pose=[...base];
      for(let leg=0;leg<6;leg++){
        const i=leg*3,g=group(leg),s=this.sign(leg);
        pose[i]=base[i]+s*hip[g][phase]*stride*direction;
        if(lifted[phase]===g+1){pose[i+1]=base[i+1]+s*lift;pose[i+2]=base[i+2]-s*extend;}
      }
      const pulses=pose.map(Math.round);
      if(!this.validPose(pulses))throw Error('This step exceeds a saved joint limit. Adjust that limit, the ready pose or step size.');
      frames.push({name:names[phase],pulses});
    }
    return frames;
  }
};
if(typeof module!=='undefined')module.exports=HexMotion;
