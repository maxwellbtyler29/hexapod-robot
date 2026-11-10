function [x,z,stance] = foot_path(phase,p)
% Pedagogical in-place gait preview, NOT a no-slip locomotion model.
% Quintic interpolation gives smooth endpoints. During stance x moves back.
phase=mod(phase,1);
stance=phase<p.duty;
if stance
    u=phase/p.duty;
    s=10*u^3-15*u^4+6*u^5;
    x=p.stride/2-p.stride*s; z=0;
else
    u=(phase-p.duty)/(1-p.duty);
    s=10*u^3-15*u^4+6*u^5;
    x=-p.stride/2+p.stride*s;
    z=p.lift*64*u^3*(1-u)^3;
end
end
