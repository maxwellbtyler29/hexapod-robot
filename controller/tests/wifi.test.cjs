const {test}=require('node:test'),assert=require('node:assert/strict');
const SetupWifi=require('../dist/wifi-link.js');
const token='0123456789abcdef0123456789abcdef';
const caps='CAPS v=5 min=500 max=2500 rate=100 frames=18 joint=1 nvs=1 crab=1 wifi=1';
const off='SETUP v=1 ready=1 leg=-1 current=0,0,0 target=1500,1500,1500 frontPair=0 groupMask=0';
function mock(){const sent=[];const fetcher=async(path,options)=>{
 if(path==='/api/session')return {ok:true,text:async()=>token};
 const [sequence,command]=options.body.split('\n');sent.push({sequence:Number(sequence),command,headers:options.headers});
 return {ok:true,text:async()=>command==='CAPS'?caps:command==='STATUS'?off:`OK ${command.split(' ')[0]}`};
};return {link:new SetupWifi(()=>{},()=>{},fetcher),sent};}
test('Wi-Fi claims a session, verifies firmware and starts with outputs off',async()=>{
 const {link,sent}=mock();await link.connect();
 assert.deepEqual(sent.map(x=>x.command),['OFF','CAPS','STATUS']);
 assert.deepEqual(sent.map(x=>x.sequence),[1,2,3]);
 assert(sent.every(x=>x.headers['X-Session']===token&&x.headers['X-Hexapod']==='control-v4'));
 await link.close();
});
test('Wi-Fi rejects an older controller before any motion command',async()=>{
 const {link,sent}=mock();link.fetcher=async(path,options)=>{
  if(path==='/api/session')return {ok:true,text:async()=>token};
  const command=options.body.split('\n')[1];sent.push({command});
  return {ok:true,text:async()=>command==='CAPS'?'CAPS v=3 min=1000 max=2000 rate=100 frames=18 rightMirror=all':`OK ${command}`};
 };
 await assert.rejects(link.connect(),/Firmware update required/);
 assert(!sent.some(x=>x.command.startsWith('START')||x.command.startsWith('FRAME')));
});
