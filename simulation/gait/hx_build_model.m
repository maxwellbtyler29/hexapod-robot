function mdl = hx_build_model(srcDir, outDir)
%HX_BUILD_MODEL  Make HexGait_v6.slx: a free-walking, fully instrumented copy
%   of hex_simulation_standing.slx. The original file is never saved.
%
%   What changes in the copy:
%    * The body is freed: the Prismatic joint driven by "Body Travel" is
%      replaced by a 6-DOF joint, so the robot only moves if its feet push it.
%    * The IK / foot-trajectory / clock blocks at the top level are removed;
%      each leg's theta_cmd input is fed by a From Workspace block (qcmd_XX)
%      holding the firmware gait joint angles.
%    * Every joint logs its actuator torque, every foot logs its position in
%      the world and its ground-contact normal force, and the body logs its
%      position and orientation (To Workspace, sampled every hxp.logDt).
%    * Contact stiffness/damping/friction and plane height become variables
%      (hxp.*), friction is switched on (it was "None"), joint end-stop
%      limits are switched off so they can't add hidden torque.

src = 'hex_simulation_standing';
mdl = 'HexGait_v6';
if bdIsLoaded(mdl), close_system(mdl, 0); end
if bdIsLoaded(src), close_system(src, 0); end
load_system(fullfile(srcDir, [src '.slx']));
save_system(src, fullfile(outDir, [mdl '.slx']));   % from here on we edit the copy only
p = hx_params();

%% 1) Top level: remove prescribed body motion and the old IK path
rootBlocks = find_system(mdl, 'SearchDepth', 1, 'Type', 'Block');
names = get_param(rootBlocks, 'Name');
kill = startsWith(names, {'Body Travel','Clock','Constant','Display', ...
    'Foot Trajectory','IK','Simulink-PS'}) | contains(names, 'Prismatic');
for b = rootBlocks(kill)'
    hx_delete_block(b{1});
end

% The Rigid Transform that rotates World into the body's travel frame and the
% Transform that carries the body are now unconnected - join them with a 6-DOF joint.
% (by name: "Rigid Transform" = World rotated +90 deg about X, "Transform" = body offset)
rt  = [mdl '/Rigid' newline 'Transform'];
tf  = [mdl '/Transform'];
assert(isUnconnected(rt,'RConn',1) && isUnconnected(tf,'LConn',1), 'Unexpected wiring around the old Prismatic joint');
dof = [mdl '/Free Body 6-DOF'];
hx_add('sm_lib/Joints/6-DOF Joint', dof, 'Position', [200 300 260 360]);
connectPorts(mdl, rt, 'RConn', 1, dof, 'LConn', 1);
connectPorts(mdl, dof, 'RConn', 1, tf, 'LConn', 1);

% body pose sensors (World -> body frame)
world = [mdl '/World'];
addSensor(mdl, 'Body Pos', world, tf, 'RConn', 'SenseXYZ', 'mm', 'body_xyz', [200 450]);
addSensor(mdl, 'Body Quat', world, tf, 'RConn', 'SenseQ', '1', 'body_q', [200 600]);

% top-level ground brick follows the plane height
gp = [mdl '/Ground Position'];
if getSimulinkBlockHandle(gp) > 0
    set_param(gp, 'TranslationCartesianOffset', '[0 0 hxp.planeZmm-10]', ...
        'TranslationCartesianOffsetUnits', 'mm');
end

%% 2) Legs
for l = 1:6
    leg = [mdl '/' p.legBlocks{l}];
    tag = p.legs{l};
    % command input
    fw = [mdl '/qcmd ' tag];
    add_block('simulink/Sources/From Workspace', fw, 'VariableName', ['qcmd_' tag], ...
        'Interpolate', 'off', 'OutputAfterFinalValue', 'Holding final value', ...
        'SampleTime', '0', 'Position', [20 100*l 120 100*l+30]);
    hl = get_param(leg, 'LineHandles');
    if hl.Inport(1) ~= -1, delete_line(hl.Inport(1)); end
    connectPorts(mdl, fw, 'Outport', 1, leg, 'Inport', 1);

    % servo response time on the existing Simulink-PS converters
    for c = hx_findAll(leg, 'Simulink-PS Converter')
        set_param(c{1}, 'FilteringAndDerivatives', 'filter', 'SimscapeFilterOrder', '2', ...
            'InputFilterTimeConstant', 'hxp.servoTau');
    end

    % joints: no end-stop limits, log torque in model joint order (coxa, femur, tibia)
    joints = hx_findAll(leg, 'Revolute Joint')';
    % The theta_cmd vector is [shoulder hip knee]; find which Demux output
    % (through which Simulink-PS converter) drives each joint.
    convs = hx_findAll(leg, 'Simulink-PS Converter');
    order = zeros(1, numel(joints));
    for k = 1:numel(joints)
        jl = get_param(joints{k}, 'LineHandles');
        for c = convs
            cl = get_param(c{1}, 'LineHandles');
            if cl.RConn(1) == jl.LConn(2)
                order(k) = get_param(get_param(cl.Inport(1), 'SrcPortHandle'), 'PortNumber');
            end
        end
        hx_try_set(joints{k}, 'LowerLimitSpecify', 'off');
        hx_try_set(joints{k}, 'UpperLimitSpecify', 'off');
        set_param(joints{k}, 'SenseTorqueForce', 'on');
    end
    assert(isequal(sort(order), 1:3), 'Could not map joints in %s', leg);
    [~, ix] = sort(order); joints = joints(ix);
    mux = [leg '/tau mux'];
    add_block('simulink/Signal Routing/Mux', mux, 'Inputs', '3', 'Position', [900 600 905 680]);
    for k = 1:3
        cv = sprintf('%s/tau conv %d', leg, k);
        hx_add('nesl_utility/PS-Simulink Converter', cv, 'Unit', 'N*m', ...
            'Position', [800 560+40*k 830 580+40*k]);
        connectPorts(leg, joints{k}, 'RConn', 2, cv, 'LConn', 1);
        connectPorts(leg, cv, 'Outport', 1, mux, 'Inport', k);
    end
    addToWs(leg, mux, ['tau_' tag], [950 625]);

    % foot position in the world
    wf  = hx_find(leg, 'World Frame', 1, []);
    pt  = hx_find(leg, 'Point', 1, []);
    addSensor(leg, 'Foot Pos', wf, pt, 'LConn', 'SenseXYZ', 'mm', ['foot_' tag], [700 800]);

    % ground plane height and contact model
    cs = [leg '/Contact Surface'];
    set_param(cs, 'TranslationCartesianOffset', '[0 0 hxp.planeZmm]', ...
        'TranslationCartesianOffsetUnits', 'mm');
    scf = hx_find(leg, 'Spatial Contact Force', 1, []);
    set_param(scf, 'NormalStiffness', 'hxp.contact.k', 'NormalStiffnessUnits', 'N/m', ...
        'NormalDamping', 'hxp.contact.c', 'NormalDampingUnits', 'N/(m/s)', ...
        'NormalTransitionRegionWidth', 'hxp.contact.width', 'NormalTransitionRegionWidthUnits', 'm');
    setFriction(scf);
    set_param(scf, 'CoefficientOfStaticFriction', 'hxp.contact.muS', ...
        'CoefficientOfDynamicFriction', 'hxp.contact.muD', ...
        'FrictionalCriticalVelocity', 'hxp.contact.vCrit');
    set_param(scf, 'SenseNormalForceMagnitude', 'on');
    hc = get_param(scf, 'LineHandles');
    if numel(hc.RConn) >= 2 && hc.RConn(2) ~= -1
        % already wired to a converter (Left Front): reuse it
        conv = '';
        for c = hx_findAll(leg, 'PS-Simulink Converter')
            h = get_param(c{1}, 'LineHandles');
            if h.LConn(1) == hc.RConn(2), conv = c{1}; end
        end
        assert(~isempty(conv), 'Could not find the existing contact-force converter in %s', leg);
        set_param(conv, 'Unit', 'N');
    else
        conv = [leg '/fn conv'];
        hx_add('nesl_utility/PS-Simulink Converter', conv, 'Unit', 'N', 'Position', [700 950 730 970]);
        connectPorts(leg, scf, 'RConn', 2, conv, 'LConn', 1);
    end
    addToWs(leg, conv, ['fn_' tag], [800 950]);
end

%% 3) Solver / logging
set_param(mdl, 'StopTime', '10', 'SolverType', 'Variable-step', 'Solver', 'daessc', ...
    'MaxStep', '1e-3', 'RelTol', '1e-4', 'SimscapeLogType', 'none', ...
    'ReturnWorkspaceOutputs', 'on', 'SignalLogging', 'off');
hx_try_set(mdl, 'SimMechanicsOpenEditorOnUpdate', 'off');
save_system(mdl);
end

% ======================================================================
function tf = isUnconnected(h, kind, k)
lh = get_param(h, 'LineHandles'); v = lh.(kind);
tf = numel(v) >= k && v(k) == -1;
end

function blk = hx_find(sys, refName, depth, pred)
% find a Simscape Multibody block by library name, optional predicate
c = find_system(sys, 'SearchDepth', depth, 'Type', 'Block');
c = c(~strcmp(c, sys));
hits = {};
for i = 1:numel(c)
    r = get_param(c{i}, 'ReferenceBlock');
    if isempty(r), continue; end
    parts = strsplit(r, '/');
    if strcmp(strrep(parts{end}, newline, ' '), refName) && (isempty(pred) || pred(c{i}))
        hits{end+1} = c{i}; %#ok<AGROW>
    end
end
assert(numel(hits) == 1, 'Expected one "%s" in %s, found %d', refName, sys, numel(hits));
blk = hits{1};
end

function hx_delete_block(b)
lh = get_param(b, 'LineHandles');
for f = fieldnames(lh)'
    v = lh.(f{1}); v = v(v ~= -1);
    for h = v(:)'
        if ishandle(h), delete_line(h); end
    end
end
delete_block(b);
end

function connectPorts(sys, a, ka, ia, b, kb, ib)
pa = get_param(a, 'PortHandles'); pb = get_param(b, 'PortHandles');
add_line(sys, pa.(ka)(ia), pb.(kb)(ib), 'autorouting', 'on');
end

function addSensor(sys, name, base, follower, fport, what, unit, var, xy)
s = [sys '/' name];
hx_add('sm_lib/Frames and Transforms/Transform Sensor', s, 'Position', [xy xy+[60 60]]);
set_param(s, 'MeasurementFrame', 'Base', what, 'on');
connectPorts(sys, base, 'RConn', 1, s, 'LConn', 1);
connectPorts(sys, follower, fport, 1, s, 'RConn', 1);
cv = [s ' conv'];
hx_add('nesl_utility/PS-Simulink Converter', cv, 'Unit', unit, 'Position', [xy+[100 20] xy+[130 40]]);
connectPorts(sys, s, 'RConn', 2, cv, 'LConn', 1);
addToWs(sys, cv, var, xy + [170 15]);
end

function addToWs(sys, srcBlk, var, xy)
w = [sys '/log ' var];
add_block('simulink/Sinks/To Workspace', w, 'VariableName', var, 'SaveFormat', 'Timeseries', ...
    'SampleTime', 'hxp.logDt', 'Position', [xy xy+[80 30]]);
connectPorts(sys, srcBlk, 'Outport', 1, w, 'Inport', 1);
end

function setFriction(scf)
% switch friction on; the option's exact spelling differs between releases
opts = {'SmoothStickSlip', 'Smooth Stick-Slip', 'Smooth stick-slip'};
mo = get_param(scf, 'ObjectParameters');
if isfield(mo, 'FrictionType') && isfield(mo.FrictionType, 'Enum')
    e = mo.FrictionType.Enum; hit = e(contains(lower(e), 'stick'));
    if ~isempty(hit), opts = [hit(:)' opts]; end
end
for i = 1:numel(opts)
    try, set_param(scf, 'FrictionType', opts{i}); return; catch, end
end
error('Could not enable friction on %s', scf);
end

function hx_try_set(b, prm, val)
try, set_param(b, prm, val); catch, end
end

function c = hx_findAll(sys, refName)
% all blocks directly inside sys whose library block is called refName
c = find_system(sys, 'SearchDepth', 1, 'Type', 'Block');
keep = false(size(c));
for i = 1:numel(c)
    r = get_param(c{i}, 'ReferenceBlock');
    if ~isempty(r)
        parts = strsplit(r, '/');
        keep(i) = strcmp(strrep(parts{end}, newline, ' '), refName);
    end
end
c = c(keep)';
end

function hx_add(src, dst, varargin)
% add_block, tolerating library names that contain line breaks
sp = find(src == ' ');
for m = 0:2^numel(sp)-1
    s = src;
    for i = 1:numel(sp)
        if bitget(m, i), s(sp(i)) = newline; end
    end
    try
        add_block(s, dst, varargin{:}); return;
    catch err
        if m == 0, firstErr = err; end
    end
end
error('Could not add %s: %s', src, firstErr.message);
end
