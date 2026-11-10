%RUN_MASS_1P75  Re-run Eco/Sport with Maxwell's weighed masses (~1.75 kg).
%
%   Weighed (24 Oct 2026, America/Chicago):
%     each leg ≈ 0.230 kg
%     body with all electronics ≈ 0.370 kg
%     total ≈ 1.75 kg
%
%   Mapping into the CAD Solid types (simscape_data.m):
%     bodyMass       = 0.370     % replaces CAD Hexapod body 0.80 kg
%     printMassScale = 0.8811    % printed parts only (opp. support, connectors,
%                                  leg/servo-3 mount). MG996R (55 g) and horns
%                                  stay at CAD. Per leg: servos+horns ≈ 0.167 kg
%                                  + printed ≈ 0.063 kg = 0.230 kg.
%
%   Writes to results/ (the weighed 1.75 kg study committed with this repo).
%   Headless:  matlab -batch "run_mass_1p75"

hxOverrides = struct( ...
    'bodyMass',       0.370, ...
    'printMassScale', 0.881091843141613, ...
    'resultsDir',     'results');
run_gait_study;
