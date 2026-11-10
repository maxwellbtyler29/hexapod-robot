function [q,reachable] = leg_ik(target,L)
% Closed-form inverse kinematics. Reject unreachable targets rather than
% quietly clamping them into another point. Tiny rounding errors are clamped.
x=target(1); y=target(2); z=target(3);
r=hypot(x,y)-L(1);
D=(r*r+z*z-L(2)^2-L(3)^2)/(2*L(2)*L(3));
reachable=(r>=0) && (abs(D)<=1+1e-10);
if ~reachable, q=[NaN NaN NaN]; return; end
D=max(-1,min(1,D));
q3=-acos(D);
q2=atan2(z,r)-atan2(L(3)*sin(q3),L(2)+L(3)*cos(q3));
q=[atan2(y,x),q2,q3];
end
