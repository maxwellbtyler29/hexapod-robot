# Hexapod MATLAB starter

Open this folder in MATLAB, then run:

```matlab
test_kinematics
run_hexapod_demo(true)
```

Base MATLAB is sufficient. The scripts were executed successfully using MATLAB R2026a on 25 September 2026. The numerical test checked 292 reachable points and rejected an unreachable point. The demo writes two PNG figures, `joint_angles.csv`, and `results.mat` to `results/`.

The model is a fixed-body kinematic preview. Foot contact and a centered center of mass are assumed. It does not model contact forces, body translation, real servo response, electronics, grass, loose gravel, or actual stability. A positive geometric support margin is not proof of successful walking. Do not send the CSV directly to servos.

## Learn by changing one variable

1. Run the baseline and save the results.
2. Change `p.lift` from 0.025 to 0.035 metres and compare joint rates.
3. Change `p.stride` from 0.030 to 0.040 metres and compare joint limits.
4. Change link lengths to match your SolidWorks joint-axis dimensions.
5. Replace the assumed center of mass and contact pattern as the model matures.

Frames: body x forward, y left, z up. Local leg x points outward, local y is tangential, local z is up. Mount order: LF, LM, LR, RR, RM, RF. Joint order: hip yaw, hip pitch, knee pitch. Distances are metres, angles radians. Knee branch is negative. These ideal angles are not physical servo horn angles.

For moving-body simulation, define stance feet in world coordinates and transform each into the moving body and leg frames; do not treat the demo's in-place foot motion as a no-slip gait controller.

Suggested future files: `body_pose.m`, `terrain_profile.m`, `servo_calibration.csv`, `mass_budget.csv`, and `terrain_test_log.csv`. Optional Simscape modeling instructions are in the PDF packet.
