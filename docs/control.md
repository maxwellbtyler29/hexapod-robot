# Control

P3DRO walks with firmware v6 (`firmware/src/six_leg_setup.cpp`). The ESP32 generates a tripod gait on a fixed 20 ms tick, so servo timing does not follow the network.

- **Walk, turn, and crab.** Forward and backward use alternating tripod groups. Crab uses the planted and lifted pulses saved for that direction.
- **Eco and Sport.** Cycle times are 2.4 s and 1.2 s. A separate slew limit can slow the servos further.
- **Calibration.** Each joint's ready pulse and limits live in ESP32 flash (NVS). The joystick repeats a direction only after a one-cycle test in that direction.
- **Shutdown.** Outputs turn off on a link-loss watchdog or an I²C fault. Boot starts with outputs off.

The phone page is [`firmware/deck/`](../firmware/deck/), embedded by `pack_web.py` and served at `http://192.168.4.1/`. Calibration is at `/calibration/`.

[`controller/`](../controller/) is Hexapod Command, the browser app for USB serial and for the same HTTP API from a laptop.

[`firmware/preview/`](../firmware/preview/) plus `firmware/server.py` is an earlier desktop view of the shared motion core: walk, crab, body roll, one-leg placement, and a small pose library. That preview does not drive the walking robot. Servo output in the `esp32dev` environment stays disabled. The walking program is `six_leg_setup`.
