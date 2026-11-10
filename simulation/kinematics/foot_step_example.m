function coords = foot_step_example(t)
% Paste into the Foot Trajectory MATLAB Function block.
% Local coordinates in mm. Time in seconds.
% Fixed-body single-foot demonstration, without ground contact.

x0 = 200;
z0 = -100;
stepLength = 20;
liftHeight = 10;
Tstance = 2;
Tswing = 1;
startTime = 1;

front = [x0,  stepLength/2, z0];
rear  = [x0, -stepLength/2, z0];

% Hold the front position initially.
if t < startTime
    coords = front;
    return
end

% Time within the current repeating cycle.
tau = mod(t - startTime, Tstance + Tswing);

if tau < Tstance
    % STANCE: a straight line from front to rear.
    u = tau/Tstance;
    s = 10*u^3 - 15*u^4 + 6*u^5;
    coords = (1-s)*front + s*rear;
else
    % SWING: a cubic Bezier curve from rear to front.
    u = (tau - Tstance)/Tswing;
    s = 10*u^3 - 15*u^4 + 6*u^5;

    P0 = rear;
    P1 = rear  + [0, 0, 4*liftHeight/3];
    P2 = front + [0, 0, 4*liftHeight/3];
    P3 = front;

    coords = (1-s)^3*P0 ...
           + 3*(1-s)^2*s*P1 ...
           + 3*(1-s)*s^2*P2 ...
           + s^3*P3;
end
end
