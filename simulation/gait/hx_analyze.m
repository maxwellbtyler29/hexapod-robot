function S = hx_analyze(R, p)
%HX_ANALYZE  Turn the raw simulation logs into torque and gait-timing numbers.
%
%   Everything is measured on the last p.nAnalyse cycles (steady walking).
%   "Measured" stance = the foot's ground-contact normal force is above
%   p.stanceThresholdN. "Commanded" = what the firmware generator intended.
%   Travel frame: u = direction the body actually moved (world XY),
%   v = left of u, height = above the floor.

G = p.gait;
isB = [0 1 0 1 0 1];                         % tripod B legs: LM, RF, RR (phase +0.5)
for m = 1:numel(R)
    r = R(m); T = r.cycleS; dt = r.t(2) - r.t(1);
    t0 = r.tSettle + (p.nCycles - p.nAnalyse) * T;
    w  = r.t >= t0 - 1e-9 & r.t <= r.tSettle + p.nCycles * T + 1e-9;
    stand = r.t >= r.tSettle - 0.5 & r.t < r.tSettle;
    s.mode = r.mode; s.cycleCmdS = T; s.window = [t0, r.t(find(w, 1, 'last'))];

    % ---- body motion ----
    b = r.body(w, :); tw = r.t(w);
    dxy = b(end, 1:2) - b(1, 1:2);
    u = [dxy / norm(dxy), 0]; v = [-u(2) u(1) 0];
    s.travelDir = u;
    s.speedMmS  = norm(dxy) / (tw(end) - tw(1));
    s.distPerCycleMm = s.speedMmS * T;
    s.lateralDriftMm = (b(end, :) - b(1, :)) * v';
    s.bodyHeightMm   = mean(b(:, 3)) - r.planeZmm;
    s.bodyBobMm      = max(b(:, 3)) - min(b(:, 3));
    [yaw, tilt] = bodyAngles(r.bodyQ);
    s.yawDriftDeg = yaw(find(w, 1, 'last')) - yaw(find(w, 1));
    s.yawPerCycleDeg = s.yawDriftDeg / p.nAnalyse;
    s.maxTiltDeg  = max(tilt(w));
    s.bodyDropAtStandMm = r.body(1, 3) - mean(r.body(stand, 3));
    % did it walk forward? front legs should lie ahead of rear legs along u
    fp = squeeze(r.foot(find(w, 1), :, :));
    s.walkedForward = ((fp(1, :) + fp(4, :)) - (fp(3, :) + fp(6, :))) * u' > 0;

    % ---- contact / timing ----
    st = r.fn > p.stanceThresholdN;
    s.nDown = sum(st(w, :), 2);
    s.fracAllSix   = mean(s.nDown == 6);
    s.fracTripod   = mean(s.nDown == 3);
    s.fracUnder3   = mean(s.nDown < 3);
    s.peakFnN = max(r.fn(w, :));
    s.standFnN = mean(r.fn(stand, :));
    for l = 1:6
        sl = st(:, l) & w; e = diff([0; sl(:); 0]);
        td = r.t(e(1:end-1) == 1 & [true; ~w(1:end-1)] == 0);     % rising edges inside window
        lo = r.t(e(2:end) == -1 & w & [w(2:end); false]);         % falling edges inside window
        legPhase = @(tt) mod((tt - r.tSettle) / T + 0.5 * isB(l), 1);
        s.leg(l).name = p.legs{l};
        s.leg(l).dutyCmd  = G.DUTY;
        s.leg(l).dutyMeas = mean(st(w, l));
        s.leg(l).tdPhaseMeas = circMean(legPhase(td));
        s.leg(l).loPhaseMeas = circMean(legPhase(lo));
        s.leg(l).loPhaseCmd  = G.DUTY;  s.leg(l).tdPhaseCmd = 0;
        if numel(td) > 1, s.leg(l).cycleMeasS = mean(diff(td)); else, s.leg(l).cycleMeasS = NaN; end
        s.leg(l).nSteps = numel(td);

        f = squeeze(r.foot(:, l, :));
        rel = f - r.body;                                        % foot relative to body
        fwd = rel * u'; lat = rel * v'; hgt = f(:, 3) - r.planeZmm;
        s.leg(l).fwd = fwd; s.leg(l).lat = lat; s.leg(l).hgt = hgt;
        swc = r.cmdSwing(:, l) & w; stm = st(:, l) & w;
        s.leg(l).clearanceMm = max(hgt(swc)) - median(hgt(stm));
        s.leg(l).strideMm = robustRange(fwd(stm));               % foot travel vs body in stance
        % slip: how far a planted foot moves over the floor during one stance
        slip = [];
        for k = 1:numel(td)
            j = find(lo > td(k), 1); if isempty(j), continue; end
            i0 = find(r.t >= td(k) + 0.02, 1); i1 = find(r.t <= lo(j) - 0.02, 1, 'last');
            if i1 > i0, slip(end+1) = norm(f(i1, 1:2) - f(i0, 1:2)); end %#ok<AGROW>
        end
        s.leg(l).slipMm = mean(slip);
        if isempty(slip), s.leg(l).slipMm = NaN; end
    end

    % ---- torque ----
    s.peakNm  = squeeze(max(abs(r.tau(w, :, :)), [], 1));        % 6 x 3
    s.rmsNm   = squeeze(sqrt(mean(r.tau(w, :, :).^2, 1)));
    s.standNm = squeeze(mean(abs(r.tau(stand, :, :)), 1));
    s.peakByJoint = max(s.peakNm, [], 1);                        % 1 x 3
    [~, s.peakLeg] = max(s.peakNm, [], 1);
    s.rmsByJoint  = max(s.rmsNm, [], 1);
    s.peakPctStall = 100 * s.peakByJoint / p.servo.stallNm;
    % commanded joint speed (from the firmware ticks) for the torque-speed plot
    tq = r.tSettle + r.gait.t;
    qg = hx_joint_angles(p, r.gait.us, zeros(6, 3));
    wq = [zeros(1, 6, 3); diff(qg, 1, 1)] / (p.tickMs / 1000);
    keep = tq >= t0;
    tauTick = zeros(nnz(keep), 6, 3);
    idx = round((tq(keep) - r.t(1)) / dt) + 1; idx = min(idx, numel(r.t));
    tauTick(:, :, :) = r.tau(idx, :, :);
    s.opSpeedDps = abs(rad2deg(wq(keep, :, :)));
    s.opTorqueNm = abs(tauTick);
    s.peakCmdSpeedDps = squeeze(max(max(s.opSpeedDps, [], 1), [], 2))';
    s.requiredUsPerS = r.gait.needUsPerS; s.capUsPerS = r.gait.capUsPerS;
    s.requiredDps = r.gait.needUsPerS / p.usPerDeg;
    s.capDps = r.gait.capUsPerS / p.usPerDeg;
    S.mode(m) = s; %#ok<AGROW>
end
end

function [yaw, tilt] = bodyAngles(q)
% yaw about world Z and tilt from upright, relative to the first sample
n = size(q, 1); yaw = zeros(n, 1); tilt = zeros(n, 1);
R0 = qrot(q(1, :));
for i = 1:n
    Rr = qrot(q(i, :)) * R0';
    yaw(i) = atan2d(Rr(2, 1), Rr(1, 1));
    tilt(i) = acosd(max(-1, min(1, Rr(3, 3))));
end
yaw = rad2deg(unwrap(deg2rad(yaw)));
end

function R = qrot(q)
q = q / norm(q); s = q(1); x = q(2); y = q(3); z = q(4);
R = [1-2*(y^2+z^2), 2*(x*y-s*z), 2*(x*z+s*y);
     2*(x*y+s*z), 1-2*(x^2+z^2), 2*(y*z-s*x);
     2*(x*z-s*y), 2*(y*z+s*x), 1-2*(x^2+y^2)];
end

function m = circMean(ph)
if isempty(ph), m = NaN; return; end
m = mod(angle(mean(exp(2i*pi*ph))) / (2*pi), 1);
end

function r = robustRange(x)
if numel(x) < 5, r = NaN; return; end
x = sort(x); n = numel(x);
r = x(max(1, round(0.99*n))) - x(max(1, round(0.01*n)));
end
