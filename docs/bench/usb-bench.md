# USB-only ESP32 and PCA9685 lesson

The ESP32 runs the program and sends commands. Each PCA9685 generates up to 16 PWM signals. The SBEC will later supply servo power. A PCA9685 board has separate VCC (chip/logic power) and V+ (servo power) connections: USB can support this logic-only test without supplying the servos.

## First: ESP32 alone

Leave the battery, PCA boards, and servos disconnected. Plug the ESP32 into the computer with a USB data cable. Check Windows Device Manager > Ports (COM & LPT) for the port that appears, commonly a Silicon Labs CP210x USB-to-UART device for this board. Record its COM number. If no port appears, try a known data cable and another USB port before installing a driver. Never select an unrelated COM device for upload.

## Second: one PCA board

Unplug USB before changing wires. On a standard PCA9685 breakout, connect the pins by their printed labels:

| ESP32 | PCA9685 | Meaning |
| --- | --- | --- |
| 3V3 | VCC | 3.3 V logic supply |
| GND | GND | Common electrical reference |
| GPIO21 | SDA | I2C data |
| GPIO22 | SCL | I2C clock |

For the user's HW-170 board, the opposite header has bare holes rather than fitted pins. Use the four wires above for this communication-only test; leave OE unconnected. This exception is limited to having all servos and V+ disconnected and running the scanner, which configures no PWM output. Do not buy a splitter or solder an extra header merely for this step. An optional connection from OE to 3V3 disables outputs if a suitable connection is available; do not confuse VCC with V+.

Leave V+, the servo-power screw terminal, and every servo connector empty. Do not bridge VCC to V+. Do not use 5V/VIN for VCC in this ESP32 wiring. On the standard breakout, the SDA/SCL pullups follow VCC, so using 3.3 V also keeps the bus at the ESP32's logic level. Check your board's labels/layout before following a pin-position diagram from another seller.

These connections follow the [Adafruit breakout pin documentation](https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts). ESP32 GPIO21/22 match our firmware and the generic ESP32 defaults in [Espressif's I2C documentation](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/i2c.html).

## The test program

`firmware/src/i2c_check.cpp` starts Serial at 115200 baud and probes I2C addresses every few seconds. It does not write PCA9685 registers or configure servo pulses. The regular web-controller firmware stays separate and keeps its hardware output disabled.

Compile the test from this runtime folder:

```powershell
.\build-esp32.ps1 -Environment i2c_check
```

This command compiles only. Upload is a separate step after the correct ESP32/COM port is identified. Open Serial Monitor at 115200 after upload. If using Arduino IDE instead, the test source can be copied into a sketch; it needs the ESP32 Arduino board package and built-in Wire library, with ESP32 Dev Module selected for this ESP-WROOM-32 development board.

For one board with its address jumpers untouched, expect an acknowledgement at 0x40. Acknowledging addresses alone does not identify the chip or prove its servo outputs work. Some chips also respond to group addresses; do not count each reported address as a separate physical board.

## Then: the second board

Test the second board alone with the same wires first. Two default-address boards connected together can both acknowledge 0x40, so a scan cannot prove that both are working separately.

For simultaneous use, leave the first at 0x40 and configure the second as 0x41. On standard boards this means bridging only its A0 solder jumper with power unplugged. See the actual board markings and [address-jumper guide](https://learn.adafruit.com/16-channel-pwm-servo-driver/chaining-drivers) before soldering.

Both boards then share 3V3, GND, SDA, and SCL in parallel. V+ and all servos remain disconnected on both for this scanner test; OE may remain unconnected as described above. The expected individual addresses are 0x40 and 0x41. Decide how to physically split the shared connections using the available headers before wiring both together.

Passing this test verifies USB programming/serial communication and the logic bus. The next independent lesson can run the ESP32-hosted control website in dry-run mode. Servo centering, pulse calibration, motion, and loaded testing wait for a suitable servo power supply. Any fitted OE-to-3V3 jumpers must later be deliberately changed as part of the powered-output setup; with OE high the outputs remain disabled.

## Bench record — 14 October 2026

The communication-only firmware was uploaded and flash-verified on COM4. With the first HW-170 PCA board connected by the four wires above, three consecutive scans acknowledged 0x40 and 0x70; 0x41 was absent. The user then swapped in the second board alone. After clearing buffered serial text, two fresh scans also acknowledged 0x40 and 0x70 with 0x41 absent. Both boards pass their individual logic-bus checks, not servo-output or load tests. Both currently use 0x40; the second board's address still needs changing before simultaneous use. The ESP32 currently runs the scanner, replacing the Wi-Fi dry-run program until it is uploaded again. Subsequently, the user reported 5.14 V at the servo-power terminal with the SBEC selected to 5 V and no servo attached. Physical servo movement and loaded supply performance have not yet been verified. See single-servo-bench.md for the separate one-servo test; it must be uploaded before use.
