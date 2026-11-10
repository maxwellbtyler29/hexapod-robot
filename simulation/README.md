# Simulation

## `simscape/`

The SolidWorks assembly was exported with Simscape Multibody Link. That export is `simscape_assembly.xml` and `simscape_data.m`, plus the STEP files in this folder.

`hex_simulation_standing.slx` is the standing model the gait study starts from. Earlier one-leg, alternation, and copy models are not in the repo. Open the folder in MATLAB with Simscape Multibody on the path. The model workspace points at `simscape_data.m` in this same folder. Generated caches (`slprj/`, `*.slxc`) are git-ignored.

## `kinematics/`

Leg inverse and forward kinematics, a foot-path generator, a numeric test, and a fixed-body gait preview. Run `test_kinematics` and `run_hexapod_demo(true)`. The body is fixed and the feet are assumed to touch the ground, so this is a geometry check, not a walking or stability simulation. See `kinematics/README.md`.

## `gait/`

The v6 tripod gait from `firmware/src/gait.h`, driven on a free-body copy of the standing model, at the weighed mass of 1.75 kg. Summaries and plots are in `gait/results/`. See `gait/README.md`.
