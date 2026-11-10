const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:844,height:390},reducedMotion:'reduce'});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});console.log('browser ready');
 await page.goto('http://127.0.0.1:8877/tests/hardware-qa.html?ready=1');await page.locator('#connect-robot').click();await page.waitForSelector('body.usb-live');await page.waitForFunction(()=>document.querySelector('.startup').hidden);
 assert.deepEqual(errors,[]);console.log('connected mock');
 async function visible(id){const b=await page.locator(id).boundingBox();assert(b&&b.x>=0&&b.y>=0&&b.x+b.width<=page.viewportSize().width+1&&b.y+b.height<=page.viewportSize().height+1,`${id} outside viewport: ${JSON.stringify(b)}`);}
 for(const size of [{width:844,height:390},{width:667,height:320},{width:390,height:844},{width:375,height:667}]){
  await page.setViewportSize(size);for(const mode of ['walk','manual','setup','crab']){await page.selectOption('#hw-mode',mode);await page.waitForTimeout(30);for(const id of ['#joystick','#hw-mode','#hw-speed','#pilot-arm','#pilot-options','#stop',...(mode==='setup'?['#hw-save-single','#hw-pulse']:[])])await visible(id);const positions=await page.evaluate(()=>({stick:document.getElementById('joystick').getBoundingClientRect().x,settings:document.querySelector('.pilot-settings').getBoundingClientRect().right}));assert(positions.stick>=positions.settings,'joystick must stay on right');}
 console.log('layout passed',size);
 }
 await page.setViewportSize({width:844,height:390});await page.selectOption('#hw-mode','walk');await page.check('#hw-ready');await page.check('#hw-gait-ready');console.log('enabling',await page.locator('#pilot-gate').textContent());await page.locator('#pilot-arm').click();await page.waitForFunction(()=>window.qaState().mask===63);console.log('walk armed');
 let box=await page.locator('#joystick').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+10);await page.waitForTimeout(650);await page.mouse.up();await page.waitForTimeout(350);
 const frames=await page.evaluate(()=>qaCommands.filter(c=>c.startsWith('FRAME ')));assert(frames.length>=7,'joystick should drive gait frames');assert(frames.some(c=>c.includes('1575')),'lift target');assert(frames.some(c=>c.includes('1425')),'mirrored target');assert((await page.evaluate(()=>qaState().raw)).every(n=>n===1500),'release returns ready');
 const frameCount=frames.length;await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>qaCommands.filter(c=>c.startsWith('FRAME ')).length),frameCount,'release stops repeat');
 await page.screenshot({path:'tmp/cockpit-landscape.png'});await page.locator('#stop').click();await page.waitForFunction(()=>qaState().raw.every(n=>n===0));
 await page.selectOption('#hw-mode','setup');await page.selectOption('#hw-target','2');await page.selectOption('#hw-joint','1');await page.locator('#pilot-arm').click();await page.waitForFunction(()=>qaState().raw[7]===1500);assert.equal((await page.evaluate(()=>qaState().raw)).filter(Boolean).length,1,'Setup isolates one servo');
 await page.locator('#hw-plus').click();await page.waitForFunction(()=>qaState().raw[7]===1510);await page.locator('#hw-save-single').click();await page.waitForFunction(()=>qaCommands.includes('CALSAVE 7 1510'));
 await page.locator('#stop').click();await page.selectOption('#hw-mode','crab');await page.locator('#pilot-test').click();await page.waitForFunction(()=>document.getElementById('pilot-message').textContent.includes('one-cycle test complete'));await page.locator('#pilot-arm').click();await page.waitForFunction(()=>qaState().raw.every(n=>n===0));
 await page.selectOption('#hw-mode','setup');await page.setViewportSize({width:390,height:844});await page.screenshot({path:'tmp/cockpit-portrait.png'});
 assert.deepEqual(errors,[]);console.log('PASS: 4 sizes × 4 modes; joystick gait; release; stop; isolated Setup + save; crab cycle; no JS errors');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
