const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

(async()=>{
  const root=path.resolve(__dirname,'..');
  const output=path.join(require('os').tmpdir(),'hexapod-control-qa.html');
  execFileSync(process.execPath,[path.join(root,'export-device.mjs'),output],{cwd:root});
  const html=fs.readFileSync(output,'utf8');
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const commands=[],errors=[];
  let active=false,ending=false,kind=0,dir=0,cycles=0,tested=0,mask=0,flags=16777215;
  let centers=Array(18).fill(1500),minimum=Array(18).fill(1000),maximum=Array(18).fill(2000);minimum[0]=850;maximum[0]=2250;
  let sessionCount=0;
  const page=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://192.168.4.1/**',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname==='/')return route.fulfill({status:200,contentType:'text/html',body:html});
    if(url.pathname==='/api/session'){sessionCount++;return route.fulfill({status:200,body:'0123456789abcdef0123456789abcdef'});}
    if(url.pathname!=='/api/command')return route.fulfill({status:404,body:'Not found'});
    const command=req.postData().split('\n')[1],v=command.split(' ');commands.push(command);
    let reply='OK '+v[0];
    if(command==='OFF'){mask=0;active=false;ending=false;}
    if(command==='CAPS')reply='CAPS v=5 min=500 max=2500 rate=100 frames=18 joint=1 nvs=1 crab=1 wifi=1';
    if(command==='STATUS')reply=`SETUP v=1 ready=1 leg=${mask?0:-1} current=0,0,0 target=1500,1500,1500 frontPair=0 groupMask=0`;
    if(command==='STATE')reply=`POSE v=3 ready=1 mask=${mask} current=${centers} target=${centers}`;
    if(command==='CALDATA')reply=`CALDATA v=1 confirmed=262143 centers=${centers} minimum=${minimum} maximum=${maximum}`;
    if(command==='CRABDATA')reply=`CRABDATA v=1 flags=${flags} pulses=${Array(72).fill(1500)}`;
    if(command==='GSTATUS')reply=`GAIT v=1 active=${Number(active)} ending=${Number(ending)} kind=${kind} dir=${active?dir:0} phase=${active?0:-1} cycles=${cycles} tested=${tested}`;
    if(v[0]==='START')mask=Number(v[1]);
    if(v[0]==='GSTART'){
      kind=Number(v[1]);dir=Number(v[2]);active=true;ending=Number(v[5])===1;
      if(ending)setTimeout(()=>{active=false;ending=false;cycles++;tested|=1<<((kind?2:0)+(dir<0?0:1));},350);
    }
    if(command==='GRELEASE'){ending=true;setTimeout(()=>{active=false;ending=false;cycles++;},350);}
    return route.fulfill({status:200,body:reply});
  });
  try{
    await page.goto('http://192.168.4.1/');
    assert(await page.locator('.startup').isVisible(),'connection screen visible first');
    await page.locator('#connect-robot').click();
    await page.waitForFunction(()=>document.querySelector('.startup').hidden);
    await page.screenshot({path:path.join(require('os').tmpdir(),'hexapod-control-landscape.png')});
    assert.equal(sessionCount,1);
    assert.deepEqual(await page.evaluate(()=>HexMotion.limits[0]),[850,2250],'main controller uses limits returned by calibration storage');
    assert.match(await page.locator('#battery-value').textContent(),/—%/);
    assert.match(await page.locator('#travel-speed').textContent(),/—/);
    for(const id of ['library-list','drive-mode','eco','sport','view-camera','joystick','servo-rate','outputs-off'])assert(await page.locator('#'+id).isVisible(),id+' visible');
    const dimensions=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,library:[document.querySelector('#library-list').scrollHeight,document.querySelector('#library-list').clientHeight]}));
    assert(dimensions.scrollWidth<=dimensions.width+1,'no horizontal clipping in landscape');
    assert(dimensions.scrollHeight<=dimensions.height+1,'no page scrolling in landscape');
    assert(dimensions.library[0]>dimensions.library[1],'library scrolls internally');
    const columns=await page.evaluate(()=>['.library','.command-center','.joystick-panel'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
    assert(columns.every(c=>Math.abs(c.y-columns[0].y)<2)&&columns[0].x<columns[1].x&&columns[1].x<columns[2].x,'landscape uses library, center, joystick columns');
    await page.locator('#enable-motion').click();
    await page.waitForFunction(()=>document.querySelector('#output-state').textContent==='OUTPUTS ON');
    assert(commands.some(c=>c.startsWith('START 63 ')),'all six use saved pose');
    await page.locator('#test-cycle').click();
    await page.waitForFunction(()=>document.querySelector('#control-message').textContent.includes('Cycle complete'));
    assert(commands.includes('GSTART 0 1 0 650 1'),'one Eco cycle uses 650 servo slew');
    await page.locator('#sport').click();
    await page.locator('#servo-rate').fill('5000');
    const stick=page.locator('#joystick'),bounds=await stick.boundingBox();
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
    await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+15);
    await page.waitForFunction(()=>document.querySelector('#control-message').textContent.includes('Gait running'));
    assert(commands.includes('GSTART 0 1 1 5000 0'),'Sport tempo and independent servo speed reach controller');
    await page.mouse.up();
    await page.waitForFunction(()=>document.querySelector('#control-message').textContent.includes('Cycle complete'));
    assert(commands.includes('GRELEASE'),'release finishes current cycle');
    await page.selectOption('#drive-mode','crab');
    await page.locator('#test-cycle').click();
    await page.waitForFunction(()=>document.querySelector('#system-state').textContent==='GAIT ACTIVE');
    await page.waitForFunction(()=>document.querySelector('#system-state').textContent==='READY');
    assert(commands.includes('GSTART 1 1 1 5000 1'),'crab one-cycle test uses saved sideways profiles');
    await page.locator('[data-move="crab-left"]').click();
    await page.waitForFunction(()=>document.querySelector('#system-state').textContent==='GAIT ACTIVE');
    await page.waitForFunction(()=>document.querySelector('#system-state').textContent==='READY');
    assert(commands.includes('GSTART 1 -1 1 5000 1'),'left and right crab directions are distinct');
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
    await page.mouse.down();await page.mouse.move(bounds.x+15,bounds.y+bounds.height/2);
    await page.waitForFunction(()=>document.querySelector('#system-state').textContent==='GAIT ACTIVE');
    assert(commands.includes('GSTART 1 -1 1 5000 0'),'tested crab direction can repeat while held');
    await page.mouse.up();
    await page.waitForFunction(()=>document.querySelector('#system-state').textContent==='READY');
    await page.locator('#view-camera').click();
    assert(await page.locator('#camera-view').isVisible(),'camera placeholder visible');
    assert(await stick.isVisible(),'joystick remains in camera mode');
    assert(!(await page.locator('.library').isVisible()),'library replaced by camera');
    await page.locator('#close-camera').click();
    await page.locator('#outputs-off').click();
    await page.waitForFunction(()=>document.querySelector('#output-state').textContent==='OUTPUTS OFF');
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(require('os').tmpdir(),'hexapod-control-portrait.png')});
    const portrait=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight}));
    assert(portrait.scrollWidth<=portrait.width+1,'no horizontal clipping in portrait');
    assert(portrait.scrollHeight<=portrait.height+1,'no page scrolling in portrait');
    for(const id of ['library-list','drive-mode','servo-rate','joystick','outputs-off'])assert(await page.locator('#'+id).isVisible(),id+' visible in portrait');
    assert.deepEqual(errors,[]);
    console.log('PASS: connection fade, responsive controls, stored ready pose, independent speed/tempo, cycle test, hold/release, camera layout and outputs off');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
