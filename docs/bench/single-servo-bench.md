# Single-servo bench test

14 October 2026: user reports 5.14 V at the PCA servo-power terminal with the SBEC selected to 5 V and no servo attached. This is an unloaded measurement, not validation of the supply or wiring for 18 servos. Both PCA boards previously passed individual I2C checks at 0x40; use only one board here.

## Wiring, with battery and USB unplugged

Keep the existing verified SBEC output plug on its unused servo column: red wire to middle V+, black wire to outer GND, unpopulated housing slot over PWM. This connection is for the single-servo test only. The other SBEC output stays disconnected.

Connect ESP32 3V3 to PCA VCC, GND to GND, GPIO21 to SDA, GPIO22 to SCL. Leave OE unconnected for this bench test (the board's pull-down enables outputs). Never join VCC to V+ or feed the SBEC into the ESP32 while USB powers it.

Connect one loose, unloaded MG996R to PCA channel 0 (verify the printed channel number; it is the end near the fitted logic header):

| Servo wire | PCA row |
| --- | --- |
| Brown | GND, black outer row |
| Red | V+, red middle row |
| Orange | PWM, yellow inner row |

Keep the servo off the robot, with its horn/linkage removed for the initial test. Do not grip its shaft. Keep the battery disconnected until firmware is uploaded and reports BENCH READY with outputs off.

## Firmware and sequence

Build using `build-esp32.ps1 -Environment servo_bench`. This compiles only. Upload that environment's bootloader, partition table and firmware to the confirmed ESP32 port with servo power disconnected. This replaces the scanner/Wi-Fi application until another environment is uploaded.

At 115200 baud, send newline-terminated uppercase commands:

| Command | Action |
| --- | --- |
| STATUS | Reports software state; does not measure servo position or voltage |
| CENTER | Channel 0 nominal 1500 microseconds |
| LOW | Nominal 1450 microseconds, requires CENTER first |
| HIGH | Nominal 1550 microseconds, requires CENTER first |
| OFF | Requests all channels' PWM off |

After BENCH READY, connect the battery, then explicitly send CENTER when physically ready. The first movement may be substantial because the starting shaft position is unknown. Observe the loose servo before trying LOW/HIGH. Each motion command expires after five seconds, disabling pulses; after expiry another CENTER is required. There is no automatic sweep and no output to any other channel.

Commands specify nominal pulse widths, not calibrated angles or measured positions. Servo direction and endpoints remain uncalibrated. The program checks I2C write results and latches a fault on failure. PWM off and the software timeout do not disconnect power or guarantee torque removal, especially during I2C/processor faults. Disconnect the battery immediately for binding, persistent harsh buzzing, heating or unexpected motion. Disconnect battery before USB removal, reset, upload or rewiring.

References: [Adafruit pinouts](https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts), [pulse calibration guidance](https://learn.adafruit.com/16-channel-pwm-servo-driver/using-the-adafruit-library).

## Upload record — 14 October 2026

Uploaded servo_bench to the confirmed ESP32 on COM4 with user-confirmed battery disconnected. Esptool verified flash hashes. A subsequent STATUS command returned ready=1 active=0 channel=0 nominal_pulse_us=0. This confirms software initialization and inactive PWM state reported by firmware; no motion command has been sent and physical movement remains untested.


## Observed servo results

User reported smooth, quiet center/small side-to-side movement for the initial loose servo and each of the three servos from the assembled leg (body yaw, lifting joint, outer knee), tested individually on channel 0 with the driven linkage detached. Each sequence ended at nominal 1500 us followed by PWM off. The yaw linkage was reattached at the user-confirmed aligned outward reference. Lifting/knee linkage alignment, measured angle-to-pulse calibration, limits and loaded performance remain unverified. These are user observations, not encoder measurements.

