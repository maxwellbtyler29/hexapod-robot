#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

// Bench only: one unloaded servo, channel 0, one board at 0x40.
// Disconnect servo power before upload/reset/rewiring. No automatic motion.
Adafruit_PWMServoDriver pca(0x40, Wire);
bool ready = false, active = false, centered = false;
uint32_t lastCommand = 0;
uint16_t pulseUs = 0;
uint8_t prescale = 0;
char command[24];
size_t used = 0;
bool overflow = false;

bool allOff() {
  bool ok = true;
  for (uint8_t ch = 0; ch < 16; ++ch)
    if (pca.setPWM(ch, 0, 4096) != 0) ok = false;
  active = centered = false;
  pulseUs = 0;
  return ok;
}

void fault() {
  allOff(); // Best effort only: an I2C fault can prevent this write.
  ready = false;
  Serial.println("FAULT: disconnect battery. Reset with servo power disconnected.");
}

void status() {
  Serial.printf("ready=%d active=%d channel=0 nominal_pulse_us=%u\n",
                ready, active, pulseUs);
}

void execute(const char *cmd) {
  if (!strcmp(cmd, "STATUS")) { status(); return; }
  if (!ready) { Serial.println("Not ready. Disconnect battery and inspect logic wiring."); return; }
  if (!strcmp(cmd, "OFF")) {
    if (!allOff()) { fault(); return; }
    Serial.println("PWM off. Battery still supplies power.");
    return;
  }
  uint16_t target = 0;
  if (!strcmp(cmd, "CENTER")) target = 1500;
  else if (!strcmp(cmd, "LOW")) target = 1450;
  else if (!strcmp(cmd, "HIGH")) target = 1550;
  else { Serial.println("Commands: STATUS CENTER LOW HIGH OFF (newline terminated)"); return; }
  if (target != 1500 && !centered) {
    Serial.println("Send CENTER first. Keep servo unloaded and clear.");
    return;
  }
  // Uses the configured prescaler and nominal oscillator; not a calibrated angle.
  const uint16_t ticks = (uint32_t(target) * 25UL + (prescale + 1) / 2) / (prescale + 1);
  if (pca.setPWM(0, 0, ticks) != 0) { fault(); return; }
  active = centered = true;
  pulseUs = target;
  lastCommand = millis();
  status();
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  Wire.setClock(100000);
  Wire.setTimeOut(50);
  if (!pca.begin()) {
    Serial.println("No PCA9685 at 0x40. Leave battery disconnected.");
    return;
  }
  if (!allOff()) { fault(); return; }
  pca.setPWMFreq(50);
  prescale = pca.readPrescale();
  if (prescale != 121 || !allOff()) { fault(); return; }
  ready = true;
  Serial.println("BENCH READY: outputs off; channel 0 only; 50 Hz nominal.");
  Serial.println("Commands: STATUS CENTER LOW HIGH OFF. Auto PWM off after 5 seconds.");
  status();
}

void loop() {
  if (active && uint32_t(millis() - lastCommand) >= 5000) {
    if (!allOff()) fault();
    else Serial.println("5-second timeout: PWM off. Send CENTER to restart.");
  }
  // Bound serial processing so a continuous input stream cannot starve timeout.
  for (unsigned n = 0; n < 32 && Serial.available(); ++n) {
    const char c = char(Serial.read());
    if (c == '\r' || c == '\n') {
      if (overflow) Serial.println("Command too long; discarded.");
      else if (used) { command[used] = '\0'; execute(command); }
      used = 0;
      overflow = false;
    } else if (c < 32 || c > 126) {
      overflow = true;
    } else if (!overflow) {
      if (used < sizeof(command) - 1) command[used++] = c;
      else overflow = true;
    }
  }
  delay(1);
}
