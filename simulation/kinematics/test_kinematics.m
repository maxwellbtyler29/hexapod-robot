function test_kinematics()
% Numerical checks for the ideal link model, not hardware qualification.
p=hexapod_parameters(); maxError=0; tested=0;
for x=0.075:0.01:0.135
 for y=-0.025:0.01:0.025
  for z=-0.11:0.01:-0.05
   target=[x;y;z]; [q,ok]=leg_ik(target,p.L);
   if ok
    points=leg_fk(q,p.L); e=norm(points(:,end)-target);
    maxError=max(maxError,e); tested=tested+1;
    assert(e<1e-9,'IK/FK round-trip failed');
   end
  end
 end
end
[~,ok]=leg_ik([1;0;0],p.L); assert(~ok,'Unreachable point was accepted');
fprintf('PASS: %d reachable points; max error %.3g m; unreachable target rejected.\n',tested,maxError);
end
