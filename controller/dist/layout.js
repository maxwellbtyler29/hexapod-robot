// Restore the sketch's three columns on phone landscape: library, settings, joystick.
const drive=document.querySelector('.drive');const settings=document.createElement('div');settings.className='drive-settings';const stick=document.createElement('div');stick.className='drive-stick';
for(const selector of ['.field-label','select','.speed-label','input[type=range]','.range-labels'])settings.appendChild(drive.querySelector(selector));
const label=document.createElement('div');label.className='landscape-settings-title';label.textContent='Movement settings';settings.prepend(label);
const readout=document.createElement('div');readout.className='landscape-readout';readout.innerHTML='<span class="eyebrow">INTERFACE PREVIEW</span><strong>Let’s move<span>.</span></strong><p>Choose a mode.<br>Make it your own.</p>';settings.appendChild(readout);
for(const selector of ['.panel-heading','.joystick-wrap','#enable','.hint'])stick.appendChild(drive.querySelector(selector));drive.append(settings,stick);
const rotate=document.createElement('aside');rotate.className='rotate-prompt';rotate.innerHTML='<span aria-hidden="true">↻</span><strong>A better view, sideways.</strong><p>Rotate your iPhone to landscape<br>to use the controller.</p>';document.body.appendChild(rotate);
matchMedia('(orientation: portrait)').addEventListener('change',()=>stop('Simulation paused after rotating the screen.'));

