function q = hx_joint_angles(p, us, q0)
%HX_JOINT_ANGLES  Firmware offsets (us) -> Simscape joint angles (rad).
%   q(k,l,j) = q0(l,j) + sign(l,j) * us(k,l,j) / usPerRad
%   Signs come from your IK block conventions:
%     coxa : q = pi + psi, and your foot-trajectory headings show "forward"
%            is +psi on the left legs and -psi on the right legs.
%     femur: q = 3*pi/2 - (phi - phi0), so lifting the femur (phi up) is -q.
%     tibia: q = delta - delta0, tucking the foot (knee bends more) is -q.
%   This is the model equivalent of dirSign() on the calibration page.
usPerRad = p.usPerDeg*180/pi;
sgn = [ 1 -1 -1;  1 -1 -1;  1 -1 -1;     % LF LM LR
       -1 -1 -1; -1 -1 -1; -1 -1 -1];    % RF RM RR
n = size(us,1);
q = zeros(n,6,3);
for l = 1:6
    for j = 1:3
        q(:,l,j) = q0(l,j) + sgn(l,j)*us(:,l,j)/usPerRad;
    end
end
end
