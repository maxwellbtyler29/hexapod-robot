# Gait torque study

| | |
| --- | --- |
| **Project** | P3DRO hexapod |
| **Author** | Maxwell Tyler |
| **Date** | 24 Oct 2026, with the hardware outcome recorded after the outdoor walks |
| **Model** | Simscape Multibody, MATLAB R2026a, free 6-DOF body, foot contact. Torques are what an ideal servo would need. |

## What was asked

The v6 firmware tripod gait was run on `hex_simulation_standing.slx` for Eco (2.4 s) and Sport (1.2 s). The stall figure used in the study is **0.948 N·m at 5 V**, interpolated from 9.4 kgf·cm at 4.8 V and 11 kgf·cm at 6 V.

Two masses were simulated.

| Case | Mass | Eco peak coxa / femur / tibia | Sport peak coxa / femur / tibia |
| --- | --- | --- | --- |
| CAD export (not kept) | 2.231 kg | 0.630 / 1.327 / 1.050 N·m (66% / 140% / 111%) | 0.673 / 1.452 / 1.138 N·m (71% / 153% / 120%) |
| Weighed robot | **1.750 kg** | **0.434 / 0.962 / 0.770 N·m (46% / 101% / 81%)** | **0.491 / 1.072 / 0.862 N·m (52% / 113% / 91%)** |

Weighed hardware: each leg about **230 g**, body with electronics **370 g**. Mapping in `hx_params.m`: `bodyMass = 0.370`, `printMassScale = 0.881` on printed leg parts only. MG996R bodies and horns stay at the CAD mass (about 0.167 kg per leg), so the printed share is about 0.063 kg per leg. File Solid blocks use compile-time mass, so `hx_bake_masses` writes Mass and inertia into the model. Changing the workspace `smiData` alone does not update the dynamics.

Standing at the ready pose, in the earlier CAD-mass run, was femur 0.37 N·m and tibia 0.24 N·m. The high peaks are during tripod stance, mostly middle and rear femur. Front-leg femur peaks in that CAD run were about 0.46 N·m, which fits a rear-biased load in the model.

Eco body speed at 1.75 kg was 28.3 mm/s. Sport was 56.5 mm/s. Foot clearance was about 22 mm. Plots and the joint-by-joint table are in `results/`.

## Center-of-mass sweep (not built)

`trim/comparison_table.csv` and `trim/summary_trim.txt` record fore/aft center-of-mass offsets and Eco gait trims at 1.75 kg. Moving the model center of mass **+40 mm forward** dropped Eco peak femur from 101% to **94.5%** (0.896 N·m) at about 28 mm/s. Moving it aft made the peaks worse. A combined +40 mm offset with a shorter, slower Eco cycle reached about 90% in the same sweep.

That battery move was **not** made. The pack sits mid-to-aft lengthwise. Raw time series for the +40 mm case are not in the repo.

## What the hardware did

P3DRO walked outdoors in **Eco and Sport** on the MG996Rs that are on the robot. No stronger servos were fitted. The ideal-servo model still put femur peaks at or above the 0.948 N·m stall figure at 1.75 kg. The outdoor walks are the hardware result.

The model's ready pose is the Simscape foot target `[150 0 -120]` mm, not the calibrated pose stored on the ESP32.
