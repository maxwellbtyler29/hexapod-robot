# Leg inverse kinematics

One-leg inverse kinematics matching the standing Simscape model
(`simulation/simscape/hex_simulation_standing.slx`, 2026-10-03). `firmware/core/geometry.h`
includes `leg_ik.h` for the desktop preview. This folder does not run a gait, connect
over Wi-Fi, or command servos. The walking firmware commands pulses from `firmware/src/gait.h`.

## Start here

Read `main.cpp` first. Its default request is:

```cpp
hexapod::FootPosition target = {150.0, 0.0, -120.0};
```

The coordinates are millimetres relative to ONE shoulder horn: X outward,
Y along positive shoulder sweep, Z upward. They are not world coordinates.

The essential call is:

```cpp
hexapod::LegAngles angles;
if (!hexapod::solveLegIK(target, angles)) {
    // Reject the request; do not use the returned angles.
}
```

`solveLegIK` returns a boolean: true for a geometrically reachable target,
false for a rejected target. On failure it clears its angle output to NaN.
Physical servo limits and collisions are not checked here.

## Two angle conventions

`solveLegIK` returns geometric yaw, upper-leg elevation, and relative knee
angle in radians. `toSimscape` then applies the model's joint reference
offsets and signs to produce the values you used in MATLAB.

For `[150, 0, -120]`:

| Output | Shoulder/yaw | Hip | Knee |
| --- | ---: | ---: | ---: |
| Geometric, radians | 0.000000000 | 0.625827560 | -1.735417971 |
| Simscape, radians | 3.141592654 | 4.079056504 | -1.367328032 |
| Simscape, degrees | 180.000000 | 233.712722 | -78.342125 |

The Simscape values are comparison values, NOT physical servo commands.
Physical servos need their own zero, direction, range, and pulse calibration.

## Reading the solver

- `struct` groups named values, so `target.x` replaces MATLAB's `coords(1)`.
- `double` stores a floating-point number; `bool` stores true or false.
- `const` means a value should not change after it is assigned.
- `const FootPosition& foot` reads the input without copying or changing it.
- `LegAngles& out` lets the function write the caller's output variable.
- `std::atan2`, `std::acos`, and `std::hypot` come from the C++ math library.
- `!` means 'not': `if (!solveLegIK(...))` handles failure.
- Statements normally end in `;`; `{ ... }` groups a block of statements.

The calculation in `leg_ik.h` follows the MATLAB sequence: planar target,
reachability, knee branch, hip angle, shoulder yaw. The Simscape conversion
is separated at the end for later physical calibration.

## Run

From this folder, with g++:

```text
g++ -std=c++17 -O2 -Wall -Wextra main.cpp -o /tmp/ik_demo && /tmp/ik_demo
g++ -std=c++17 -O2 -Wall -Wextra test_ik.cpp -o /tmp/test_ik && /tmp/test_ik
```

`/tmp/ik_demo 150 10 -120` tries another foot target, in millimetres.

## First exercise

Compare `[150, 0, -120]` against `[150, 10, -120]`. The shoulder command
should increase. Hip and knee also change slightly because the horizontal
radius increases from 150 to sqrt(150^2 + 10^2) mm.

Then try `[150, -10, -120]`: yaw reverses, while hip and knee should match
the positive-Y test. Finally, `[1000, 0, -120]` should be rejected.

## Verification and limits

`test_ik.cpp` checks six reference targets independently evaluated from the
saved MATLAB equations, reconstructs reachable points using forward geometry,
and tests reach boundaries plus invalid/non-finite inputs. Reference numbers
were evaluated in Python; no fresh MATLAB or Simscape simulation is claimed.
`matlab_reference.m` preserves those equations for an optional MATLAB check:

```matlab
matlab_reference([150 0 -120])
```

The solver keeps the same approximate CAD geometry and the downward-bending
knee branch. Agreement with the reference numbers does not validate physical
reach, collision clearance, or servo torque.
