function thetas = matlab_reference(coords)
% Input: [x y z] in millimetres, relative to shoulder horn center.
% Output: absolute Simscape joint commands in radians.
% Order: [shoulder, hip, knee]

% Geometry: initial approximation from CAD measurements
a = 60.00;       % Hip-to-knee length in bending plane
b = 156.33;      % Knee-to-foot length in bending plane
L = 31.80;      % Shoulder-to-hip outward offset
hipZ = -15.15;  % Hip is below shoulder

% Geometric angles in the measured reference pose
phi0   = deg2rad(-0.43);
delta0 = deg2rad(-21.09);

% Simscape commands for that reference pose
qShoulder0 = pi;
qHip0      = 3*pi/2;
qKnee0     = 0;

% Requested foot position
x = coords(1);
y = coords(2);
z = coords(3);

% Shoulder sweep and target relative to hip
psi = atan2(y, x);
d = hypot(x, y) - L;
v = z - hipZ;

% Check this outward-reaching branch
assert(d > 0, 'Target must be outward of the hip.');

% Cosine of the relative knee angle
D = (d*d + v*v - a*a - b*b) / (2*a*b);

% Reject unreachable targets; clamp only numerical roundoff
assert(D >= -1-1e-9 && D <= 1+1e-9, ...
    'Foot target is outside the geometric workspace.');
D = max(-1, min(1, D));

% Choose the knee-bent-down branch
delta = -acos(D);

% Upper-leg elevation above horizontal
phi = atan2(v, d) ...
    - atan2(b*sin(delta), a + b*cos(delta));

% Convert geometric angles to Simscape joint commands
qShoulder = qShoulder0 + psi;
qHip     = qHip0 - (phi - phi0);
qKnee    = qKnee0 + (delta - delta0);

thetas = [qShoulder, qHip, qKnee];
end