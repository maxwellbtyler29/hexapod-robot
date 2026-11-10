function p = hexapod_parameters()
% Initial study geometry only. Metres, seconds, radians, kilograms.
% Measure joint axes in SolidWorks before using this with a real robot.
p.L = [0.035 0.055 0.095]; % coxa offset, femur, tibia
p.mountAngle = deg2rad([45 90 135 -135 -90 -45]);
p.legName = {'LF','LM','LR','RR','RM','RF'};
p.mount = 0.075*[cos(p.mountAngle); sin(p.mountAngle); zeros(1,6)];
p.footRadius = 0.105;
p.height = 0.085;
p.stride = 0.030;
p.lift = 0.025;
p.period = 6;
p.duty = 5/6; % one leg swinging at a time
p.phase = (0:5)/6;
p.dt = 0.04;
p.mass = 2.1; % illustrative whole robot mass, including battery
p.qMin = deg2rad([-65 -80 -150]);
p.qMax = deg2rad([65 95 -15]);
end
