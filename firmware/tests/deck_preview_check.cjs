// Headless end-to-end check of the deck in ?preview=1 mode + screenshots.
// usage: NODE_PATH=<dir with playwright-core> node deck_preview_check.cjs http://127.0.0.1:8765 OUTDIR
const {chromium}=require('playwright-core');
const [base,outDir]=process.argv.slice(2);
const assert=(c,m)=>{if(!c)throw new Error('CHECK FAILED: '+m);console.log('ok -',m);};
(async()=>{
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const errs=[];
async function page(w,h){const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text());});
  // root assets (/icon-*.png, /manifest.webmanifest) only exist on the ESP32; anything else missing is an error
  p.on('response',r=>{if(r.status()>=400&&!/\/(icon-\d+\.png|apple-touch-icon\.png|manifest\.webmanifest|favicon\.ico)$/.test(r.url()))errs.push(r.status()+' '+r.url());});return p;}
const text=(p,s)=>p.textContent(s);
async function waitState(p,re,ms){const end=Date.now()+(ms||8000);for(;;){const t=await text(p,'#state-big');if(re.test(t))return t;if(Date.now()>end)throw new Error('state '+t+' never matched '+re);await p.waitForTimeout(100);}}
// ---- full flow, portrait
const p=await page(390,844);await p.goto(base+'/deck/index.html?preview=1');
assert(await p.isVisible('#boot'),'boot overlay shown');await p.screenshot({path:outDir+'/deck-portrait-boot.png'});
await p.click('#connect');await waitState(p,/OUTPUTS OFF/);
assert(await p.isHidden('#camera-slot'),'camera slot reserved but hidden');
assert((await text(p,'#link-pill'))==='PREVIEW','link pill shows PREVIEW');
await p.click('[data-act=stand]');await waitState(p,/READY/);assert(/ARMED 18\/18/.test(await text(p,'#arm-pill')),'armed 18/18 after stand');
// stick blocked before tests
await p.locator('#joystick').scrollIntoViewIfNeeded();let box=await p.locator('#joystick').boundingBox();let cx=box.x+box.width/2,cy=box.y+box.height/2;
const reStick=async()=>{await p.locator('#joystick').scrollIntoViewIfNeeded();box=await p.locator('#joystick').boundingBox();cx=box.x+box.width/2;cy=box.y+box.height/2;};
await p.mouse.move(cx,cy);await p.mouse.down();await p.mouse.move(cx,cy-box.height*0.4,{steps:4});await p.waitForTimeout(400);
assert(/one-cycle test/.test(await text(p,'#msg')),'driving untested direction is refused with a clear message');await p.mouse.up();
await p.waitForTimeout(300);
for(const n of [1,2]){await p.click(`[data-test="${n}"]`);await waitState(p,/TESTING/);await waitState(p,/READY/,12000);}
assert((await p.textContent('[data-tested="1"]')).includes('TESTED'),'forward test tagged');
await reStick();await p.mouse.move(cx,cy);await p.mouse.down();await p.mouse.move(cx+box.width*0.1,cy-box.height*0.4,{steps:4});
await waitState(p,/WALKING/);await p.waitForTimeout(900);await p.screenshot({path:outDir+'/deck-portrait-walking.png'});
await p.mouse.up();await waitState(p,/READY/,8000);assert(true,'releases back to READY after the stick is let go');
await p.click('#sport');await p.waitForTimeout(600);assert((await p.getAttribute('#sport','aria-pressed'))==='true','sport selected');
await p.screenshot({path:outDir+'/deck-portrait.png',fullPage:true});
// limiting display
await p.evaluate(()=>{const c=document.getElementById('cap');c.value=300;c.dispatchEvent(new Event('input'));c.dispatchEvent(new Event('change'));});
await reStick();await p.mouse.move(cx,cy);await p.mouse.down();await p.mouse.move(cx,cy-box.height*0.4,{steps:3});await waitState(p,/WALKING/);await p.waitForTimeout(700);
assert(/Speed limit/.test(await text(p,'#msg')),'UI says when the speed cap is limiting');await p.mouse.up();await waitState(p,/READY/,8000);
await p.click('[data-act=park]');await waitState(p,/SITTING/);await waitState(p,/OUTPUTS OFF/,6000);assert(true,'park sits then switches outputs off');
// watchdog drop shows true state
await p.click('[data-act=stand]');await waitState(p,/READY/);
await p.evaluate(()=>{const r=window.HXDeck.link.t.robot;r.out=0;r.mode='off';r.err='heartbeat';});
await waitState(p,/OUTPUTS OFF/);assert(await p.isVisible('#fault'),'watchdog banner shown');assert(/OUTPUTS OFF/.test(await text(p,'#arm-pill')),'arm pill shows true unarmed state');
// fault + recover
await p.evaluate(()=>{const r=window.HXDeck.link.t.robot;r.ready=0;r.err='i2c';});await waitState(p,/FAULT/);
assert(/I2C/.test(await text(p,'#fault-text')),'i2c fault explained');await p.screenshot({path:outDir+'/deck-portrait-fault.png'});
await p.click('#recover');await waitState(p,/OUTPUTS OFF/);assert(await p.isHidden('#fault'),'recover clears the fault');
// dropped packets do not disconnect
await p.evaluate(()=>{window.HXDeck.link.t.dropEvery=3;});await p.waitForTimeout(2500);
assert(!/LOST|OFFLINE/.test(await text(p,'#link-pill')),'every 3rd request dropped: link stays up ('+await text(p,'#link-pill')+')');
await p.close();
// ---- landscape
const l=await page(844,390);await l.goto(base+'/deck/index.html?preview=1');await l.click('#connect');await waitState(l,/OUTPUTS OFF/);
await l.click('[data-act=stand]');await waitState(l,/READY/);await l.waitForTimeout(300);await l.screenshot({path:outDir+'/deck-landscape.png'});
const cols=await l.evaluate(()=>getComputedStyle(document.getElementById('grid')).gridTemplateColumns.split(' ').length);assert(cols===3,'landscape uses library/center/joystick columns');
await l.close();
const pp=await page(390,844);await pp.goto(base+'/deck/index.html?preview=1');await pp.click('#connect');await waitState(pp,/OUTPUTS OFF/);
const pcols=await pp.evaluate(()=>getComputedStyle(document.getElementById('grid')).gridTemplateColumns.split(' ').length);assert(pcols===2,'portrait uses two columns');await pp.close();
// ---- calibration page
const c=await page(390,844);await c.goto(base+'/deck/calibration.html?preview=1');await c.waitForTimeout(800);
await c.click('.joint[data-id="4"]');await c.waitForTimeout(400);
assert(/energised at its saved/.test(await text(c,'#msg')),'selecting a joint holds it at its saved pulse');
const before=await text(c,'#pulse');await c.click('[data-n="10"]');await c.waitForTimeout(300);assert(before!==await text(c,'#pulse'),'nudge changes the pulse');
await c.click('#hold-all');await c.waitForTimeout(1500);await c.click('[data-test="1"]');await c.waitForTimeout(400);
assert(/1 RUN HERE/.test(await text(c,'#tests-count')),'calibration page counts tests');
await c.screenshot({path:outDir+'/calibration-portrait.png',fullPage:true});await c.close();
const cl=await page(844,390);await cl.goto(base+'/deck/calibration.html?preview=1');await cl.waitForTimeout(800);await cl.click('.joint[data-id="0"]');await cl.waitForTimeout(400);await cl.screenshot({path:outDir+'/calibration-landscape.png'});await cl.close();
await b.close();
if(errs.length){console.error('page errors:',errs);process.exit(1);}
console.log('\nheadless preview check passed, no page errors');
})().catch(e=>{console.error(e);process.exit(1);});
