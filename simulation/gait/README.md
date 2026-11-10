# v6 gait study (Simscape)

Simulates the firmware tripod gait on the Simscape model and records Eco (2.4 s cycle) and Sport (1.2 s cycle):

* joint torque for all 18 joints
* foot-tip paths, stance/swing, ground clearance, slip
* gait timing: duty factor, touchdown and lift-off, cycle time, time with all six or exactly three feet down
* body speed, height, bob, yaw drift

The committed results use the weighed robot: **1.75 kg** (body + electronics 0.370 kg, each leg about 0.230 kg). An earlier run at the CAD-export mass (about 2.23 kg) is not kept.

## Run it

From this folder, with `simulation/simscape` on the MATLAB path (the script adds it):

```matlab
run_gait_study
```

or `matlab -batch "run_gait_study"`. Needs Simulink, Simscape, and Simscape Multibody. The run used here was MATLAB R2026a. It takes a few minutes per mode.

`hx_params.m` already holds the weighed mass. `run_mass_1p75.m` sets the same numbers and writes `results/`.

`run_trim_study` sweeps center-of-mass offsets and Eco gait trims. The +40 mm forward case was not built. The battery sits mid-to-aft. The comparison table and plot are in `trim/`. A re-run can write a `trim/win_*` folder of raw series; that folder is git-ignored.

## How it works

| File | Role |
| --- | --- |
| `hx_params.m` | Firmware gait constants, contact and servo assumptions, weighed masses, MG996R rating used in the study |
| `hx_gait_v6.m` | Port of `firmware/src/gait.h` (`Gait::step`) and the 20 ms speed limiter |
| `hx_ready_pose.m` | Ready-pose joint angles from the same IK as the model's IK blocks (foot at [150 0 -120] mm) |
| `hx_joint_angles.m` | Pulse offsets (µs) to joint angles (rad), with each joint's sign |
| `hx_build_model.m` | Builds `HexGait_v6.slx` from `hex_simulation_standing.slx` (the original is not modified) |
| `run_gait_study.m` | Masses, build, floor calibration, Eco and Sport, analysis, save |
| `hx_analyze.m` | Steady-state numbers from the last 3 cycles |
| `hx_save.m`, `hx_plots.m` | Summary text, summary CSVs, and figures. A local re-run also writes 1 kHz CSVs and a `.mat` |
| `replot_from_mat.m` | Rebuilds the figures from `results/gait_study_v6.mat` after a re-run. That `.mat` is not committed |

The body sits on a free 6-DOF joint and moves because the feet push on the floor. Stance is taken from contact normal force above 0.25 N.

Joint names: firmware hip (yaw) is coxa, firmware knee is femur, firmware foot is tibia.

## What is committed in `results/`

* `summary.txt`, `summary_torque.csv`, `summary_gait_timing.csv`
* Figures: torque vs time, peak torque vs stall, torque-speed operating points, foot paths, gait phase, body motion

1 kHz CSVs, `gait_study_v6.mat`, and the generated `HexGait_v6.slx` are not committed. Run `run_gait_study` to regenerate them. Patterns for those files are in `.gitignore`.

## Assumptions

* 2000 µs per 180° (11.1 µs/deg)
* Servo response: 2nd-order filter, τ = 30 ms, on top of the 20 ms firmware steps
* Masses: weighed body 0.370 kg and `printMassScale` 0.881 on printed leg parts; MG996R and horns stay at the CAD mass. See `hx_params.m`
* Floor contact: k = 1e4 N/m, c = 120 N·s/m, µs = 0.6, µd = 0.45
* MG996R stall used here is about 0.948 N·m at 5 V (interpolated from 9.4 kgf·cm at 4.8 V and 11 kgf·cm at 6 V)
* Ready pose is the model's standing pose, not the calibrated pose stored on the ESP32

## Weighed-mass run (24 Oct 2026, MATLAB R2026a, 1.75 kg)

Numbers below match `results/summary.txt`.

| | Eco (2.4 s) | Sport (1.2 s) |
| --- | --- | --- |
| Body speed | 28.3 mm/s (67.9 mm/cycle) | 56.5 mm/s (67.8 mm/cycle) |
| Foot clearance | 22 mm | 22 mm |
| Peak coxa / femur / tibia | 0.434 / 0.962 / 0.770 N·m | 0.491 / 1.072 / 0.862 N·m |
| Share of 0.948 N·m stall | 46% / 101% / 81% | 52% / 113% / 91% |

Joints in the model follow their commanded angle, so torque is what an ideal servo would need. Femur peaks sit at or above that stall figure. Outdoor walks in both Eco and Sport on the MG996Rs are the hardware result; see the repository README and `ENGINEERING_DECISION_torque.md`.
