"""Plot and independently check the teaching trajectory; does not run Simscape."""
from pathlib import Path
import numpy as np

OUT = Path(__file__).resolve().parent
front = np.array([200., 10., -100.])
rear = np.array([200., -10., -100.])
P = np.array([rear, rear + [0,0,40/3], front + [0,0,40/3], front])
def smooth(u):
    return 10*u**3 - 15*u**4 + 6*u**5
def bez(s):
    return (1-s)**3*P[0] + 3*(1-s)**2*s*P[1] + 3*(1-s)*s**2*P[2] + s**3*P[3]
def path(t):
    if t < 1: return front.copy()
    tau = (t-1) % 3
    if tau < 2:
        s = smooth(tau/2)
        return (1-s)*front + s*rear
    return bez(smooth(tau-2))

times = np.linspace(0, 7, 7001)
points = np.array([path(t) for t in times])
assert np.allclose(path(3), rear)
assert np.allclose(path(3.5), [200,0,-90])
assert np.allclose(path(4), front)
assert np.allclose(points[:,0], 200)
assert points[:,2].min() >= -100-1e-10 and points[:,2].max() <= -90+1e-10
for t in [1,3,4,6,7]:
    assert np.linalg.norm(path(t+1e-5)-path(t-1e-5)) < 1e-6

a,b,L,hipz = 60.,156.33,31.8,-15.15
q = []
err = []
for x,y,z in points:
    psi = np.arctan2(y,x)
    d,v = np.hypot(x,y)-L,z-hipz
    D = (d*d+v*v-a*a-b*b)/(2*a*b)
    assert d>0 and -1<D<1
    delta = -np.arccos(D)
    phi = np.arctan2(v,d)-np.arctan2(b*np.sin(delta),a+b*np.cos(delta))
    rr = L+a*np.cos(phi)+b*np.cos(phi+delta)
    fk = [rr*np.cos(psi),rr*np.sin(psi),hipz+a*np.sin(phi)+b*np.sin(phi+delta)]
    err.append(np.linalg.norm(np.array(fk)-[x,y,z]))
    q.append([np.pi+psi,1.5*np.pi-(phi-np.deg2rad(-.43)),delta-np.deg2rad(-21.09)])
print('7001 trajectory samples reachable in approximate IK.')
print('Max numerical IK/FK error (mm):', max(err))
print('Joint angle ranges (deg):', np.rad2deg(np.array(q)).min(axis=0), np.rad2deg(np.array(q)).max(axis=0))
print('Endpoint continuity and peak lift checks passed. No Simscape or collision validation performed.')

def xy(y,z): return 450+22*y, 365-17*(z+100)
def txt(x,y,s,color='#334155',size=17,anchor='middle'):
    return f'<text x="{x}" y="{y}" fill="{color}" font-size="{size}" text-anchor="{anchor}">{s}</text>'
parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="900" height="475" viewBox="0 0 900 475">',
         '<rect width="900" height="475" fill="#f8fafc"/>', '<g font-family="Arial, sans-serif">',
         txt(450,38,'ONE FOOT STEP',size=25),txt(450,66,'Local X stays at 200 mm',size=17)]
for zz in [-100,-95,-90]:
    yy=xy(0,zz)[1]
    parts += [f'<path d="M160 {yy} H740" stroke="#dce4eb"/>',txt(140,yy+6,str(zz),size=15,anchor='end')]
parts += [txt(105,110,'Z (mm)',size=15),
          '<path d="M230 365 V138.333 H670 V365" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6 6"/>',
          '<path d="M230 365 C230 138.333 670 138.333 670 365" fill="none" stroke="#087f8c" stroke-width="5"/>',
          '<path d="M230 365 H670" stroke="#e58a20" stroke-width="5"/>',
          '<path d="M480 365 H420 L431 357 M420 365 L431 373" fill="none" stroke="#a65700" stroke-width="3"/>',
          '<path d="M420 200 H480 L469 192 M480 200 L469 208" fill="none" stroke="#087f8c" stroke-width="3"/>',
          txt(450,172,'Swing: rear to front',color='#087f8c'),txt(450,349,'Stance: front to rear',color='#a65700'),
          txt(450,258,'Peak lift = 10 mm'),txt(450,280,'Middle control points sit 13.33 mm above the baseline',size=14)]
for i,(_,y,z) in enumerate(P):
    xx,yy=xy(y,z)
    parts += [f'<circle cx="{xx}" cy="{yy}" r="5" fill="#334155"/>',txt(xx,yy+27 if i in [0,3] else yy-13,f'P{i}',size=17)]
parts += [txt(230,420,'Rear: Y = -10 mm'),txt(670,420,'Front: Y = +10 mm'),txt(450,455,'Dashed lines join the control points; the foot follows the colored path.',size=15),'</g></svg>']
(OUT/'foot_step_bezier.svg').write_text('\n'.join(parts),encoding='utf-8')
