# Supported three-servo leg test

This commissioning program is separate from the full robot controller. Each of the three leg servos previously passed a detached-linkage center and small movement test. User reports reassembly at nominal 1500 us references: outward yaw, upper link approximately horizontal, knee-to-foot direction approximately downward. Exact angles, directions, travel limits and load capacity are not calibrated.

## Wiring

Disconnect battery and USB while changing connections. Use one PCA9685 at 0x40:

| Channel | Servo |
| --- | --- |
| 0 | Hip (body swivel) |
| 1 | Knee (middle servo) |
| 2 | Foot (outermost servo) |

Brown goes to outer black GND, red to middle red V+, orange to inner yellow PWM. The existing SBEC output stays on its separate unused servo header. No direct battery connection to the PCA or ESP32. ESP32 USB powers logic: 3V3 to VCC, GND to GND, D21 to SDA, D22 to SCL. OE remains at the board's default enabled state. The second PCA stays disconnected.

The user measured 5.14 V unloaded on the 5 V SBEC setting. Three supported servos are a new load test, not proof that the small SBEC connector, PCA traces, or regulator can serve 18 servos. Keep the body stably supported and foot off the table. Also support the leg against falling when pulses stop, without restraining commanded movement or putting fingers in the joints. Do not perform standing/weight-bearing tests yet.

## Program

Build with `build-esp32.ps1 -Environment leg_bench`. Upload only with battery unplugged. At 115200 baud, STATUS should report `LEG ready=1 active=0 current_us=0,0,0 target_us=1500,1500,1500`.

The program initializes all 16 outputs off. Only channels 0, 1, 2 can receive active pulses. Commands are newline-terminated uppercase:

| Command | Result |
| --- | --- |
| STATUS | Software state; no sensor feedback and no timeout extension |
| CENTER | All three targets 1500 us; required to enable outputs |
| HIP_LOW / HIP_HIGH | Channel 0 target 1475 / 1525 us |
| HIP_1400 / HIP_1600 | Channel 0 target 1400 / 1600 us for supported calibration only |
| KNEE_LOW / KNEE_HIGH | Channel 1 target 1475 / 1525 us |
| FOOT_LOW / FOOT_HIGH | Channel 2 target 1475 / 1525 us |
| OFF | Requests all pulses off; does not disconnect power |

Start with a single CENTER command after the user confirms battery connection and clearance. Wait for the five-second timeout and user observations before further tests. Initial centering can jump if the shaft moved during assembly: no position sensor exists to ramp from its actual position. Subsequent changes ramp at up to 2 us per 20 ms. These are pulse limits, not verified mechanical joint limits.

For small movement tests, keep all three servos enabled while moving one joint at a time. CENTER and wait for all commanded pulses to return to 1500 before switching joints. The program rejects switching joints while another is off-center. Motion commands renew a five-second timeout; STATUS and rejected commands do not. On expiry, all PWM turns off and CENTER is required again.

Stop by disconnecting the battery for binding, strong buzzing, heating or unexpected movement. Software OFF/timeout cannot guarantee stop during I2C or processor failures, and a servo may not release torque on signal loss. Never rely on PWM off as power isolation. Disconnect battery before upload, reset, USB removal or rewiring.

## Software verification

`tests/test_leg_bench.cpp` compiles the actual firmware against simulated serial, clock and PCA interfaces in `tests/leg_bench_stubs`. It checks no active pulses at boot, explicit CENTER requirement, malformed command rejection, all three channel mappings, narrow pulse limits, gradual changes, joint-switch interlock, timeout including clock rollover, and a fault halfway through enabling the three channels. This test does not validate physical motion, load or real bus timing.

14 October 2026: ESP32 build passed; desktop simulation passed with assertions enabled and warnings treated as errors. Uploaded leg_bench to COM4 with user-confirmed battery unplugged; flash hashes verified. No three-servo motion command has been sent yet.


## Physical observations — 15 October 2026

With all three servos connected, user observed a smooth, very small body-swivel movement during the channel 0 test. Swivel direction relative to the body has not been recorded. Initial lifting checks were inconclusive; user corrected a reversed servo connector and subsequently connected the previously disconnected battery. After repeat tests, user observed channel 1 at 1475 us (from 1500 us) raising the knee end of the upper link. User observed channel 2 at 1475 us (from 1500 us) moving the foot away from the body. These establish local physical directions only, not angular scale or travel limits. Each sequence returned commanded pulses to 1500 us and verified inactive firmware state after OFF. The user has not yet explicitly confirmed smooth/quiet operation for the assembled knee test. No full-load, standing, gait or coordinated multi-joint trajectory has been validated. Keep the full robot servo calibration disabled.


## Video estimate — 15 October 2026

User uploaded IMG_2718.mov, 5.02 s, 1920x1080 H.264. The commanded sequence lasted about 9.6 s: 1500 us center, 1475 us lift, return to center. In frames sampled at 2 Hz, template matching of the two horn/shaft centers found a relative vector from approximately (464, 0) pixels at the clip start to (460, +10) pixels during the held state after 1.0 s (800-pixel-wide portrait output; image Y increases downward). This is an apparent clockwise/downward change of about 1.25 degrees. The apparent return near 4.0 s was incomplete in the recorded clip. Camera/body translation of about 20 pixels was seen, but the angle is measured between centers to reduce its effect. Treat ~1.2 degrees per 25 us as a provisional local magnitude only, with roughly half-degree visual uncertainty. The video direction (knee end lower in image) conflicts with the user's earlier up observation. Do not apply the sign or gain to robot calibration until a longer fixed-camera video confirms both 1500 and 1475 us held positions and return.


## Bounded hip calibration update — 15 October 2026

At the user's request to measure a larger supported hip/lifting-joint movement, leg_bench now accepts LIFT_1400 and LIFT_1600 while retaining the small ±25 us commands. Lift output is hard-limited to 1400–1600 us; yaw and knee remain 1475–1525 us. Output still ramps at 2 us per 20 ms, requires CENTER first, and turns all PWM off after five seconds without an accepted motion command. The revised ESP32 build and simulated firmware test passed; firmware uploaded and flash verified on COM4 with user-confirmed battery unplugged. STATUS returned ready=1 active=0 current_us=0,0,0. No motion has been commanded since this upload. TowerPro lists its own MG996R variant at 0–159 degrees total, but the user's Deegoo-FPV branded MG996R may differ; neither this rating nor free joint clearance proves ±90 degrees from 1500 us. Follow staged visual measurements and stop before servo or joint end stops.


## Wiring correction — 15 October 2026

During a powered center → LIFT_1400 → center test, the user saw the foot move. They subsequently confirmed that the middle knee servo itself rotated: channel 1 is the knee, and its motion carried the foot. The earlier video therefore measured knee motion, not hip motion; do not use its provisional ~1.2 degree/25 us estimate for the hip. The user specified the definitive channel terminology: hip = 0, knee = 1, foot = 2. The firmware source and commands now use these names, with the 1400–1600 us calibration envelope reassigned to channel 0. The updated desktop simulation and ESP32 build passed. With the user-confirmed battery unplugged, the revised firmware was uploaded to COM4, all flash hashes verified, and STATUS returned `LEG ready=1 active=0 current_us=0,0,0 target_us=1500,1500,1500`. No motion has been commanded with this version yet. Film channel 0 hip swivel from overhead to measure its horizontal rotation; the earlier side view cannot measure that axis reliably.


## Visible supported step — 15 October 2026

The latest source adds three bounded pose commands, in hip/knee/foot order (microseconds):

| Command | Required settled starting pose | Target pose |
| --- | --- | --- |
| STEP_LIFT | 1500,1500,1500 | 1500,1350,1550 |
| STEP_FORWARD | 1500,1350,1550 | 1650,1350,1550 |
| STEP_LOWER | 1650,1350,1550 | 1650,1500,1500 |
| CENTER | Any active pose | 1500,1500,1500 |

These replace the earlier narrow bounds with hip 1400–1650, knee 1350–1525, foot 1475–1550 us. Small individual commands remain available. Stage commands are rejected if inactive, out of order, or the preceding pose has not settled. CENTER can abort toward neutral; OFF disables outputs immediately. The five-second command timeout remains in effect, including mid-step. There is no automatic stepping at boot and no looping gait. Each 150 us transition takes approximately 1.5 seconds at the existing ramp rate. A host must send each next stage within five seconds of the preceding accepted movement command.

The user confirmed increasing hip pulse moves toward the front. The 1600 us hip video showed a rough 6–8 degree change, not a calibrated scale. The new lift follows the earlier reported knee-low/up direction and foot-high/tuck direction; these remain provisional. The 150 us changes nominally represent 13.5 degrees under the generic 500–2500 us/180-degree mapping. First execution must have the body supported and foot hanging freely; this is a visible step demonstration, not a validated ground-contact walking trajectory.
