function hx_plots(R, S, p, outDir)
%HX_PLOTS  Portfolio figures (PNG, 150 dpi) from the simulation results.
L = p.legs; J = {'Coxa (hip yaw)', 'Femur (lift)', 'Tibia (foot)'};
col = lines(6); stall = p.servo.stallNm; design = p.servo.designFrac * stall;
modeCol = [0.20 0.55 0.25; 0.85 0.33 0.10];

for m = 1:numel(R)
    r = R(m); s = S.mode(m); T = r.cycleS;
    w = r.t >= s.window(1) & r.t <= s.window(2);
    w2 = r.t >= s.window(2) - 2*T & w;                % last two cycles
    tc = (r.t - r.tSettle) / T;                        % time in cycles since GSTART

    % ---- 1. torque vs time per joint type ----
    f = newFig([1000 800]);
    for j = 1:3
        subplot(3, 1, j); hold on; grid on;
        ht = zeros(1, 7);
        for l = 1:6, ht(l) = plot(tc(w2), r.tau(w2, l, j), 'Color', col(l, :), 'LineWidth', 1.2); end
        xl = [min(tc(w2)) max(tc(w2))];
        hh = plot(xl, [design design], 'k--', xl, -[design design], 'k--'); ht(7) = hh(1);
        ylabel([J{j} ' [N\cdotm]']); xlim(xl);
        if j == 1
            title(sprintf('%s mode (%.1f s cycle): joint torque, last two cycles', r.mode, T));
            legend(ht, [L, {'\pm50% of MG996R stall'}], 'Location', 'eastoutside');
        end
    end
    xlabel('Time since GSTART [gait cycles]');
    savePng(f, fullfile(outDir, sprintf('torque_vs_time_%s.png', lower(r.mode))));

    % ---- 2. foot paths relative to the body: side and top views ----
    f = newFig([1100 800]);
    subplot(2, 2, [1 2]); hold on; grid on;
    for l = 1:6
        g = s.leg(l); plot(g.fwd(w) - mean(g.fwd(w)), g.hgt(w), 'Color', col(l, :), 'LineWidth', 1.2);
    end
    xlabel('Fore/aft relative to body, centred [mm] (+ = forward)'); ylabel('Height above floor [mm]');
    title(sprintf('%s: foot tip paths relative to the body (side view, %d cycles)', r.mode, p.nAnalyse));
    legend(L, 'Location', 'eastoutside');
    subplot(2, 2, 3); hold on; grid on; axis equal;
    for l = 1:6, g = s.leg(l); plot(g.lat(w), g.fwd(w), 'Color', col(l, :), 'LineWidth', 1.5); end
    xlabel('Left of body [mm]'); ylabel('Forward of body [mm]'); title('Top view, body frame');
    subplot(2, 2, 4); hold on; grid on; axis equal;
    u = s.travelDir; v = [-u(2) u(1) 0];
    for l = 1:6
        fw = squeeze(r.foot(:, l, :)); st = r.fn(:, l) > p.stanceThresholdN;
        plot(fw * v', fw * u', '-', 'Color', 0.4*col(l, :) + 0.6);
        plot(fw(st, :) * v', fw(st, :) * u', '.', 'Color', col(l, :), 'MarkerSize', 4);
    end
    plot(r.body * v', r.body * u', 'k-', 'LineWidth', 1.5);
    xlabel('Lateral [mm]'); ylabel('Forward [mm]'); title('Top view, world (dots = foot planted, black = body)');
    savePng(f, fullfile(outDir, sprintf('foot_paths_%s.png', lower(r.mode))));

    % ---- 3. gait phase diagram: measured contact vs commanded stance ----
    f = newFig([1000 450]); hold on;
    for l = 1:6
        y = 7 - l;
        drawBars(tc(w), r.cmdSwing(w, l) == 0, y + 0.18, 0.14, [0.75 0.75 0.75]);
        drawBars(tc(w), r.fn(w, l) > p.stanceThresholdN, y - 0.12, 0.30, col(l, :));
    end
    set(gca, 'YTick', 1:6, 'YTickLabel', fliplr(L)); ylim([0.4 6.7]); xlim([min(tc(w)) max(tc(w))]); grid on;
    xlabel('Time since GSTART [gait cycles]');
    title(sprintf('%s gait phase diagram: thick = foot in contact (Simscape), thin grey = firmware stance command', r.mode));
    savePng(f, fullfile(outDir, sprintf('gait_phase_%s.png', lower(r.mode))));
end

% ---- 4. peak torque per joint type vs MG996R stall ----
f = newFig([900 550]); hold on; grid on;
pk = zeros(3, numel(S.mode)); rm = pk;
for m = 1:numel(S.mode), pk(:, m) = S.mode(m).peakByJoint(:); rm(:, m) = S.mode(m).rmsByJoint(:); end
hb = bar(1:3, pk, 0.8);
for m = 1:numel(hb), set(hb(m), 'FaceColor', modeCol(m, :)); end
off = 0.8 / numel(S.mode) / 1.25 * ((1:numel(S.mode)) - (numel(S.mode) + 1) / 2);
for m = 1:numel(S.mode)
    hr = plot((1:3) + off(m), rm(:, m), 'kd', 'MarkerFaceColor', 'w', 'MarkerSize', 8);
    for j = 1:3
        text(j + off(m), pk(j, m), sprintf('%.2f', pk(j, m)), 'HorizontalAlignment', 'center', ...
            'VerticalAlignment', 'bottom');
    end
end
hs = plot([0.4 3.6], [stall stall], 'r-', 'LineWidth', 2);
hd = plot([0.4 3.6], [design design], 'r--', 'LineWidth', 1.5);
set(gca, 'XTick', 1:3, 'XTickLabel', J); xlim([0.4 3.6]); ylim([0, 1.15 * max(stall, max(pk(:)))]);
ylabel('Torque [N\cdotm]');
legend([hb(:)', hr, hs, hd], [arrayfun(@(s) [s.mode ' peak'], S.mode, 'UniformOutput', false), {'RMS (worst leg)'}, ...
    {sprintf('MG996R stall (%.2f N\\cdotm @ %.0f V)', stall, p.servo.voltage)}, {'50% design limit'}], 'Location', 'northeast');
title(sprintf('Peak joint torque vs servo rating (worst of 6 legs, %.2f kg robot)', S.totalMassKg));
savePng(f, fullfile(outDir, 'peak_torque_vs_stall.png'));

% ---- 5. torque-speed operating points vs MG996R ----
f = newFig([900 550]); hold on; grid on;
mk = {'o', 's', '^'}; hop = [];
for m = 1:numel(S.mode)
    s = S.mode(m);
    for j = 1:3
        x = s.opSpeedDps(:, :, j); y = s.opTorqueNm(:, :, j);
        hop(end+1) = plot(x(:), y(:), mk{j}, 'Color', modeCol(m, :), 'MarkerSize', 3); %#ok<AGROW>
    end
end
w0 = p.servo.noLoadDps;
hop(end+1) = plot([0 w0], [stall 0], 'r-', 'LineWidth', 2);
xlabel('Commanded joint speed [deg/s]'); ylabel('|Torque| [N\cdotm]');
title('Joint operating points vs MG996R torque-speed line (circle = coxa, square = femur, triangle = tibia)');
lg = {}; for m = 1:numel(S.mode), lg = [lg, strcat(S.mode(m).mode, {' coxa', ' femur', ' tibia'})]; end %#ok<AGROW>
legend(hop, [lg, {'MG996R (linear approx.)'}], 'Location', 'northeast');
% y-axis covers the larger of stall and the highest simulated point (points above the line = beyond the servo)
xlim([0 1.05 * w0]); yMax = stall;
for m = 1:numel(S.mode), yMax = max(yMax, max(S.mode(m).opTorqueNm(:))); end
ylim([0 1.1 * yMax]);
savePng(f, fullfile(outDir, 'torque_speed_operating_points.png'));

% ---- 6. body motion ----
f = newFig([900 600]);
subplot(2, 1, 1); hold on; grid on;
for m = 1:numel(R)
    r = R(m); u = S.mode(m).travelDir;
    plot(r.t, (r.body - r.body(1, :)) * u', 'Color', modeCol(m, :), 'LineWidth', 1.5);
end
ylabel('Forward travel [mm]'); legend({R.mode}, 'Location', 'northwest');
title('Body motion (GSTART at the dashed line)');
yl = ylim; plot([R(1).tSettle R(1).tSettle], yl, 'k--');
subplot(2, 1, 2); hold on; grid on;
for m = 1:numel(R), plot(R(m).t, R(m).body(:, 3) - R(m).planeZmm, 'Color', modeCol(m, :), 'LineWidth', 1.2); end
ylabel('Body frame height above floor [mm]'); xlabel('Simulation time [s]');
savePng(f, fullfile(outDir, 'body_motion.png'));
end

% ----------------------------------------------------------------------
function f = newFig(sz)
f = figure('Visible', 'off', 'Color', 'w', 'Position', [50 50 sz]);
end

function savePng(f, file)
set(f, 'PaperPositionMode', 'auto');
print(f, file, '-dpng', '-r150');
close(f);
end

function drawBars(t, on, y, h, c)
e = diff([0; on(:); 0]); a = find(e == 1); b = find(e == -1) - 1;
for k = 1:numel(a)
    rectangle('Position', [t(a(k)), y - h/2, max(t(b(k)) - t(a(k)), 1e-3), h], 'FaceColor', c, 'EdgeColor', 'none');
end
end
