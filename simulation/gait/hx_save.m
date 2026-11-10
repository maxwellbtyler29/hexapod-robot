function hx_save(R, S, p, outDir)
%HX_SAVE  Write the raw time series and the summaries as CSV + a text summary.
J = p.joints; L = p.legs;
for m = 1:numel(R)
    r = R(m); s = S.mode(m); tag = lower(r.mode); n = numel(r.t);
    hdr = {}; for l = 1:6, for j = 1:3, hdr{end+1} = [L{l} '_' J{j}]; end, end %#ok<AGROW>
    flat = @(A) reshape(permute(A, [1 3 2]), n, []);            % n x (leg*3+joint)
    writeCsv(fullfile(outDir, [tag '_joint_torques.csv']), ['time_s', strcat(hdr, '_Nm')], [r.t flat(r.tau)]);
    writeCsv(fullfile(outDir, [tag '_joint_commands.csv']), ['time_s', strcat(hdr, '_offset_us'), strcat(hdr, '_angle_deg')], ...
        [r.t flat(r.us) rad2deg(flat(r.qcmd))]);
    hw = {}; for l = 1:6, hw = [hw, {[L{l} '_x_mm'], [L{l} '_y_mm'], [L{l} '_z_mm']}]; end %#ok<AGROW>
    writeCsv(fullfile(outDir, [tag '_foot_paths_world.csv']), ['time_s', hw], [r.t flat(r.foot)]);
    hb = {}; X = r.t;
    for l = 1:6
        hb = [hb, {[L{l} '_fwd_mm'], [L{l} '_left_mm'], [L{l} '_height_mm']}]; %#ok<AGROW>
        X = [X s.leg(l).fwd s.leg(l).lat s.leg(l).hgt]; %#ok<AGROW>
    end
    writeCsv(fullfile(outDir, [tag '_foot_paths_body.csv']), ['time_s', hb], X);
    writeCsv(fullfile(outDir, [tag '_contact.csv']), ['time_s', strcat(L, '_Fn_N'), strcat(L, '_stance_meas'), ...
        strcat(L, '_swing_cmd'), {'gait_phase'}], ...
        [r.t r.fn double(r.fn > p.stanceThresholdN) double(r.cmdSwing) r.phase]);
    writeCsv(fullfile(outDir, [tag '_body.csv']), {'time_s', 'x_mm', 'y_mm', 'z_mm', 'q0', 'q1', 'q2', 'q3'}, [r.t r.body r.bodyQ]);
end

% torque summary
fid = fopen(fullfile(outDir, 'summary_torque.csv'), 'w');
fprintf(fid, 'mode,leg,joint,peak_Nm,rms_Nm,standing_Nm,peak_pct_of_stall\n');
for m = 1:numel(S.mode)
    s = S.mode(m);
    for l = 1:6, for j = 1:3
        fprintf(fid, '%s,%s,%s,%.4f,%.4f,%.4f,%.1f\n', s.mode, L{l}, J{j}, s.peakNm(l, j), s.rmsNm(l, j), ...
            s.standNm(l, j), 100 * s.peakNm(l, j) / p.servo.stallNm);
    end, end
end
fclose(fid);

% gait timing summary
fid = fopen(fullfile(outDir, 'summary_gait_timing.csv'), 'w');
fprintf(fid, ['mode,leg,cycle_cmd_s,cycle_meas_s,duty_cmd,duty_meas,touchdown_phase_cmd,touchdown_phase_meas,' ...
    'liftoff_phase_cmd,liftoff_phase_meas,clearance_mm,stride_mm,slip_per_step_mm,steps_analysed\n']);
for m = 1:numel(S.mode)
    s = S.mode(m);
    for l = 1:6
        g = s.leg(l);
        fprintf(fid, '%s,%s,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.1f,%.1f,%.2f,%d\n', s.mode, L{l}, s.cycleCmdS, ...
            g.cycleMeasS, g.dutyCmd, g.dutyMeas, g.tdPhaseCmd, g.tdPhaseMeas, g.loPhaseCmd, g.loPhaseMeas, ...
            g.clearanceMm, g.strideMm, g.slipMm, g.nSteps);
    end
end
fclose(fid);

% human-readable summary
fid = fopen(fullfile(outDir, 'summary.txt'), 'w');
fprintf(fid, 'Hexapod v6 tripod gait - Simscape study\n');
fprintf(fid, 'Robot mass in simulation: %.3f kg (printed parts x%.2f, body %.3f kg)\n', S.totalMassKg, p.printMassScale, p.bodyMass);
fprintf(fid, 'MG996R stall at %.1f V: %.3f N*m (design limit %.0f%%: %.3f N*m)\n', p.servo.voltage, p.servo.stallNm, ...
    100 * p.servo.designFrac, p.servo.designFrac * p.servo.stallNm);
fprintf(fid, 'Assumptions: %.2f us/deg, servo tau %.0f ms, contact k=%g N/m c=%g N/(m/s), mu_s=%.2f mu_d=%.2f\n\n', ...
    p.usPerDeg, 1000 * p.servoTau, p.contact.k, p.contact.c, p.contact.muS, p.contact.muD);
for m = 1:numel(S.mode)
    s = S.mode(m);
    fprintf(fid, '=== %s (commanded cycle %.2f s, analysed %.2f-%.2f s) ===\n', s.mode, s.cycleCmdS, s.window);
    fprintf(fid, 'Body: %.1f mm/s forward (%.1f mm per cycle), height %.1f mm, bob %.1f mm, yaw drift %.2f deg/cycle, lateral drift %.1f mm, max tilt %.2f deg, walked forward: %d\n', ...
        s.speedMmS, s.distPerCycleMm, s.bodyHeightMm, s.bodyBobMm, s.yawPerCycleDeg, s.lateralDriftMm, s.maxTiltDeg, s.walkedForward);
    fprintf(fid, 'Speed cap: need %.0f us/s (%.0f deg/s), cap %.0f us/s (%.0f deg/s); MG996R no-load ~%.0f deg/s\n', ...
        s.requiredUsPerS, s.requiredDps, s.capUsPerS, s.capDps, p.servo.noLoadDps);
    fprintf(fid, 'Feet down: all six %.1f%% of the time, exactly three %.1f%%, fewer than three %.1f%%\n', ...
        100 * s.fracAllSix, 100 * s.fracTripod, 100 * s.fracUnder3);
    fprintf(fid, 'Peak |torque| (worst leg):  coxa %.3f N*m (%s, %.0f%% stall)  femur %.3f N*m (%s, %.0f%%)  tibia %.3f N*m (%s, %.0f%%)\n', ...
        s.peakByJoint(1), L{s.peakLeg(1)}, s.peakPctStall(1), s.peakByJoint(2), L{s.peakLeg(2)}, s.peakPctStall(2), ...
        s.peakByJoint(3), L{s.peakLeg(3)}, s.peakPctStall(3));
    fprintf(fid, 'RMS torque (worst leg):     coxa %.3f  femur %.3f  tibia %.3f N*m\n', s.rmsByJoint);
    fprintf(fid, 'Peak commanded joint speed: coxa %.0f  femur %.0f  tibia %.0f deg/s\n', s.peakCmdSpeedDps);
    fprintf(fid, 'Leg  cycle_s  duty  TD_phase  LO_phase  clearance_mm  stride_mm  slip_mm  peakFn_N\n');
    for l = 1:6
        g = s.leg(l);
        fprintf(fid, '%-3s  %6.3f  %5.3f  %7.3f  %8.3f  %10.1f  %9.1f  %7.2f  %7.2f\n', L{l}, g.cycleMeasS, g.dutyMeas, ...
            g.tdPhaseMeas, g.loPhaseMeas, g.clearanceMm, g.strideMm, g.slipMm, s.peakFnN(l));
    end
    fprintf(fid, '(commanded: duty %.2f, touchdown phase 0, liftoff phase %.2f)\n\n', p.gait.DUTY, p.gait.DUTY);
end
fclose(fid);
end

function writeCsv(file, hdr, X)
fid = fopen(file, 'w');
fprintf(fid, '%s\n', strjoin(hdr, ','));
fmt = [repmat('%.6g,', 1, size(X, 2) - 1) '%.6g\n'];
fprintf(fid, fmt, X.');
fclose(fid);
end
