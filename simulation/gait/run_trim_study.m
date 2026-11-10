%RUN_TRIM_STUDY  CoM shifts + Eco gait trims at weighed 1.75 kg.
%
%   The +40 mm forward CoM case is a simulation lever only. That battery
%   move was not built; the pack sits mid-to-aft. Outdoor walks in Eco and
%   Sport used the MG996Rs as assembled.
%
%   Builds HexGait_v6 once, then sweeps:
%     A) body CoM fore/aft via Solid CenterOfMass offset (+ bake)
%     B) Eco lift / stride / duty trims
%     C) combined "Eco portfolio" winner + Sport check
%
%   Writes trim/ (comparison table and plot). Does not replace results/.
%   Headless:  matlab -batch "run_trim_study"

clearvars; close all;
here = fileparts(mfilename('fullpath'));
cd(here);
outDir = fullfile(here, 'trim');
if ~exist(outDir, 'dir'), mkdir(outDir); end

p0 = hx_params();
p0.bodyMass = 0.370;
p0.printMassScale = 0.881091843141613;
p0.resultsDir = 'trim';

% ---- locate model ----
cands = {fullfile(here, '..'), fullfile(here, '..', 'simscape')};
srcDir = '';
for i = 1:numel(cands)
    if exist(fullfile(cands{i}, 'hex_simulation_standing.slx'), 'file'), srcDir = cands{i}; break; end
end
assert(~isempty(srcDir), 'Could not find hex_simulation_standing.slx');
old = cd(srcDir); srcDir = pwd; cd(old);
addpath(srcDir);

% ---- CAD + weighed masses ----
evalin('base', sprintf('run(''%s'');', fullfile(srcDir, 'simscape_data.m')));
smiData = evalin('base', 'smiData');
bodyIdx = [];
for i = 1:numel(smiData.Solid)
    id = char(smiData.Solid(i).ID); s = 1;
    if any(startsWith(id, {'Opposite support', 'Servo2 to Servo3', 'Leg and servo 3', 'Servo1 to Servo 2'}))
        s = p0.printMassScale;
    elseif startsWith(id, 'Hexapod body')
        s = p0.bodyMass / smiData.Solid(i).mass;
        bodyIdx = i;
    end
    smiData.Solid(i).mass = smiData.Solid(i).mass * s;
    smiData.Solid(i).MoI  = smiData.Solid(i).MoI * s;
    smiData.Solid(i).PoI  = smiData.Solid(i).PoI * s;
end
assert(~isempty(bodyIdx), 'Hexapod body Solid not found');
bodyCom0 = smiData.Solid(bodyIdx).CoM;   % mm, Solid local frame
assignin('base', 'smiData', smiData);
fprintf('Body Solid CoM CAD (scaled mass): %s mm\n', mat2str(bodyCom0, 6));

% ---- build once ----
hxp = p0; hxp.planeZmm = -2000;
assignin('base', 'hxp', hxp);
mdl = hx_build_model(srcDir, here);
hx_bake_masses(mdl);
totalMass = hx_total_mass(mdl);
fprintf('Simulated robot mass: %.3f kg\n', totalMass);
try, set_param(mdl, 'SimulationCommand', 'update'); catch, end

% ---- floor at ready pose ----
q0 = hx_ready_pose(p0);
setCommands(p0, [0; 1], repmat(reshape(q0, 1, 6, 3), 2, 1));
out0 = sim(mdl, 'StopTime', '0.002');
z0 = zeros(1, 6);
for l = 1:6
    f = hx_ts(out0, ['foot_' p0.legs{l}], 0); z0(l) = f(3);
end
hxp.planeZmm = median(z0) + p0.contact.preloadMm;
assignin('base', 'hxp', hxp);
fprintf('Floor at %.3f mm\n', hxp.planeZmm);

% ---- discover which Solid CoM axis is fore/aft (standing femur LF vs LR) ----
axisInfo = discoverForeAftAxis(mdl, smiData, bodyIdx, bodyCom0, p0, q0);
fprintf('Fore(+)/aft(-) Solid CoM axis = %d (%s); sign so +offset = forward\n', ...
    axisInfo.axis, axisInfo.name);

% ---- case list ----
cases = {};
% A) CoM Eco
for d = [0, +20, +40, -20, -40]
    c.name = sprintf('com_%+dmm_eco', d);
    c.mode = 'Eco'; c.comFwdMm = d; c.liftScale = 1; c.strideScale = 1; c.duty = p0.gait.DUTY;
    c.note = sprintf('CoM %+d mm fore (Solid axis %d*%+d)', d, axisInfo.axis, axisInfo.sign);
    cases{end+1} = c; %#ok<SAGROW>
end
% B) Eco gait trims (baseline CoM)
for ls = [0.75, 0.50]
    c.name = sprintf('lift_x%.2f_eco', ls);
    c.mode = 'Eco'; c.comFwdMm = 0; c.liftScale = ls; c.strideScale = 1; c.duty = p0.gait.DUTY;
    c.note = sprintf('lift x%.2f (%d us)', ls, round(p0.gait.lift * ls));
    cases{end+1} = c; %#ok<SAGROW>
end
for ss = [0.75, 0.50]
    c.name = sprintf('stride_x%.2f_eco', ss);
    c.mode = 'Eco'; c.comFwdMm = 0; c.liftScale = 1; c.strideScale = ss; c.duty = p0.gait.DUTY;
    c.note = sprintf('stride x%.2f (%d us)', ss, round(p0.gait.stride * ss));
    cases{end+1} = c; %#ok<SAGROW>
end
for dty = [0.60, 0.65]
    c.name = sprintf('duty_%.2f_eco', dty);
    c.mode = 'Eco'; c.comFwdMm = 0; c.liftScale = 1; c.strideScale = 1; c.duty = dty;
    c.note = sprintf('duty %.2f', dty);
    cases{end+1} = c; %#ok<SAGROW>
end

% Extra balanced Eco trims (no CoM)
c.name = 'stride75_duty60_eco'; c.mode = 'Eco'; c.comFwdMm = 0;
c.liftScale = 1; c.strideScale = 0.75; c.duty = 0.60;
c.note = 'stride x0.75 + duty 0.60'; cases{end+1} = c; %#ok<SAGROW>
c.name = 'lift75_stride75_duty60_eco'; c.mode = 'Eco'; c.comFwdMm = 0;
c.liftScale = 0.75; c.strideScale = 0.75; c.duty = 0.60;
c.note = 'lift x0.75 + stride x0.75 + duty 0.60'; cases{end+1} = c; %#ok<SAGROW>

% Run A+B first, pick best CoM and modest trim, then combined + Sport
T = runCases(mdl, smiData, bodyIdx, bodyCom0, axisInfo, p0, q0, cases, outDir);

% Pick best CoM among A (lowest Eco femur % with walkedForward)
comRows = T(startsWith({T.name}, 'com_') & strcmp({T.mode}, 'Eco'));
[~, iBestCom] = min([comRows.femurPct]);
bestCom = comRows(iBestCom);
fprintf('\nBest CoM case: %s femur=%.1f%%\n', bestCom.name, bestCom.femurPct);

% Combined candidates: best CoM + modest lift/stride (prefer clearance > 10)
combo = {};
c.name = 'portfolio_eco'; c.mode = 'Eco';
c.comFwdMm = bestCom.comFwdMm; c.liftScale = 0.75; c.strideScale = 0.75; c.duty = 0.60;
c.note = sprintf('best CoM %+d + lift x0.75 + stride x0.75 + duty 0.60', bestCom.comFwdMm);
combo{end+1} = c;
c.name = 'portfolio_mild_eco'; c.mode = 'Eco';
c.comFwdMm = bestCom.comFwdMm; c.liftScale = 0.75; c.strideScale = 0.85; c.duty = p0.gait.DUTY;
c.note = sprintf('best CoM %+d + lift x0.75 + stride x0.85', bestCom.comFwdMm);
combo{end+1} = c;
% Sport at baseline and at best CoM / portfolio
c.name = 'baseline_sport'; c.mode = 'Sport';
c.comFwdMm = 0; c.liftScale = 1; c.strideScale = 1; c.duty = p0.gait.DUTY;
c.note = 'Sport @ weighed mass, baseline CoM/gait';
combo{end+1} = c;
c.name = 'bestcom_sport'; c.mode = 'Sport';
c.comFwdMm = bestCom.comFwdMm; c.liftScale = 1; c.strideScale = 1; c.duty = p0.gait.DUTY;
c.note = sprintf('Sport @ best CoM %+d mm', bestCom.comFwdMm);
combo{end+1} = c;

T2 = runCases(mdl, smiData, bodyIdx, bodyCom0, axisInfo, p0, q0, combo, outDir);
T = [T, T2];

% Re-run portfolio Eco with full plots if it cleared / is best Eco
ecoT = T(strcmp({T.mode}, 'Eco'));
% Prefer femur<=95%, clearance>=10 mm, walks forward; among those maximize speed.
% Fallback: lowest femur among walking cases with clearance>=10.
ok = false(1, numel(ecoT));
for i = 1:numel(ecoT)
    ok(i) = ecoT(i).walkedForward && ecoT(i).clearanceMm >= 10 && ecoT(i).femurPct <= 95;
end
if any(ok)
    cand = ecoT(ok); [~, iWin] = max([cand.speedMmS]); win = cand(iWin);
else
    score = [ecoT.femurPct];
    for i = 1:numel(ecoT)
        if ~ecoT(i).walkedForward, score(i) = score(i) + 50; end
        if ecoT(i).clearanceMm < 10, score(i) = score(i) + 20; end
    end
    [~, iWin] = min(score); win = ecoT(iWin);
end
fprintf('\nWinning Eco case: %s femur=%.1f%% clearance=%.1f mm speed=%.1f mm/s\n', ...
    win.name, win.femurPct, win.clearanceMm, win.speedMmS);

% Full save/plots for winner
[Rw, Sw, pw] = simOne(mdl, smiData, bodyIdx, bodyCom0, axisInfo, p0, q0, win, true);
winDir = fullfile(outDir, ['win_' win.name]);
if ~exist(winDir, 'dir'), mkdir(winDir); end
hx_save(Rw, Sw, pw, winDir);
hx_plots(Rw, Sw, pw, winDir);
save(fullfile(winDir, 'gait_study_v6.mat'), 'Rw', 'Sw', 'pw', '-v7.3');

% Also Sport for win CoM+gait if Eco win had trims
sportCase = win; sportCase.mode = 'Sport'; sportCase.name = ['win_' win.name '_sport'];
[Rs, Ss, ps] = simOne(mdl, smiData, bodyIdx, bodyCom0, axisInfo, p0, q0, sportCase, false);
sportRow = summarizeCase(sportCase, Ss.mode(1), ps, totalMass);
T(end+1) = sportRow; %#ok<SAGROW>

writeSummaries(T, outDir, p0, totalMass, axisInfo, bodyCom0, win);
plotComparison(T, p0, outDir);

try, close_system(mdl, 0); catch, end
fprintf('\nTrim study done. See %s\n', outDir);
type(fullfile(outDir, 'summary_trim.txt'));

% =====================================================================
function T = runCases(mdl, smiData, bodyIdx, bodyCom0, axisInfo, p0, q0, cases, outDir)
T = struct('name', {}, 'mode', {}, 'comFwdMm', {}, 'liftScale', {}, 'strideScale', {}, ...
    'duty', {}, 'note', {}, 'coxaNm', {}, 'femurNm', {}, 'tibiaNm', {}, ...
    'coxaPct', {}, 'femurPct', {}, 'tibiaPct', {}, 'speedMmS', {}, 'clearanceMm', {}, ...
    'walkedForward', {}, 'distPerCycleMm', {}, 'bodyBobMm', {}, 'fracUnder3', {});
for i = 1:numel(cases)
    c = cases{i};
    fprintf('\n=== CASE %s (%s) ===\n', c.name, c.note);
    [~, S, p] = simOne(mdl, smiData, bodyIdx, bodyCom0, axisInfo, p0, q0, c, false);
    T(end+1) = summarizeCase(c, S.mode(1), p, NaN); %#ok<AGROW>
    fprintf('  peaks: coxa %.3f (%.0f%%) femur %.3f (%.0f%%) tibia %.3f (%.0f%%)  speed %.1f mm/s  clr %.1f mm\n', ...
        T(end).coxaNm, T(end).coxaPct, T(end).femurNm, T(end).femurPct, ...
        T(end).tibiaNm, T(end).tibiaPct, T(end).speedMmS, T(end).clearanceMm);
end
end

function row = summarizeCase(c, s, p, ~)
stall = p.servo.stallNm;
row.name = c.name; row.mode = c.mode; row.comFwdMm = c.comFwdMm;
row.liftScale = c.liftScale; row.strideScale = c.strideScale; row.duty = c.duty;
row.note = c.note;
row.coxaNm = s.peakByJoint(1); row.femurNm = s.peakByJoint(2); row.tibiaNm = s.peakByJoint(3);
row.coxaPct = 100*row.coxaNm/stall; row.femurPct = 100*row.femurNm/stall; row.tibiaPct = 100*row.tibiaNm/stall;
row.speedMmS = s.speedMmS; row.distPerCycleMm = s.distPerCycleMm; row.bodyBobMm = s.bodyBobMm;
row.clearanceMm = min([s.leg.clearanceMm]);
row.walkedForward = s.walkedForward; row.fracUnder3 = s.fracUnder3;
end

function [R, S, p] = simOne(mdl, smiData, bodyIdx, bodyCom0, axisInfo, p0, q0, c, ~)
p = p0;
p.gait.lift = p0.gait.lift * c.liftScale;
p.gait.stride = p0.gait.stride * c.strideScale;
p.gait.DUTY = c.duty;
% apply CoM offset in Solid local frame (+comFwdMm = forward)
off = [0 0 0];
off(axisInfo.axis) = axisInfo.sign * c.comFwdMm;
smiData.Solid(bodyIdx).CoM = bodyCom0 + off;
assignin('base', 'smiData', smiData);
hx_bake_masses(mdl);
try, set_param(mdl, 'SimulationCommand', 'update'); catch, end

if strcmpi(c.mode, 'Eco'), cycleMs = p.gait.ecoMs; else, cycleMs = p.gait.sportMs; end
T = cycleMs / 1000;
g = hx_gait_v6(p, cycleMs, p.nCycles * T);
q = hx_joint_angles(p, g.us, q0);
t = [0; p.tSettle + g.t];
q = [reshape(q0, 1, 6, 3); q];
setCommands(p, t, q);
tEnd = p.tSettle + p.nCycles * T;
fprintf('Simulating %s %.1fs... ', c.mode, tEnd); tic;
out = sim(mdl, 'StopTime', num2str(tEnd));
fprintf('%.0fs\n', toc);

r.mode = c.mode; r.cycleS = T; r.tSettle = p.tSettle;
r.t = (0:p.logDt:tEnd)';
n = numel(r.t);
r.tau = zeros(n, 6, 3); r.foot = zeros(n, 6, 3); r.fn = zeros(n, 6);
for l = 1:6
    r.tau(:, l, :)  = reshape(hx_ts(out, ['tau_' p.legs{l}], r.t), n, 1, 3);
    r.foot(:, l, :) = reshape(hx_ts(out, ['foot_' p.legs{l}], r.t), n, 1, 3);
    r.fn(:, l)      = hx_ts(out, ['fn_' p.legs{l}], r.t);
end
r.body  = hx_ts(out, 'body_xyz', r.t);
r.bodyQ = hx_ts(out, 'body_q', r.t);
k = floor((r.t - p.tSettle) / (p.tickMs/1000) + 1e-9) + 1;
k = max(1, min(numel(t), k));
r.qcmd = q(k, :, :);
sw = [false(1, 6); g.swing]; r.cmdSwing = sw(k, :);
ph = [0; g.phase]; r.phase = ph(k);
us = [zeros(1, 6, 3); g.us]; r.us = us(k, :, :);
r.gait = g; r.planeZmm = evalin('base', 'hxp.planeZmm');
R = r;
S = hx_analyze(R, p);
S.totalMassKg = hx_total_mass(mdl);
end

function info = discoverForeAftAxis(mdl, smiData, bodyIdx, bodyCom0, p, q0)
% Standing 0.6 s at ready pose; shift CoM +40 mm on Solid X then Z; pick
% the axis that lowers rear (LR/RR) femur mean relative to front (LF/RF).
setCommands(p, [0; 1], repmat(reshape(q0, 1, 6, 3), 2, 1));
base = standFemur(mdl, smiData, bodyIdx, bodyCom0, [0 0 0], 0.6);
names = {'X','Y','Z'};
bestScore = 0; have = false; info.axis = 3; info.sign = 1; info.name = 'Z';
for ax = [1 3]   % horizontal candidates in body Solid (Y ~ thin/up in CAD)
    off = [0 0 0]; off(ax) = 40;
    f = standFemur(mdl, smiData, bodyIdx, bodyCom0, off, 0.6);
    % score: want rear femur to drop and front to rise when shifting "forward"
    dRear = mean(base([3 6])) - mean(f([3 6]));   % positive if rear unloaded
    dFront = mean(f([1 4])) - mean(base([1 4])); % positive if front loaded
    score = dRear + dFront;
    fprintf('  CoM +40 on Solid %s: LF/LM/LR femur stand = %.3f/%.3f/%.3f (base %.3f/%.3f/%.3f) score=%.3f\n', ...
        names{ax}, f(1), f(2), f(3), base(1), base(2), base(3), score);
    if ~have || abs(score) > abs(bestScore)
        have = true; bestScore = score;
        info.axis = ax; info.name = names{ax};
        info.sign = sign(score); if info.sign == 0, info.sign = 1; end
    end
end
% restore CoM
smiData.Solid(bodyIdx).CoM = bodyCom0;
assignin('base', 'smiData', smiData);
hx_bake_masses(mdl);
end

function fem = standFemur(mdl, smiData, bodyIdx, bodyCom0, off, tEnd)
smiData.Solid(bodyIdx).CoM = bodyCom0 + off;
assignin('base', 'smiData', smiData);
hx_bake_masses(mdl);
try, set_param(mdl, 'SimulationCommand', 'update'); catch, end
out = sim(mdl, 'StopTime', num2str(tEnd));
p = hx_params();
t = (0:1e-3:tEnd)';
fem = zeros(1, 6);
for l = 1:6
    tau = hx_ts(out, ['tau_' p.legs{l}], t);
    fem(l) = mean(abs(tau(t > 0.2, 2)));
end
end

function writeSummaries(T, outDir, p0, totalMass, axisInfo, bodyCom0, win)
fid = fopen(fullfile(outDir, 'comparison_table.csv'), 'w');
fprintf(fid, ['case,mode,com_fwd_mm,lift_scale,stride_scale,duty,' ...
    'peak_coxa_Nm,peak_femur_Nm,peak_tibia_Nm,' ...
    'peak_coxa_pct_stall,peak_femur_pct_stall,peak_tibia_pct_stall,' ...
    'speed_mm_s,dist_per_cycle_mm,clearance_mm,body_bob_mm,walked_forward,frac_under3,note\n']);
for i = 1:numel(T)
    r = T(i);
    fprintf(fid, '%s,%s,%.1f,%.3f,%.3f,%.3f,%.4f,%.4f,%.4f,%.1f,%.1f,%.1f,%.2f,%.2f,%.2f,%.2f,%d,%.3f,"%s"\n', ...
        r.name, r.mode, r.comFwdMm, r.liftScale, r.strideScale, r.duty, ...
        r.coxaNm, r.femurNm, r.tibiaNm, r.coxaPct, r.femurPct, r.tibiaPct, ...
        r.speedMmS, r.distPerCycleMm, r.clearanceMm, r.bodyBobMm, r.walkedForward, r.fracUnder3, r.note);
end
fclose(fid);

fid = fopen(fullfile(outDir, 'summary_trim.txt'), 'w');
fprintf(fid, 'Hexapod CoM + Eco trim study @ weighed 1.75 kg\n');
fprintf(fid, 'Date: 24 Oct 2026 (America/Chicago)\n');
fprintf(fid, 'Mass: bodyMass=0.370, printMassScale=0.8811, total=%.3f kg\n', totalMass);
fprintf(fid, 'MG996R stall: %.3f N*m\n', p0.servo.stallNm);
fprintf(fid, 'CoM mechanism: offset Hexapod body File Solid CenterOfMass in Solid local frame,\n');
fprintf(fid, '  then hx_bake_masses. Fore(+)/aft(-) = Solid %s * sign(%+d). CAD CoM=%s mm.\n', ...
    axisInfo.name, axisInfo.sign, mat2str(bodyCom0, 4));
fprintf(fid, 'Baseline gait: lift=%d us, stride=%d us, duty=%.2f, Eco=%.1fs\n\n', ...
    p0.gait.lift, p0.gait.stride, p0.gait.DUTY, p0.gait.ecoMs/1000);
fprintf(fid, '%-28s %5s %7s %7s %7s %7s %7s %7s %6s %5s\n', ...
    'case', 'mode', 'com_mm', 'lift', 'stride', 'duty', 'fem%%', 'tib%%', 'mm/s', 'clr');
fprintf(fid, '%s\n', repmat('-', 1, 100));
for i = 1:numel(T)
    r = T(i);
    fprintf(fid, '%-28s %5s %7.0f %7.2f %7.2f %7.2f %7.1f %7.1f %6.1f %5.1f\n', ...
        r.name, r.mode, r.comFwdMm, r.liftScale, r.strideScale, r.duty, ...
        r.femurPct, r.tibiaPct, r.speedMmS, r.clearanceMm);
end
fprintf(fid, '\nLowest Eco femur in this sweep (simulation only; not built on the robot): %s\n', win.name);
fprintf(fid, 'The +40 mm forward battery move was not built. The battery sits mid-to-aft.\n');
fprintf(fid, '  %s\n', win.note);
fprintf(fid, '  peak femur %.3f N*m (%.1f%% stall), tibia %.3f (%.1f%%), coxa %.3f (%.1f%%)\n', ...
    win.femurNm, win.femurPct, win.tibiaNm, win.tibiaPct, win.coxaNm, win.coxaPct);
fprintf(fid, '  body speed %.1f mm/s (%.1f mm/cycle), min clearance %.1f mm\n', ...
    win.speedMmS, win.distPerCycleMm, win.clearanceMm);
fclose(fid);
end

function plotComparison(T, p, outDir)
stall = p.servo.stallNm;
eco = T(strcmp({T.mode}, 'Eco'));
if isempty(eco), return; end
f = figure('Visible', 'off', 'Position', [100 100 1100 500]);
names = {eco.name};
fem = [eco.femurPct]; tib = [eco.tibiaPct]; cox = [eco.coxaPct];
x = 1:numel(eco);
b = bar(x, [cox; fem; tib]' ); %#ok<NASGU>
hold on;
yline(100, 'r-', 'LineWidth', 1.2);
yline(50, 'k--', 'LineWidth', 1);
set(gca, 'XTick', x, 'XTickLabel', names, 'XTickLabelRotation', 45);
ylabel('% of MG996R stall (0.948 N·m)');
title('Eco peak torque vs stall — CoM + gait trim cases @ 1.75 kg');
legend({'Coxa','Femur','Tibia','100% stall','50% design'}, 'Location', 'eastoutside');
grid on;
exportgraphics(f, fullfile(outDir, 'peak_torque_comparison.png'), 'Resolution', 150);
close(f);
end

function setCommands(p, t, q)
for l = 1:6
    assignin('base', ['qcmd_' p.legs{l}], [t, squeeze(q(:, l, :))]);
end
end
