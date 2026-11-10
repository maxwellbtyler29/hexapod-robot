function g = hx_gait_v6(p, cycleMs, duration)
%HX_GAIT_V6  Line-by-line MATLAB port of the v6 firmware tripod gait.
%
%   g = hx_gait_v6(p, cycleMs, duration) runs hx::Gait::step() (gait.h) and
%   the output speed limiter in gaitTick() (six_leg_setup.cpp) every 20 ms
%   for `duration` seconds after GSTART, with the command p.command.
%
%   Output (k = tick index, l = leg 1..6 in firmware order, j = coxa/femur/tibia):
%     g.t(k)          time since GSTART, s (output applied at this instant)
%     g.us(k,l,j)     joint offset from the ready pulse, us, AFTER the speed cap
%     g.want(k,l,j)   offset the generator asked for, before the speed cap
%     g.phase(k)      global cycle phase 0..1
%     g.swing(k,l)    true while the generator has leg l in swing
%     g.lift(k,l)     0..1 lift fraction
%     g.capUsPerS     speed cap used, g.needUsPerS required speed
%
%   Offsets are "logical": + coxa = foot forward, + femur = foot up,
%   + tibia = foot tucks under. hx_joint_angles maps them to model joints.

G = p.gait;
dt = p.tickMs;                       % ms
n  = round(duration*1000/dt);

need = requiredSpeed(G, cycleMs);
if p.capSetting, cap = p.capSetting; else, cap = need*1.25 + 50; end
maxStep = cap*dt/1000;

% --- Gait::begin(cycle) ---
phase = 0; cycles = 0; cyc = cycleMs;            %#ok<NASGU>
drive = [0 0 0]; cmd = max(-1,min(1,p.command));
swing = false(1,6);
stanceHip = zeros(1,6); liftHip = zeros(1,6);
stanceReach = zeros(1,6); liftReach = zeros(1,6); lastReach = zeros(1,6);
out = zeros(6,3);
cur = zeros(6,3);                                 % limiter state = ready pose

g.t = (1:n)'*dt/1000;
g.us = zeros(n,6,3); g.want = zeros(n,6,3);
g.phase = zeros(n,1); g.swing = false(n,6); g.lift = zeros(n,6);

for k = 1:n
    % smooth command changes (full range in ~0.5 s)
    maxDelta = dt/500;
    for i = 1:3
        d = max(-maxDelta, min(maxDelta, cmd(i)-drive(i)));
        drive(i) = drive(i) + d;
        if abs(drive(i)) < 1e-4 && cmd(i) == 0, drive(i) = 0; end
    end
    phase = phase + dt/cyc; cycles = cycles + dt/cyc; %#ok<NASGU>
    if phase >= 1, phase = phase - 1; end
    for l = 0:5
        psi = phase + (~tripodA(l))*0.5; if psi >= 1, psi = psi - 1; end
        [hipAmp, reachAmp] = amplitudes(l, drive, G);
        inSwing = psi >= G.DUTY;
        L = l+1;
        if inSwing && ~swing(L)
            liftHip(L) = out(L,1); liftReach(L) = lastReach(L); swing(L) = true;
        elseif ~inSwing && swing(L)
            stanceHip(L) = hipAmp; stanceReach(L) = reachAmp; swing(L) = false;
        end
        lift = 0;
        if ~inSwing
            sigma = 1 - 2*trapezoid(psi/G.DUTY, G.RAMP/G.DUTY);
            hip = sigma*stanceHip(L); reach = sigma*stanceReach(L);
        else
            s = (psi - G.DUTY)/(1 - G.DUTY);
            u = minJerk((s - G.HIP_START)/(G.HIP_END - G.HIP_START));
            hip = liftHip(L) + (hipAmp - liftHip(L))*u;
            reach = liftReach(L) + (reachAmp - liftReach(L))*u;
            lift = liftProfile(s, G);
        end
        out(L,:) = [hip, lift*G.lift + reach*G.mix/100, lift*G.tuck - reach];
        lastReach(L) = reach;
        g.swing(k,L) = inSwing; g.lift(k,L) = lift;
    end
    % gaitTick(): per-joint speed cap toward the generator output
    d = max(-maxStep, min(maxStep, out - cur));
    cur = cur + d;
    g.us(k,:,:) = reshape(cur,1,6,3);
    g.want(k,:,:) = reshape(out,1,6,3);
    g.phase(k) = phase;
end
g.capUsPerS = cap; g.needUsPerS = need; g.cycleMs = cycleMs;
end

% ---------- helpers, identical to gait.h ----------
function a = tripodA(l), a = (l==0 || l==2 || l==4); end
function y = minJerk(u), u = max(0,min(1,u)); y = u^3*(10 + u*(-15 + 6*u)); end
function y = trapezoid(u, r)
u = max(0,min(1,u));
if r <= 0, y = u; return; end
v = 1/(1-r);
if u < r,       y = v*u*u/(2*r);
elseif u > 1-r, w = 1-u; y = 1 - v*w*w/(2*r);
else,           y = v*r/2 + v*(u-r);
end
end
function y = liftProfile(s, G)
if s <= 0 || s >= 1, y = 0;
elseif s < G.LIFT_UP,   y = 0.5*(1 - cos(pi*s/G.LIFT_UP));
elseif s > G.LIFT_DOWN, y = 0.5*(1 + cos(pi*(s-G.LIFT_DOWN)/(1-G.LIFT_DOWN)));
else, y = 1;
end
end
function [hipAmp, reachAmp] = amplitudes(l, drive, G)
f = drive(1); t = drive(2); left = l < 3;
if left, a = f + t; else, a = f - t; end
nrm = abs(f) + abs(t); if nrm > 1, a = a/nrm; end
hipAmp = a*G.stride*0.5;
reachAmp = drive(3)*(1 - 2*left)*G.reach*0.5;    % left -1, right +1
end
function m = requiredSpeed(G, cycleMs)
tsw = (1-G.DUTY)*cycleMs/1000;
hipT = (G.HIP_END-G.HIP_START)*tsw; upT = G.LIFT_UP*tsw;
hip = 1.875*G.stride/hipT;
lift = (pi/2)*G.lift/upT;
sweep = 1.875*G.reach/hipT;
knee = lift + sweep*G.mix/100;
foot = (pi/2)*G.tuck/upT + sweep;
m = max([hip knee foot]);
end
