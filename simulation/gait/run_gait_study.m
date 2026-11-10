%RUN_GAIT_STUDY  Simscape study of the v6 firmware tripod gait (Eco & Sport).
%
%   Run from this folder:   run_gait_study
%   Headless:               matlab -batch "run_gait_study"
%
%   What it does
%   1. Loads the CAD data (simscape_data.m) and applies the mass
%      settings in hx_params (printed-part scale, body mass).
%   2. Builds HexGait_v6.slx, a free-walking instrumented copy of
%      hex_simulation_standing.slx (see hx_build_model). Your original
%      models are only read, never saved.
%   3. Finds the floor height so all six feet start just touching the ground.
%   4. For each mode, runs the exact firmware gait generator (hx_gait_v6,
%      a port of gait.h + the 20 ms speed limiter), converts pulse offsets to
%      joint angles (hx_joint_angles) and simulates: 1.5 s standing, then
%      six walking cycles at full forward command.
%   5. Logs joint torques, foot positions, contact forces and body motion,
%      computes summaries (hx_analyze), writes CSV/MAT to results/ and plots
%      (hx_plots).
%
%   To try a different material/mass: edit hx_params (printMassScale,
%   bodyMass) or set overrides below, and re-run.

clearvars -except hxOverrides; close all;
here = fileparts(mfilename('fullpath'));
cd(here);
p = hx_params();
if exist('hxOverrides', 'var') && isstruct(hxOverrides)        % optional overrides
    for f = fieldnames(hxOverrides)', p.(f{1}) = hxOverrides.(f{1}); end
end

% ---- where your Simscape model and CAD files live ----
cands = {fullfile(here, '..'), fullfile(here, '..', 'simscape')};
srcDir = '';
for i = 1:numel(cands)
    if exist(fullfile(cands{i}, 'hex_simulation_standing.slx'), 'file'), srcDir = cands{i}; break; end
end
assert(~isempty(srcDir), 'Could not find hex_simulation_standing.slx next to this folder.');
old = cd(srcDir); srcDir = pwd; cd(old);   % tidy the path
addpath(srcDir);                          % STEP geometry is found on the path
% results/ by default; set hxOverrides.resultsDir to keep older runs
outName = 'results';
if isfield(p, 'resultsDir') && ~isempty(p.resultsDir), outName = p.resultsDir; end
outDir = fullfile(here, outName); if ~exist(outDir, 'dir'), mkdir(outDir); end
fprintf('Model folder: %s\nResults: %s\n', srcDir, outDir);

% ---- 1. CAD data and masses ----
evalin('base', sprintf('run(''%s'');', fullfile(srcDir, 'simscape_data.m')));
smiData = evalin('base', 'smiData');
massInfo = struct('id', {}, 'massCAD', {}, 'massSim', {});
for i = 1:numel(smiData.Solid)
    id = char(smiData.Solid(i).ID); s = 1;
    if any(startsWith(id, {'Opposite support', 'Servo2 to Servo3', 'Leg and servo 3', 'Servo1 to Servo 2'}))
        s = p.printMassScale;                        % printed parts
    elseif startsWith(id, 'Hexapod body')
        s = p.bodyMass / smiData.Solid(i).mass;      % body incl. battery/electronics
    end
    massInfo(end+1) = struct('id', id, 'massCAD', smiData.Solid(i).mass, ...
        'massSim', smiData.Solid(i).mass * s); %#ok<SAGROW>
    smiData.Solid(i).mass = smiData.Solid(i).mass * s;
    smiData.Solid(i).MoI  = smiData.Solid(i).MoI * s;   % same shape, scaled density
    smiData.Solid(i).PoI  = smiData.Solid(i).PoI * s;
end
assignin('base', 'smiData', smiData);
% Count instances of each Solid type so we can report per-leg mass.
for i = 1:numel(massInfo)
    id = massInfo(i).id;
    if startsWith(id, 'MG996R') || startsWith(id, 'Servo Horn') || startsWith(id, 'Opposite support')
        massInfo(i).count = 18;
    elseif startsWith(id, 'Servo2 to Servo3') || startsWith(id, 'Leg and servo 3') || startsWith(id, 'Servo1 to Servo 2')
        massInfo(i).count = 6;
    elseif startsWith(id, 'Hexapod body')
        massInfo(i).count = 1;
    else
        massInfo(i).count = 0;
    end
    if startsWith(id, 'Hexapod body'), massInfo(i).kind = 'body';
    elseif startsWith(id, 'MG996R') || startsWith(id, 'Servo Horn'), massInfo(i).kind = 'servo';
    elseif any(startsWith(id, {'Opposite support','Servo2 to Servo3','Leg and servo 3','Servo1 to Servo 2'}))
        massInfo(i).kind = 'print';
    else, massInfo(i).kind = 'other';
    end
end
sumSim = @(k) sum(arrayfun(@(m) m.massSim * m.count, massInfo(strcmp({massInfo.kind}, k))));
sumCAD = @(k) sum(arrayfun(@(m) m.massCAD * m.count, massInfo(strcmp({massInfo.kind}, k))));
fprintf(['Mass mapping:\n' ...
    '  bodyMass = %.3f kg (CAD body was %.3f kg)\n' ...
    '  printMassScale = %.4f on printed leg parts; MG996R + horns stay at CAD\n' ...
    '  legs: servos+horns %.3f kg (%.3f kg/leg) + printed %.3f kg (%.3f kg/leg) = %.3f kg (%.3f kg/leg)\n' ...
    '  total = %.3f kg (6 x 0.230 + 0.370 = 1.750 if those overrides are set)\n'], ...
    sumSim('body'), sumCAD('body'), p.printMassScale, ...
    sumSim('servo'), sumSim('servo')/6, sumSim('print'), sumSim('print')/6, ...
    sumSim('servo')+sumSim('print'), (sumSim('servo')+sumSim('print'))/6, ...
    sumSim('body')+sumSim('servo')+sumSim('print'));

% ---- 2. build the instrumented copy ----
hxp = p; hxp.planeZmm = -2000;           % floor far away for the calibration run
assignin('base', 'hxp', hxp);
mdl = hx_build_model(srcDir, here);
hx_bake_masses(mdl);   % write numeric Mass/MoI/PoI/CoM (compiletime-safe)
totalMass = hx_total_mass(mdl);
if totalMass == 0      % fallback if the block parameters could not be read
    cnt = [18 18 18 6 6 6 1];  % servos, supports, horns, conn2-3, leg mounts, conn1-2, body
    totalMass = sum(cnt .* [massInfo.massSim]);
end
fprintf('Simulated robot mass: %.3f kg\n', totalMass);
% File Solid Mass/MoI use Mass_conf=compiletime, so a prior HexGait_v6 compile
% can keep old numeric masses even after smiData changes. Force a fresh update.
try
    set_param(mdl, 'SimulationCommand', 'update');
catch err
    warning('hx:update', 'Model update before sim failed: %s', err.message);
end

% ---- 3. floor height: feet just touching at the ready pose ----
q0 = hx_ready_pose(p);
setCommands(p, [0; 1], repmat(reshape(q0, 1, 6, 3), 2, 1));
out0 = sim(mdl, 'StopTime', '0.002');
z0 = zeros(1, 6);
for l = 1:6
    f = hx_ts(out0, ['foot_' p.legs{l}], 0); z0(l) = f(3);
end
hxp.planeZmm = median(z0) + p.contact.preloadMm;
assignin('base', 'hxp', hxp);
fprintf('Foot tips at ready pose: z = %s mm (spread %.2f mm); floor set to %.3f mm\n', ...
    mat2str(round(z0, 2)), max(z0) - min(z0), hxp.planeZmm);

% ---- 4. simulate both modes ----
modes = {'Eco', p.gait.ecoMs; 'Sport', p.gait.sportMs};
R = struct([]);
for m = 1:size(modes, 1)
    T = modes{m, 2} / 1000;
    g = hx_gait_v6(p, modes{m, 2}, p.nCycles * T);
    q = hx_joint_angles(p, g.us, q0);
    t = [0; p.tSettle + g.t];                      % ready pose until GSTART
    q = [reshape(q0, 1, 6, 3); q];
    setCommands(p, t, q);
    tEnd = p.tSettle + p.nCycles * T;
    fprintf('Simulating %s (%.1f s cycle, %.1f s)... ', modes{m, 1}, T, tEnd); tic;
    out = sim(mdl, 'StopTime', num2str(tEnd));
    fprintf('done in %.0f s\n', toc);

    r.mode = modes{m, 1}; r.cycleS = T; r.tSettle = p.tSettle;
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
    % commanded signals on the same grid (zero-order hold, like the PWM)
    % row 1 = ready pose (t < first tick), row k+1 = output of firmware tick k
    k = floor((r.t - p.tSettle) / (p.tickMs/1000) + 1e-9) + 1;
    k = max(1, min(numel(t), k));
    r.qcmd = q(k, :, :);
    sw = [false(1, 6); g.swing]; r.cmdSwing = sw(k, :);
    ph = [0; g.phase]; r.phase = ph(k);
    us = [zeros(1, 6, 3); g.us]; r.us = us(k, :, :);
    r.gait = g; r.planeZmm = hxp.planeZmm;
    R = [R, r]; %#ok<AGROW>
end

% ---- 5. analyse, save, plot ----
S = hx_analyze(R, p);
S.totalMassKg = totalMass; S.masses = massInfo; S.footZ0 = z0;
hx_save(R, S, p, outDir);
hx_plots(R, S, p, outDir);
save(fullfile(outDir, 'gait_study_v6.mat'), 'R', 'S', 'p', '-v7.3');
fprintf('\nAll results written to %s\n', outDir);
type(fullfile(outDir, 'summary.txt'));

% ======================================================================
function setCommands(p, t, q)
% one From Workspace matrix per leg: [time, coxa, femur, tibia] (rad)
for l = 1:6
    assignin('base', ['qcmd_' p.legs{l}], [t, squeeze(q(:, l, :))]);
end
end
