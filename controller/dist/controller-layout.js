'use strict';
// Arrange the existing hardware controls without duplicating state or command handlers.
function buildControllerLayout(panel) {
 const dock=document.createElement('div');dock.className='pilot-deck';
 dock.innerHTML=`<section class="pilot-settings"><div class="pilot-title"><span class="eyebrow">P3DRO / CONTROL</span><h2 id="pilot-mode-title">Walk</h2></div><div id="pilot-mode-slot"></div><div id="pilot-mode-controls"></div><div id="pilot-speed-slot"></div><div id="pilot-ready-slot"></div><p id="pilot-gate" role="status"></p><div class="pilot-actions"><button id="pilot-arm" class="primary">Enable walking</button><button id="pilot-test" class="quiet">Test one step</button><button id="pilot-options" class="quiet">Tune step</button></div></section><section class="pilot-stick"><div class="pilot-stick-heading"><span>DRIVE</span><span id="pilot-output">OUTPUTS OFF</span></div><div id="pilot-stick-slot"></div><p id="pilot-instruction"></p><div id="pilot-precision"></div><p id="pilot-message" role="status">Connected. Outputs off.</p></section>`;
 panel.before(dock);
 const move=(id,slot,label=false)=>{const el=$(id);$(slot).append(label?el.closest('label'):el);};
 move('hw-mode','pilot-mode-slot',true);
 $('hw-mode').innerHTML='<option value="walk">Walk · forward / backward</option><option value="crab">Crabwalk · sideways</option><option value="manual">Manual · individual joints</option><option value="setup">Setup · calibrate & save</option>';
 const modeControls=$('pilot-mode-controls');
 for(const id of ['hw-target','hw-axis','hw-joint','hw-crab-direction']){const el=$(id).closest('label');el.classList.add('pilot-field');el.dataset.field=id;modeControls.append(el);}
 const recover=document.createElement('button');recover.id='pilot-recover';recover.className='quiet';recover.textContent='Restore calibration backup';$('pilot-gate').after(recover);recover.onclick=()=>api.open('backup');
 const speedLabel=panel.querySelector('label[for="hw-speed"]');$('pilot-speed-slot').append(speedLabel,$('hw-speed'));
 $('pilot-ready-slot').append($('hw-ready').closest('label'),$('hw-gait-ready').closest('label'));
 $('hw-ready').parentNode.lastChild.textContent=' Robot clear and ready to move';
 $('hw-gait-ready').parentNode.lastChild.textContent=' Ready poses & step clearance checked';
 const stick=document.querySelector('.drive-stick');$('pilot-stick-slot').append(stick);
 $('enable').hidden=true;stick.querySelector('.panel-heading').hidden=true;stick.querySelector('.hint').hidden=true;
 $('pilot-precision').append($('hw-minus'),$('hw-pulse').closest('label'),$('hw-plus'),$('hw-apply-pulse'));
 $('pilot-arm').after($('hw-save-single'));
 $('hw-save-single').textContent='Save ready position';$('hw-apply-pulse').textContent='Move';
 const sheet=document.createElement('dialog');sheet.id='pilot-sheet';sheet.innerHTML='<div class="sheet-heading"><h2 id="pilot-sheet-title">Controller settings</h2><button id="pilot-sheet-off" class="stop">■ Outputs off</button><button id="pilot-sheet-close" class="quiet" aria-label="Close settings">Done</button></div><nav id="pilot-tabs"></nav><div id="pilot-pages"></div>';
 document.body.append(sheet);
 const pages={};
 for(const [key,title] of [['walk','Step tuning'],['crab','Crab poses'],['capture','Capture crab'],['limits','Joint limits'],['backup','Backup'],['commands','Joint values'],['manual','Manual tools']]){
  const page=document.createElement('section');page.className='pilot-page';page.dataset.page=key;pages[key]=page;$('pilot-pages').append(page);
  const tab=document.createElement('button');tab.className='quiet';tab.textContent=title;tab.dataset.page=key;tab.onclick=()=>showPage(key);$('pilot-tabs').append(tab);
 }
 pages.walk.append(panel.querySelector('.walk-controls'));pages.crab.append(panel.querySelector('.crab-controls'));
 const details=panel.querySelectorAll('details');for(const [i,key] of ['limits','backup','commands'].entries()){const d=details[i];d.open=true;pages[key].append(d);}
 pages.manual.append(panel.querySelector('.manual-only'),$('hw-foot-target').previousElementSibling,$('hw-foot-target'),$('hw-disconnect'));
 pages.capture.append(panel.querySelector('.setup-controls'));
 panel.hidden=true;panel.classList.add('legacy-controls');
 function showPage(key){for(const [name,page] of Object.entries(pages))page.hidden=name!==key;for(const tab of $('pilot-tabs').children)tab.setAttribute('aria-selected',String(tab.dataset.page===key));}
 function close(){sheet.close();$('pilot-options').focus({preventScroll:true});}
 $('pilot-sheet-close').onclick=close;$('pilot-sheet-off').onclick=()=>stop('Outputs off.');sheet.addEventListener('cancel',e=>{e.preventDefault();close();});
 const api={open(key){showPage(key);sheet.showModal();},close(){if(sheet.open)sheet.close();},sync({mode,armed,busy,walking,single,reason,readyCount}){
  $('pilot-mode-title').textContent={walk:'Walk',crab:'Crabwalk',manual:'Manual',setup:'Setup'}[mode];
  for(const el of modeControls.children)el.hidden=el.dataset.field==='hw-target'?!(mode==='manual'||mode==='setup'):el.dataset.field==='hw-axis'?mode!=='manual':el.dataset.field==='hw-crab-direction'?mode!=='crab':mode!=='setup';
  recover.hidden=!reason.includes('positions missing');
  const available={walk:['walk','backup','commands'],crab:['crab','backup','commands'],setup:['limits','capture','backup','commands'],manual:['manual','backup','commands']}[mode];
  for(const tab of $('pilot-tabs').children)tab.hidden=!available.includes(tab.dataset.page);
  $('hw-gait-ready').closest('label').hidden=mode!=='walk';$('pilot-precision').hidden=mode!=='setup';
  $('pilot-output').textContent=walking?'STEPPING':armed?'OUTPUTS ON':'OUTPUTS OFF';$('pilot-output').classList.toggle('on',armed);
  $('pilot-gate').textContent=reason||(mode==='setup'?`${readyCount}/18 servo ready positions saved. Adjust with joystick or ±10 µs, then save.`:armed?'Enabled · joystick ready':'Ready to enable');
  $('pilot-arm').textContent=armed?'Outputs off':{walk:'Enable walking',crab:'Enable crabwalk',manual:'Enable selected legs',setup:'Center selected servo'}[mode];
  $('pilot-arm').disabled=busy||(!armed&&Boolean(reason));
  $('hw-save-single').hidden=mode!=='setup';
  $('pilot-test').hidden=mode!=='walk'&&mode!=='crab';$('pilot-test').textContent=mode==='crab'?`Test ${$('hw-crab-direction').value==='0'?'left':'right'} cycle`:'Test one step';
  $('pilot-options').textContent={walk:'Tune step',crab:'Tune crab poses',manual:'Foot & pose tools',setup:'Limits & backup'}[mode];
  $('pilot-instruction').textContent={walk:'Hold ↑ forward / ↓ backward. Release to finish the step.',crab:'Test each direction, then hold ← or →. Release to finish.',manual:'→ hip forward · ↑ knee lift. Release to hold.',setup:'Hip: ← → · Knee / foot: ↑ ↓. Save when aligned.'}[mode];
  for(const el of pages.limits.querySelectorAll('.setup-only'))el.hidden=false;
  for(const el of pages.backup.querySelectorAll('.setup-only'))el.hidden=false;
 }};return api;
}
