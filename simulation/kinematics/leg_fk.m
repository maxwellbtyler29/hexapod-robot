function points = leg_fk(q,L)
% Ideal yaw-pitch-pitch chain. Columns are hip, upper joint, knee, foot.
% Local x outward, y tangential, z upward. q3 negative is chosen knee branch.
a=q(1); b=q(2); c=q(3);
u=[cos(a);sin(a);0];
p1=L(1)*u;
p2=p1+L(2)*(cos(b)*u+[0;0;sin(b)]);
p3=p2+L(3)*(cos(b+c)*u+[0;0;sin(b+c)]);
points=[[0;0;0],p1,p2,p3];
end
