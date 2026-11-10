'use strict';
// Orthographic projection of a raised chassis and articulated limbs, depth sorted each frame.
const canvas=$('hologram'),ctx=canvas.getContext('2d');let cw=1,ch=1;
new ResizeObserver(()=>{const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);cw=r.width;ch=r.height;canvas.width=Math.round(cw*d);canvas.height=Math.round(ch*d);ctx.setTransform(d,0,0,d,0,0);}).observe(canvas);
function drawHologram(now){
 if(!startup.hidden&&!document.hidden){
 const spin=lowMotion?.55:now*.00019,k=Math.min(cw/480,ch/285),cx=cw/2,cy=ch*.54;
 const project=p=>{const a=p[0]*Math.cos(spin)-p[2]*Math.sin(spin),b=p[0]*Math.sin(spin)+p[2]*Math.cos(spin);return [cx+a*k,cy+(b*.49-p[1]*.87)*k,b*.87+p[1]*.49];};
 ctx.clearRect(0,0,cw,ch);const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,cw*.4);glow.addColorStop(0,'#00c8ff18');glow.addColorStop(1,'#00c8ff00');ctx.fillStyle=glow;ctx.fillRect(0,0,cw,ch);
 const line=(points,color,width=1)=>{ctx.beginPath();points.forEach((p,i)=>{const q=project(p);i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);});ctx.strokeStyle=color;ctx.lineWidth=width*k;ctx.stroke();};
 for(const r of [155,184,202]){const ring=[];for(let j=0;j<=100;j++){const a=j/100*Math.PI*2;ring.push([Math.cos(a)*r,-35,Math.sin(a)*r]);}line(ring,'#38c9fa30');}
 for(let j=0;j<36;j++){const a=j/36*Math.PI*2;line([[Math.cos(a)*190,-35,Math.sin(a)*190],[Math.cos(a)*(j%3?195:202),-35,Math.sin(a)*(j%3?195:202)]],'#46dfff70');}
 const items=[],vertices=(h,r)=>Array.from({length:6},(_,i)=>{const a=Math.PI/6+i*Math.PI/3;return [Math.cos(a)*r,h,Math.sin(a)*r];}),top=vertices(44,60),bottom=vertices(24,60);
 for(let i=0;i<6;i++){const j=(i+1)%6;items.push({kind:'face',points:[bottom[i],bottom[j],top[j],top[i]],fill:'#0c4054dd'});}items.push({kind:'face',points:top,fill:'#123a4be8'});
 for(let i=0;i<6;i++){const s=i<3?-1:1,r=i%3;items.push({kind:'leg',points:[[s*48,28,(r-1)*43],[s*87,36,(r-1)*72],[s*140,4,(r-1)*105],[s*164,-32,(r-1)*117]]});}
 items.sort((a,b)=>a.points.reduce((s,p)=>s+project(p)[2],0)/a.points.length-b.points.reduce((s,p)=>s+project(p)[2],0)/b.points.length);
 for(const item of items){if(item.kind==='face'){ctx.beginPath();item.points.forEach((p,i)=>{const q=project(p);i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);});ctx.closePath();ctx.fillStyle=item.fill;ctx.fill();ctx.strokeStyle='#7ae9ff';ctx.lineWidth=1.2*k;ctx.stroke();}else{line(item.points,'#04202d',13);line(item.points,'#2d728a',8);line(item.points,'#9bf3ff',1.3);item.points.forEach((p,i)=>{const q=project(p);ctx.beginPath();ctx.arc(q[0],q[1],(i===3?3:4.5)*k,0,Math.PI*2);ctx.fillStyle=i===3?'#96ffff':'#123d50';ctx.fill();ctx.strokeStyle='#6eecff';ctx.lineWidth=1.3*k;ctx.stroke();});}}
 const core=project([0,46,0]);ctx.save();ctx.shadowColor='#42e8ff';ctx.shadowBlur=18;ctx.strokeStyle='#95faff';ctx.lineWidth=2*k;ctx.beginPath();ctx.ellipse(core[0],core[1],17*k,8.5*k,0,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#b5ffff';ctx.beginPath();ctx.ellipse(core[0],core[1],5*k,2.5*k,0,0,Math.PI*2);ctx.fill();ctx.restore();for(let j=-2;j<=2;j++)line([[-15,45,j*7+31],[15,45,j*7+31]],'#4ccce0');
 }requestAnimationFrame(drawHologram);
}requestAnimationFrame(drawHologram);
