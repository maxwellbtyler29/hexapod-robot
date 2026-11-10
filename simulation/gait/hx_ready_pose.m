function q0 = hx_ready_pose(p)
%HX_READY_POSE  Model joint angles (rad) for the ready pose, one row per leg.
%   Uses the same inverse kinematics as the IK blocks in your Simscape
%   models (CAD-measured link lengths), solved for p.readyFoot. The same
%   foot target is used for all six legs, as in hex_simulation_standing.
a = 60.00; b = 156.33; L = 31.80; hipZ = -15.15;      % mm, from your IK block
phi0 = deg2rad(-0.43); delta0 = deg2rad(-21.09);
x = p.readyFoot(1); y = p.readyFoot(2); z = p.readyFoot(3);
psi = atan2(y,x); d = hypot(x,y) - L; v = z - hipZ;
D = (d*d + v*v - a*a - b*b)/(2*a*b);
assert(d > 0 && abs(D) <= 1, 'Ready foot target is out of reach.');
delta = -acos(D);
phi = atan2(v,d) - atan2(b*sin(delta), a + b*cos(delta));
q = [pi + psi, 3*pi/2 - (phi - phi0), 0 + (delta - delta0)];
q0 = repmat(q, 6, 1);
end
