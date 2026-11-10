function p = hx_params()
%HX_PARAMS  Every number the v6 gait study uses, in one place.
%
%   Change a value here (or override a field in run_gait_study) and re-run.
%   Units: seconds, millimetres, radians, newton-metres, kilograms, unless
%   the field name says otherwise.
%
%   Values marked "FIRMWARE" are copied from firmware/src/gait.h and
%   six_leg_setup.cpp (v6) so the simulated legs move exactly like the robot.
%   Values marked "ASSUMPTION" are estimates; confirm or measure them.

%% ---- Gait generator (FIRMWARE, gait.h v6) ------------------------------
p.gait.DUTY      = 0.56;   % stance fraction of the cycle
p.gait.RAMP      = 0.06;   % stance speed ramp (cycle fraction) at each end
p.gait.LIFT_UP   = 0.30;   % swing fraction used to raise the foot
p.gait.LIFT_DOWN = 0.70;   % swing fraction where lowering starts
p.gait.HIP_START = 0.15;   % swing fraction where the hip starts moving
p.gait.HIP_END   = 0.80;   % swing fraction where the hip has finished
p.gait.stride    = 150;    % hip sweep, peak-to-peak, us   (GaitParams default)
p.gait.lift      = 140;    % knee lift during swing, us
p.gait.tuck      = 40;     % foot tuck during swing, us
p.gait.reach     = 120;    % crab sweep (not used for straight walking), us
p.gait.mix       = 50;     % crab knee mix, %
p.gait.ecoMs     = 2400;   % Eco cycle time, ms
p.gait.sportMs   = 1200;   % Sport cycle time, ms
p.tickMs         = 20;     % firmware control period (50 Hz)
p.capSetting     = 0;      % 0 = Auto speed cap (1.25*need + 50 us/s), as shipped

%% ---- Servo pulse to angle (ASSUMPTION) ----------------------------------
% The firmware commands 500..2500 us. An MG996R covers roughly 180 deg over
% that range, so 2000 us / 180 deg. Measure yours with a protractor at
% 1000 and 2000 us and update this if it differs.
p.usPerDeg = 2000/180;     % ~11.1 us per degree

%% ---- Ready pose (ASSUMPTION, from your Simscape standing test) ----------
% Foot target used by the Constant block in hex_simulation_standing,
% in each leg's IK frame (mm). The firmware's ready pose is whatever you
% save on the calibration page; this is the model's equivalent.
p.readyFoot = [150 0 -120];

%% ---- Simulation timeline -------------------------------------------------
p.tSettle  = 1.5;   % s standing at the ready pose before GSTART
p.nCycles  = 6;     % gait cycles to simulate after GSTART
p.nAnalyse = 3;     % last N cycles are treated as steady-state
p.command  = [1 0 0];  % [forward turn side], -1..1 (full forward)
p.holdZOH  = true;  % feed 20 ms firmware steps as a staircase (like PWM)
p.servoTau = 0.03;  % s, 2nd-order servo response time constant (ASSUMPTION)
p.logDt    = 1e-3;  % s, logging period

%% ---- Mass / material ----------------------------------------------------
% Weighed robot (24 Oct 2026): each leg ~0.230 kg, body+electronics
% 0.370 kg, total 1.75 kg. printMassScale applies to printed leg parts only.
% MG996R (55 g) and horns stay at the CAD mass (~0.167 kg/leg), so the
% printed share goes from ~0.0716 kg/leg to ~0.063 kg/leg
% (0.167+0.063 = 0.230; 6*0.230+0.370 = 1.75).
% An earlier run used the CAD export (body 0.80 kg, scale 1.0, total ~2.23 kg).
% Those time series are not in the repo. See run_mass_1p75.m.
p.printMassScale = 0.881091843141613;
p.bodyMass       = 0.370;  % kg, weighed body+electronics

%% ---- Ground contact (ASSUMPTION) ----------------------------------------
p.contact.k     = 1e4;    % N/m   normal stiffness (hard floor + PLA foot)
p.contact.c     = 120;    % N/(m/s) normal damping (~critical for one foot)
p.contact.width = 1e-4;   % m     transition region
p.contact.muS   = 0.6;    % static friction  (PLA on wood/laminate)
p.contact.muD   = 0.45;   % dynamic friction
p.contact.vCrit = 1e-3;   % m/s   stick/slip critical velocity
p.contact.preloadMm = 0.3;% mm    initial foot penetration so the robot starts loaded
p.stanceThresholdN = 0.25;% N     contact force that counts as "foot down"

%% ---- MG996R rating (datasheet) -------------------------------------------
% 9.4 kgf*cm at 4.8 V, 11 kgf*cm at 6.0 V -> interpolated at the 5 V rail.
p.servo.voltage   = 5.0;
p.servo.stallNm   = (9.4 + (11-9.4)*(5.0-4.8)/1.2) * 0.0980665;   % ~0.95 N*m
p.servo.noLoadDps = 60 / (0.17 - (0.17-0.14)*(5.0-4.8)/1.2);      % ~363 deg/s
p.servo.designFrac = 0.5;  % keep continuous load below 50 % of stall

%% ---- Names ---------------------------------------------------------------
% Firmware leg order (gait.h): 0 LF, 1 LM, 2 LR, 3 RF, 4 RM, 5 RR
p.legs      = {'LF','LM','LR','RF','RM','RR'};
p.legBlocks = {'Left Front','Left Middle','Left Back','Right Front','Right Middle','Right Back'};
% Firmware joint names -> anatomical names used in the outputs:
%   firmware "hip"  (yaw, swings foot fore/aft)   -> coxa
%   firmware "knee" (lifts the leg)               -> femur
%   firmware "foot" (tucks the foot)              -> tibia
p.joints    = {'coxa','femur','tibia'};
end
