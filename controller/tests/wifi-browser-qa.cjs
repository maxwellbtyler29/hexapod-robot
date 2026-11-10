const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

(async()=>{
 const devicePath=path.join(require('os').tmpdir(),'hexapod-device-qa.html');
 execFileSync(process.execPath,[path.resolve(__dirname,'../export-device.mjs'),devicePath,'dist/calibration/index.html'],{cwd:path.resolve(__dirname,'..')});
 const html=fs.readFileSync(devicePath,'utf8');
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 const errors=[],commands=[];page.on('pageerror',e=>errors.push(e.message));
 let mask=0,single=-1,confirmed=0,failNextState=false,slowCalibration=true;
 let current=Array(18).fill(0),target=Array(18).fill(0),centers=Array(18).fill(1500);
 const minimum=Array(18).fill(1000),maximum=Array(18).fill(2000),crab=Array(72).fill(1500);
 await page.route('http://192.168.4.1/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname==='/calibration/')return route.fulfill({status:200,contentType:'text/html',body:html});
  if(url.pathname==='/api/session')return route.fulfill({status:200,body:'0123456789abcdef0123456789abcdef'});
  if(url.pathname!=='/api/command')return route.fulfill({status:404,body:'Not found'});
  const command=req.postData().split('\n')[1],v=command.split(' ');commands.push(command);
  if(command==='CALDATA'&&slowCalibration){slowCalibration=false;await new Promise(r=>setTimeout(r,750));}
  if(command==='STATE'&&failNextState){failNextState=false;return route.fulfill({status:503,body:'ERR Wi-Fi interrupted'});}
  let reply='OK '+v[0];
  if(command==='OFF'){mask=0;single=-1;current.fill(0);target.fill(0);}
  if(command==='CAPS')reply='CAPS v=5 min=500 max=2500 rate=100 frames=18 joint=1 nvs=1 crab=1 wifi=1';
  if(command==='STATUS')reply=`SETUP v=1 ready=1 leg=${mask||single>=0?0:-1} current=0,0,0 target=1500,1500,1500 frontPair=0 groupMask=${mask}`;
  if(command==='STATE')reply=`POSE v=3 ready=1 mask=${mask} current=${current} target=${target}`;
  if(command==='CALDATA')reply=`CALDATA v=1 confirmed=${confirmed} centers=${centers} minimum=${minimum} maximum=${maximum}`;
  if(command==='CRABDATA')reply=`CRABDATA v=1 flags=0 pulses=${crab}`;
  if(v[0]==='JSTART'){single=Number(v[1]);current.fill(0);target.fill(0);current[single]=target[single]=1500;}
  if(v[0]==='JFRAME'){current[single]=target[single]=Number(v[2]);}
  if(v[0]==='CALSAVE'){centers[Number(v[1])]=Number(v[2]);confirmed|=1<<Number(v[1]);}
  if(v[0]==='LIMIT'){minimum[Number(v[1])]=Number(v[2]);maximum[Number(v[1])]=Number(v[3]);}
  if(v[0]==='START'){mask=Number(v[1]);target=v.slice(2).map(Number);current=target.map((n,i)=>mask&(1<<Math.floor(i/3))?n:0);}
  if(v[0]==='FRAME'){target=v.slice(2).map(Number);current=target.map((n,i)=>mask&(1<<Math.floor(i/3))?n:0);}
  return route.fulfill({status:200,body:reply});
 });
 try{
  await page.goto('http://192.168.4.1/calibration/');await page.locator('#connect-robot').click();
  await page.waitForSelector('body.usb-live');await page.waitForFunction(()=>document.querySelector('.startup').hidden);
  assert.match(await page.locator('#pilot-gate').textContent(),/18 ready positions missing/);
  await page.selectOption('#hw-mode','setup');await page.check('#hw-ready');
  for(const [joint,pulse] of [[0,1510],[1,1520]]){
   await page.selectOption('#hw-joint',String(joint));await page.locator('#pilot-arm').click();
   await page.waitForFunction(id=>document.querySelector('#hw-hip').textContent!=='Off'||document.querySelector('#hw-knee').textContent!=='Off',joint);
   await page.locator('#hw-pulse').fill(String(pulse));await page.locator('#hw-apply-pulse').click();
   await page.waitForFunction(v=>document.querySelector('#hw-pulse').value===String(v),pulse);
   await page.locator('#hw-save-single').click();
   await page.waitForFunction(id=>document.querySelector('#pilot-message').textContent.includes('saved at')&&document.querySelector('#pilot-message').textContent.includes(['hip','knee'][id]),joint);
   assert(commands.includes(`CALSAVE ${joint} ${pulse}`));
   await page.locator('#pilot-arm').click();await page.waitForFunction(()=>document.querySelector('#pilot-output').textContent==='OUTPUTS OFF');
  }
  assert.equal((confirmed&3),3,'both servos saved persistently');
  await page.evaluate(()=>{document.querySelector('#hw-min').value='850';document.querySelector('#hw-max').value='2250';document.querySelector('#hw-apply-limits').click();});
  await page.waitForFunction(()=>document.querySelector('#pilot-message').textContent.includes('limits saved'));
  assert(commands.includes('LIMIT 1 850 2250'),'calibration page persists the selected servo limits');
  failNextState=true;await page.locator('#pilot-arm').click();
  await page.waitForFunction(()=>document.querySelector('.startup').classList.contains('connection-failed'));
  assert.match(await page.locator('#connection-error').textContent(),/link lost/);
  await page.locator('#connect-robot').click();await page.waitForSelector('body.usb-live');
  await page.waitForFunction(()=>document.querySelector('.startup').hidden);
  assert.match(await page.locator('#pilot-gate').textContent(),/2\/18/);
  confirmed=262143;await page.locator('#show-startup').click();
  await page.waitForFunction(()=>document.querySelector('.startup').hidden===false);
  await page.locator('#connect-robot').click();await page.waitForSelector('body.usb-live');
  await page.waitForFunction(()=>document.querySelector('.startup').hidden);
  await page.selectOption('#hw-mode','walk');await page.check('#hw-ready');await page.check('#hw-gait-ready');
  await page.locator('#pilot-test').click();
  await page.waitForFunction(()=>document.querySelector('#pilot-message').textContent.includes('Walking test complete'));
  assert(commands.some(c=>c.startsWith('FRAME ')),'walking sends physical frame commands');
  assert.deepEqual(errors,[]);
  console.log('PASS: Wi-Fi connect under latency, two Setup saves, link-loss recovery, and one walking cycle');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
