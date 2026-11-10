# Six-leg commissioning

## Current controller: firmware v6

Build and upload from [`firmware/`](../firmware/README.md). Do not erase flash if the saved calibration should stay.

* Phone deck: `http://192.168.4.1/` (Wi-Fi **Hexapod-Control**, password in `wifi_secrets.h`).
  Calibration: `http://192.168.4.1/calibration/`. Both pages come from `firmware/deck`
  and are embedded by `firmware/pack_web.py` at build time.
* Gait: continuous time-based tripod walk / turn / crab from one generator
  (`firmware/src/gait.h`), 20 ms fixed tick. Eco = 2.4 s cycle, Sport = 1.2 s by default.
  The servo speed limit defaults to Auto (sized to the tempo); a lower manual limit is
  reported on the deck when it slows the gait.
* Calibration in NVS is migrated automatically on first boot (old data is left in place).
  After migration every joint's **direction must be re-checked once** on the calibration page.
* USB terminal, from `firmware/`: `python six-leg-console.py --port <port>`. It does not change calibration on connect.
  One-leg bench commands: `python leg-control.py`.
* Tests: `firmware/tests/test_gait.cpp`, `firmware/tests/test_six_leg_v6.cpp` (host g++), and `firmware/tests/test_link.js`.
  Open `firmware/deck/index.html?preview=1` in a browser for an offline simulated robot.

The entries below are a dated bring-up log. Console commands such as arm/jog/config, and the Windows helper scripts named in those notes, are not in this tree.

## Proposed wiring (viewed from above, robot facing forward)

| Leg | Label | PCA address | Hip | Knee | Foot |
|---|---|---|---|---|---|
| Left front | LF | 0x40 | 0 | 1 | 2 |
| Left middle | LM | 0x40 | 3 | 4 | 5 |
| Left rear | LR | 0x40 | 6 | 7 | 8 |
| Right front | RF | 0x41 | 0 | 1 | 2 |
| Right middle | RM | 0x41 | 3 | 4 | 5 |
| Right rear | RR | 0x41 | 6 | 7 | 8 |

Both PCA boards must be detected. Set the second board's A0 address jumper for 0x41.
Logic: ESP32 3V3 to VCC, GPIO21 SDA, GPIO22 SCL, common ground.
Servo V+ uses the regulated servo supply, not ESP32 power.
Finalize full-robot power distribution before connecting all 18. The small bench
power connector has not been approved for full-robot current.

## First session

1. Support the body and all legs. Battery disconnected during upload and rewiring.
2. Build the `six_leg_setup` environment using `build-esp32.ps1` and upload that
   environment's binaries (not the old `leg_bench` or `batch_center` binaries).
3. Close the web app's USB connection. Run `six-leg-setup.ps1` from the project root.
   Connection sends OFF and uploads saved configuration; it does not arm any leg.
4. Connect servo power only after the console reports ready. Choose `arm LF`.
   This explicitly moves three servos to their saved centers; initial actual angles
   are unknown, so that initial motion cannot be guaranteed slow.
5. Try `jog hip 10`, `jog knee 10`, `jog foot 10`, observing one at a time.
   `move knee 1500` requests an absolute pulse. Default speed is 100 us/s.
6. Use `off` before switching legs or changing limits. Use `quit` to close.

## Calibration commands

`config LF knee 1450 1500 1550 1` sets min, center, max, direction (+1 or -1).
Config is allowed only with outputs off. Start with the default narrow 1450–1550
window; adjust gradually after clearance checks, within the 500–2500 command envelope.
The envelope is not a measured mechanical range. Do not force a joint to stall.
`jog` uses the saved direction; `move` is always an absolute pulse.
`speed 250` changes subsequent moves (50–5000 us/s in increments of 50).
`verify LF knee` records your manual check. It does not measure the joint.
`save` stores settings in `six-leg-calibration.json`; do this before quitting.
`status` displays commanded pulses, not physical angle feedback.
`off` releases holding torque: support the robot first.

The console sends heartbeats while a leg is active. Missing them for one second
switches every output off. No automatic re-arm. I2C faults latch until reset;
failed I2C can prevent an OFF write, so battery disconnection remains the fallback.

## What comes after

Validate all 18 directions and useful ranges; save each joint's settings.
Pulse calibration is not an angle calibration or a verified inverse-kinematics map.
Measure joint reference angles/link dimensions before enabling the existing gait
controller. Right and left directions must be checked separately. Then test each
leg's step, measure current with increasing leg count, and only then coordinate gait.
The old web joystick is not compatible with this commissioning protocol yet.

## Assembly update — 2026-10-20

User reindexed all six foot horns. Foot centers remain 1500 us, including LF.
Do not reuse the old leg_bench 1238 us foot stepping reference or assume its old
pose clearance after this mechanical change. The archived single-leg sequence
has not been retuned for the assembled robot.
LF center identification passed. LM hip/knee/foot identification sequence was
reported correct by the user; individual signed directions were not explicitly
reported. Full travel limits and mirrored right-leg directions remain unverified.

### Two-front-leg commissioning test (2026-10-20)
`ARM_FRONT` (outputs must be off) enables LF and RF only, holding all six joints at 1500 us. Requires both legs' configured centers to be 1500 and limits to include 1500..1550. `STATUS` includes `frontPair=1` while active. Only `MOVE 1 <1500..1550> <1..2>` is accepted in this mode; both knees ramp together at 50 or 100 us/s. Hip and foot motion is rejected. OFF, the one-second heartbeat timeout, and I2C faults disable both boards. Boot remains outputs off. This is a supported, feet-clear test, not a standing gait or full-system power validation. Do not use the single-leg console to drive this mode.

Left-rear observation: user reports increasing pulse moves hip forward, knee upward, foot inward. Right-side report: hip backward (tentative), other two match upward/inward; confirm mirrored hip direction before coordinated stepping. These observations do not verify travel limits.

### Four/six-leg commissioning (2026-10-20)
ARM_FOUR selects LF, LR, RF, RR (groupMask=45); ARM_SIX selects all six (groupMask=63). ARM_FRONT remains mask 9. These modes require outputs off and compatible 1500-us centers/limits on every selected joint. All selected hips and feet hold 1500; only knee MOVE 1 1500..1550 at rate 1..2 is allowed. Status retains frontPair=1 as the legacy group-mode flag and adds groupMask. OFF clears the mask. The heartbeat timeout and I2C-fault handling apply to all outputs.

Two-front-leg test completed three cycles: user reports smooth movement, no strained buzzing/jitter, and meter reading 5.14 V throughout. Four- and six-leg physical tests are pending. These are supported tests, not a full-load rating. Existing bench-web still speaks the old LEG protocol; migrate its connection/control panel to SETUP after group tests pass, retaining the original site's joystick, speed control and Stop. Do not use old single-leg presets with reindexed foot horns.

### Superseding manual joystick firmware / Site v0.4 (2026-10-20)
User reports six-leg knee test held 5.14 V throughout. User explicitly requested removing both conservative group-speed and travel restrictions. Current firmware defaults to 1000..2000 us for all joints; rates 1..100 mean 50..5000 us/s. ARM_FRONT/FOUR/SIX now allow all three joints, with right-group hips mirrored (3000 minus logical pulse). Group arming requires all selected centers 1500 and full 1000..2000 configuration. `CAPS` returns `CAPS v=2 min=1000 max=2000 rate=100 groups=all hipMirror=1`. OFF and heartbeat/I2C fault behavior remain. STATUS remains v1 with frontPair as legacy group flag plus groupMask. This supersedes the narrower knee-only rules above.
Site code: sites/hexapod-command/dist/hardware.js and serial-link.js. Physical movement from the new site remains user-validated; direct joystick control is not a walking gait. No physical motion was issued during the site integration/upload.

USB manual control was checked with a local mock port. COM4 verified OFF, CAPS v2, ready=1 leg=-1 current=0,0,0 groupMask=0 after upload. Real joystick motion was still pending at that point. Battery disconnected at upload. Firmware and site test suites passed.

## Ready poses and walking tests (v0.5, supersedes v0.4)
USB now requires CAPS v3: min=1000 max=2000 rate=100 frames=18 rightMirror=all. The cyan design and joystick remain. All right-side joints are mirrored. Each leg has independent raw commands and a saved ready pose. Select a leg, use 1500 calibration, adjust with the joystick, then Save ready pose. Repeat for six legs. Poses persist in this browser/site, not ESP32 flash; the table displays commanded and saved values, not measured angles. Ready pose & enable starts at saved values. Initial activation cannot ramp from an unknown physical position.

Forward, backward and step-in-place tripod tests have cycle count, stride, lift, foot extension and 50–5000 us/s speed. All six poses must be saved. The complete trajectory must fit each joint's saved limit before execution. Tests return to and hold ready; Stop disables outputs. These are supported open-loop tests, not validated floor walking or IK. No pose was guessed from the photo, and no unverified LF offset was introduced.

Node tests (15), firmware host tests and ESP32 build passed. Browser mock checked saving six poses, mirrored foot targets, ready startup, walking completion and outputs off with no console errors. No real robot movement was performed. Firmware upload is PENDING: user does not currently have the ESP32. Installed v2 will be rejected until v3 is uploaded. Next session: battery disconnected, USB connected, upload six_leg_setup, verify OFF/CAPS/STATE. START and FRAME carry 18 raw pulses; STATE reports POSE v3. Boot/off/watchdog/I2C fault shutdown remain. Test harness files are outside published dist.

### Firmware upload completed — 2026-10-20
User confirmed battery disconnected and USB connected. Uploaded tested six_leg_setup v3 to COM4; flash hashes verified. Read-only handshake after OFF returned CAPS v3, ready=1, mask=0, all 18 current/target values zero. No motion commanded. Firmware upload is no longer pending; physical ready-pose and walking validation remain pending.

## Wireless commissioning and per-joint calibration (v0.7, supersedes v0.6)
The command deck runs over desktop USB or directly from the ESP32 access point. Firmware CAPS v4 advertises raw 18-joint frames, 500–2500 µs absolute command bounds, and Wi-Fi support. The ESP32 hosts an offline copy of the same interface at http://192.168.4.1. Join Hexapod-Control with password <your-AP-password>. The owner-private hosted Site cannot fetch the local HTTP controller from HTTPS; navigate to the ESP32 page to use Wi-Fi. A phone can use that page. The connection starts with OFF and rejects older firmware before motion.

Each joint has editable minimum and maximum values inside the firmware's 500–2500 µs envelope. Firmware v2 widens legacy 1000–2000 limits to 500–2500 once; limits saved afterward persist unchanged. Stop outputs, select a single leg/joint, then set its limits and use the precise target and 10 µs buttons for deliberate calibration. The software cannot detect stalls or measured joint angles. Stop at physical binding and correct horn positions mechanically. Ready poses and limits live in ESP32 NVS and can be exported as JSON.

The Wi-Fi HTTP server runs on a separate ESP32 core and queues commands to the existing controller loop, preserving the one-second motion watchdog. A claimed session uses monotonically increasing sequence numbers. A custom request header and same-origin check reject cross-site commands; the AP remains protected by its password. Serial and Wi-Fi connections cannot drive motion simultaneously. OFF, boot-off and I2C fault shutdown remain.

Node tests and ESP32 compilation passed; browser QA used a simulated serial controller. Hardware Wi-Fi and expanded pulse travel require physical testing. Host executable tests compiled but Windows Application Control blocked running the generated executable.

A private preview of the site was checked on 2026-10-20. On 2026-10-20, with the servo battery disconnected and ESP32 USB connected, firmware v4 was uploaded to COM4; all flash hashes verified. Serial verification returned `OK OFF`, `CAPS v=4 min=500 max=2500 rate=100 frames=18 rightMirror=all wifi=1`, and `POSE v=3 ready=1 mask=0` with all 18 current and target pulses zero. No motion was commanded. Hardware Wi-Fi connection and expanded pulse travel still require physical testing.

## Phone Setup and Crabwalk controller (v0.7, supersedes v0.6)

The same cyan controller is available from the private hosted Site and, without USB, directly from the ESP32 access point at http://192.168.4.1. The live panel scrolls on phones and places mode, readiness, 50–5000 µs/s speed, joystick, and Outputs off ahead of detailed calibration. The schematic is hidden during live control. Stop in the sticky header and Outputs off both disable output.

Firmware CAPS v5 supports single-servo Setup and Preferences/NVS storage. On boot and after OFF, all 18 PCA channels are off. In Setup, select a leg and servo joint, check readiness with the chassis supported and feet clear, then select “Center selected servo at 1500 µs.” `JSTART` energizes only that joint; the other 17 channels remain off. Adjust with the joystick or precise target, and save its ready pulse to the ESP32. Stop outputs before switching joints or changing limits. A saved leg ready pose requires all three joints. Limits must include 1500 µs and can be widened only after checking physical clearance. The software has no angle or stall feedback.

Calibration export reads the ESP32 settings. “Load old browser settings” copies any prior same-origin browser JSON into the import box; review it before importing. Import replaces ESP32 settings and requires outputs off. USB and Wi-Fi pages have different browser origins, but their ready positions and limits now share the same ESP32 NVS storage. Browser JSON remains a backup, not the authority.

Crabwalk uses explicitly saved raw pulses for planted and lifted positions of each of six legs in each sideways direction (24 leg phases). Tune a joint in Setup and copy its current pulse into a left/right planted/lifted draft, then stop outputs and save that leg phase in Crabwalk. Repeat for all phases of the chosen direction. Every pulse must fit that joint's saved limit. First run “Test one cycle” while supporting the robot and checking clearance. Only after that in the current connection does holding the joystick left or right repeat sideways cycles; release completes the current cycle and returns to the saved ready pose. Speed slider controls commanded slew. This is an open-loop pattern, not a validated floor gait or IK solution. Roll, Climber and gesture modes remain deferred.

On 2026-10-20, the local mock controller passed import of all 18 ready positions and 24 crab phases, an isolated-servo command, one simulated left Crabwalk cycle, and Outputs off. The Node suite passed 19 tests; firmware built successfully. The corrected controller was checked in the local mock. With the servo battery unplugged, firmware v5 was flashed to COM4; all flash hashes verified. Serial readback returned CAPS v5, STATUS ready with outputs off, and STATE with all 18 current and target pulses zero. NVS records were readable. No real servo motion or physical Crabwalk validation was performed.

## Fixed phone controller uploaded (2026-10-21)
The live page now keeps modes and 50–5000 us/s speed on the left, joystick on the right, and Outputs off visible. Main controls fit the four tested portrait/landscape phone viewports without page scrolling. Secondary tools are organized into tabs. Walk: enable after saved-pose/readiness checks, hold up/down to repeat forward/backward tripod cycles, release to finish the cycle and return to ready. Crabwalk still requires stored directional poses and a one-cycle test. Setup uses only the selected servo and saves its ready pulse to NVS.

The phone layout was checked in the local mock. Firmware compiled and uploaded to COM4 with battery disconnected; the first 460800 baud transfer failed, the 115200 baud retry succeeded with verified flash hash. Post-upload OFF/CAPS/STATUS/STATE checks passed: all 18 current and target values zero. NVS reports 0/18 ready servos and 0/24 crab phases, so restore a calibration backup or complete Setup before walking. No physical motion was commanded.

Validation: 19 Node tests and mock-browser checks across 844x390, 667x320, 390x844, 375x667, four modes, joystick walking, release-to-ready, Outputs off, isolated Setup/save, and one crab cycle passed. Physical gait/clearance and iPhone Wi-Fi validation remain user-supervised checks.

## Later result

Those October notes stop before the outdoor walks. P3DRO later walked outdoors in Eco and Sport on the MG996Rs, with the battery mid-to-aft. The repository README is the current status.
