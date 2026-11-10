# Firmware

PlatformIO project for the ESP32 that walks P3DRO. The walking program is `src/six_leg_setup.cpp` (environment `six_leg_setup`). It runs the tripod gait in `src/gait.h` and serves the phone deck in `deck/` at `http://192.168.4.1/`.

`pack_web.py` embeds the deck and the calibration page when that environment is built.

## Layout

| Path | Role |
| --- | --- |
| `src/` | Walking controller, gait, and the bring-up programs (I²C scan, one servo, one leg, batch center) |
| `core/` | Motion code shared with the desktop preview |
| `leg-ik/` | One-leg inverse kinematics used by `core/geometry.h` |
| `deck/` | Phone deck and calibration page |
| `preview/` | Desktop preview page served by `server.py` |
| `native/` | Desktop controller process used by `server.py` |
| `tests/` | Host tests. No robot required |
| `bench-web/` | Page used while bringing up one leg |
| `six-leg-console.py` | USB terminal. It does not change calibration when it connects |
| `leg-control.py` | One-leg bench commands |
| `six-leg-calibration.json` | Calibration export from commissioning |

## Build and upload

Copy `src/wifi_secrets.example.h` to `src/wifi_secrets.h` and set an access-point password of at least 8 characters. `wifi_secrets.h` is git-ignored.

With the servo battery disconnected for the first upload:

```bash
cd firmware
pio run -e six_leg_setup -t upload --upload-port <port>
```

Other environments: `i2c_check`, `servo_bench`, `leg_bench`, `batch_center`, and `esp32dev` (an earlier preview firmware that leaves servo output disabled).

Uploading keeps the calibration stored in flash as long as the flash is not erased.

## Desktop preview

```bash
mkdir -p firmware/build
g++ -std=c++17 -O2 firmware/native/main.cpp -o firmware/build/controller
cd firmware
python server.py
```

Open `http://127.0.0.1:8765/`. The page shows commanded geometry from the native controller. It is not the program that walks the robot. The robot uses the deck. `build/` is git-ignored. On Windows the same binary may be named `controller.exe`; `server.py` accepts either name.

## Tests

From the repository root:

```bash
g++ -std=c++17 -Ifirmware/tests/v6_stubs firmware/tests/test_six_leg_v6.cpp -o /tmp/t6 && /tmp/t6
g++ -std=c++17 firmware/tests/test_gait.cpp -o /tmp/tg && /tmp/tg
g++ -std=c++17 firmware/leg-ik/test_ik.cpp -o /tmp/ti && /tmp/ti
node firmware/tests/test_link.js
node --test controller/tests/*.test.cjs
```
