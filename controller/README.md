# Hexapod Command

Browser controller in `dist/`. It talks to the ESP32 over USB (Web Serial) or over HTTP when the phone or laptop is on the robot's Wi-Fi. The pages the ESP32 itself serves are [`firmware/deck/`](../firmware/deck/), embedded by `pack_web.py`. This folder is the laptop-side app and the calibration utility exported from `dist/calibration/`.

Open `dist/index.html` for the control center. `?preview=1` shows the connection sequence without sending robot commands. On the robot, join `Hexapod-Control` and open `http://192.168.4.1/`.

Calibration and ready-position editing for this app are separate. `node export-device.mjs <output.html>` writes a single-file copy of the control center. Pass `dist/calibration/index.html` as a second argument to export the calibration page. Shared scripts live in `dist/`; `dist/calibration/` keeps only the files that differ (its page, serial link, and stylesheet).

Walking and crabwalk on the robot are generated in the ESP32 loop at 20 ms, not by the browser. Eco and Sport select the 2.4 s and 1.2 s cycles. The 50–5000 µs/s slider caps commanded servo slew. Each direction needs a completed one-cycle test before the joystick repeats it. Releasing the joystick finishes that cycle and returns to the saved ready pose. Outputs off, the link-loss watchdog, and I²C faults disable PWM.

The battery and travel-speed readouts stay unavailable until voltage sensing and odometry exist. They do not invent a percentage from the 5 V rail or a ground speed. Stretch, Dance, and Jump stay disabled.

Offline checks: `node --test tests/*.test.cjs`. The browser QA scripts under `tests/` need Playwright and are not part of that command. Browser checks do not prove leg clearance. Run the first cycle with the chassis supported and the feet clear.
