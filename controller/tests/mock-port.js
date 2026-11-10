// LOCAL QA ONLY. Not included in dist or in published/device exports.
(()=>{let controller,leg=-1,mask=0,current=[0,0,0],target=[1500,1500,1500],raw=Array(18).fill(0),goal=Array(18).fill(0),single=-1,confirmed=0,crabFlags=0;
let centers=Array(18).fill(1500),minimum=Array(18).fill(1000),maximum=Array(18).fill(2000),crab=Array(72).fill(1500);
const encoder=new TextEncoder();
window.qaCommands=[];window.qaState=()=>({raw:[...raw],goal:[...goal],confirmed,mask});
if(new URLSearchParams(location.search).get('ready')==='1'){confirmed=262143;crabFlags=16777215;for(let d=0;d<2;d++)for(let l=0;l<6;l++){const i=(d*6+l)*6;crab[i]=1500+(d?1:-1)*(l<3?50:-50);crab[i+4]=1500+(l<3?75:-75);}}
function respond(s){controller.enqueue(encoder.encode(s+'\n'));}
const port={
 async open(){},
 async setSignals(){},
 async close(){},
 readable:new ReadableStream({start(c){controller=c;},cancel(){}}),
 writable:new WritableStream({write(bytes){
  const command=new TextDecoder().decode(bytes).trim(),v=command.split(' ');
  window.qaCommands.push(command);
  const log=document.getElementById('qa-commands');if(log)log.textContent=(log.textContent+command+'\n').slice(-1200);
  if(v[0]==='STATE')return respond(`POSE v=3 ready=1 mask=${mask} current=${raw} target=${goal}`);
  if(v[0]==='STATUS')return respond(`SETUP v=1 ready=1 leg=${leg} current=${current} target=${target} frontPair=${mask?1:0} groupMask=${mask}`);
  if(v[0]==='CAPS')return respond('CAPS v=5 min=500 max=2500 rate=100 frames=18 joint=1 nvs=1 crab=1 wifi=1');
  if(v[0]==='CALDATA')return respond(`CALDATA v=1 confirmed=${confirmed} centers=${centers} minimum=${minimum} maximum=${maximum}`);
  if(v[0]==='CRABDATA')return respond(`CRABDATA v=1 flags=${crabFlags} pulses=${crab}`);
  if(v[0]==='OFF'){leg=-1;mask=0;single=-1;current=[0,0,0];raw=Array(18).fill(0);}
  if(v[0]==='JSTART'){single=+v[1];raw=Array(18).fill(0);goal=Array(18).fill(0);raw[single]=goal[single]=1500;}
  if(v[0]==='JFRAME'){raw[single]=goal[single]=+v[2];}
  if(v[0]==='CALSAVE'){centers[+v[1]]=+v[2];confirmed|=1<<+v[1];}
  if(v[0]==='LIMIT'){minimum[+v[1]]=+v[2];maximum[+v[1]]=+v[3];}
  if(v[0]==='CRABSET'){const i=(+v[1]*6+ +v[2])*6+ +v[3]*3;crab.splice(i,3,...v.slice(4).map(Number));crabFlags|=1<<((+v[1]*6+ +v[2])*2+ +v[3]);}
  if(v[0]==='CALRESET'){centers=Array(18).fill(1500);minimum=Array(18).fill(1000);maximum=Array(18).fill(2000);crab=Array(72).fill(1500);confirmed=crabFlags=0;}
  if(v[0]==='START'){leg=0;mask=+v[1];goal=v.slice(2).map(Number);raw=goal.map((n,i)=>mask&(1<<Math.floor(i/3))?n:0);}
  if(v[0]==='FRAME'){goal=v.slice(2).map(Number);raw=goal.map((n,i)=>mask&(1<<Math.floor(i/3))?n:0);}
  if(v[0].startsWith('ARM')){leg=v[0]==='ARM'?Number(v[1]):0;mask=({ARM_FRONT:9,ARM_FOUR:45,ARM_SIX:63})[v[0]]||0;current=[1500,1500,1500];target=[...current];}
  if(v[0]==='MOVE'){current[+v[1]]=+v[2];target=[...current];}
  respond('OK '+v[0]);
 }})
};
Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>port},configurable:true});
document.addEventListener('DOMContentLoaded',()=>{const log=document.createElement('pre');log.id='qa-commands';log.style.cssText='max-height:150px;overflow:auto;font-size:10px';document.body.appendChild(log);document.title='MOCK HARDWARE — NO ROBOT';});
})();
