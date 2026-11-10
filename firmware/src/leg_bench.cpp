#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include <stdio.h>

// Supported-leg commissioning only; this is NOT the gait controller.
// One PCA at 0x40. Channels 0=hip, 1=knee, 2=foot.
// Servo supply MUST be disconnected during upload/reset/rewiring.
Adafruit_PWMServoDriver pca(0x40, Wire);
bool ready = false, active = false;
uint16_t currentUs[3] = {0, 0, 0};
uint16_t targetUs[3] = {1500, 1500, 1500};
uint32_t lastCommand = 0, lastStep = 0;
uint8_t prescale = 0;
char commandBuffer[32];
size_t used = 0;
bool overflow = false;
bool liveMode = false;
int presetRate = 5;
int rampUs = 2; // Per 20 ms: 2 = 100 us/s; live control allows 1..100.
const uint16_t minimum[3] = {1000, 1000, 1000};
const uint16_t maximum[3] = {2000, 2000, 2000};

bool allOff() {
  bool ok = true;
  for (uint8_t ch = 0; ch < 16; ++ch)
    if (pca.setPWM(ch, 0, 4096) != 0) ok = false;
  active = false;
  liveMode = false;
  rampUs = 2;
  presetRate = 5;
  for (uint8_t ch = 0; ch < 3; ++ch) {
    currentUs[ch] = 0;
    targetUs[ch] = 1500;
  }
  return ok;
}

void fault() {
  allOff(); // Best effort: lost I2C can leave the PCA's previous pulses running.
  ready = false;
  Serial.println("FAULT: disconnect battery. Reset with servo power disconnected.");
}

bool writePulse(uint8_t ch, uint16_t us) {
  if (ch >= 3) return false;
  // Supported step envelope; these are pulse bounds, not calibrated angles.
  if (us < minimum[ch] || us > maximum[ch]) return false;
  const uint16_t ticks = (uint32_t(us) * 25UL + (prescale + 1) / 2) / (prescale + 1);
  return pca.setPWM(ch, 0, ticks) == 0;
}

void status() {
  Serial.printf("LEG ready=%d active=%d current_us=%u,%u,%u target_us=%u,%u,%u\n",
    ready, active, currentUs[0], currentUs[1], currentUs[2],
    targetUs[0], targetUs[1], targetUs[2]);
}

void execute(const char *cmd) {
  if (!strcmp(cmd, "LIMITS")) { Serial.printf("LIMITS min=%u,%u,%u max=%u,%u,%u\n", minimum[0],minimum[1],minimum[2],maximum[0],maximum[1],maximum[2]); return; }
  if (!strcmp(cmd, "STATUS")) { status(); return; }
  if (!ready) { Serial.println("Not ready. Disconnect battery and inspect wiring."); return; }
  if (!strcmp(cmd, "OFF")) {
    if (!allOff()) { fault(); return; }
    Serial.println("PWM off. Battery still supplies power; support the leg.");
    return;
  }
  const bool center = !strcmp(cmd, "CENTER");
  if (!strncmp(cmd, "J ", 2)) {
    int h, k, f, rate; char extra;
    if (sscanf(cmd, "J %4d %4d %4d %3d %c", &h, &k, &f, &rate, &extra) != 4
        || h < minimum[0] || h > maximum[0]
        || k < minimum[1] || k > maximum[1]
        || f < minimum[2] || f > maximum[2] || rate < 1 || rate > 100) {
      Serial.println("Live command rejected: pulse or speed outside limits."); return;
    }
    if (!active) { Serial.println("Send CENTER first."); return; }
    targetUs[0] = h; targetUs[1] = k; targetUs[2] = f;
    rampUs = rate; liveMode = true; lastCommand = millis();
    status(); return;
  }
  if (liveMode && !center) { Serial.println("Live command rejected: CENTER or OFF before presets."); return; }
  if (!strncmp(cmd,"STEP_RATE ",10)) {
    int rate; char extra;
    if(sscanf(cmd,"STEP_RATE %3d %c",&rate,&extra)!=1 || rate<5 || rate>100) {
      Serial.println("Step speed rejected: use 5..100."); return;
    }
    if(!active) { Serial.println("Send CENTER first."); return; }
    for(int ch=0;ch<3;++ch) if(currentUs[ch]!=targetUs[ch]) {
      Serial.println("Step speed rejected: wait for settled pose."); return;
    }
    presetRate=rate; lastCommand=millis(); status(); return;
  }
  if (center) { liveMode = false; rampUs = 5; }
  // Each step stage requires the previous commanded pose to have settled.
  // Direction assumptions: knee higher pulse lifts; foot higher pulse tucks.
  const char *stageNames[4] = {"STEP_LIFT", "STEP_FORWARD", "STEP_LOWER", "STEP_RETURN"};
  const uint16_t poses[5][3] = {
    {1500,1500,1500}, // Center only before the first cycle.
    {1500,2000,1238}, // User-selected extended lift pose.
    {1650,2000,1238}, // Forward while lifted.
    {1650,1850,1238}, // Lower 150 us, keeping foot extended.
    {1500,1850,1238}  // Return hip; next cycle lifts from here.
  };
  for (int stage=0; stage<4; ++stage) {
    if (strcmp(cmd,stageNames[stage])) continue;
    if (!active) { Serial.println("Send CENTER first."); return; }
    bool expected=true, returned=true;
    for(int ch=0;ch<3;++ch) {
      expected &= currentUs[ch]==poses[stage][ch] && targetUs[ch]==poses[stage][ch];
      returned &= currentUs[ch]==poses[4][ch] && targetUs[ch]==poses[4][ch];
    }
    if (!expected && !(stage==0 && returned)) {
      Serial.println("Step rejected: previous stage must be settled."); return;
    }
    rampUs=presetRate; // 250..5000 us/s, chosen before a run.
    for(int ch=0;ch<3;++ch) targetUs[ch]=poses[stage+1][ch];
    lastCommand=millis(); status(); return;
  }
  int joint = -1;
  uint16_t requested = 1500;
  const char *low[3] = {"HIP_LOW", "KNEE_LOW", "FOOT_LOW"};
  const char *high[3] = {"HIP_HIGH", "KNEE_HIGH", "FOOT_HIGH"};
  for (int ch = 0; ch < 3; ++ch) {
    if (!strcmp(cmd, low[ch])) { joint = ch; requested = 1475; }
    if (!strcmp(cmd, high[ch])) { joint = ch; requested = 1525; }
  }
  if (!strcmp(cmd, "HIP_1400")) { joint = 0; requested = 1400; }
  if (!strcmp(cmd, "HIP_1600")) { joint = 0; requested = 1600; }
  if (!center && joint < 0) {
    Serial.println("Commands: STATUS CENTER OFF HIP_LOW HIP_HIGH HIP_1400 HIP_1600 KNEE_LOW KNEE_HIGH FOOT_LOW FOOT_HIGH STEP_LIFT STEP_FORWARD STEP_LOWER STEP_RETURN");
    return;
  }
  if (!active && !center) { Serial.println("Send CENTER first."); return; }
  // Require center between different joints: do not move two joints together.
  if (!center) {
    for (int ch = 0; ch < 3; ++ch) {
      if (ch != joint && (currentUs[ch] != 1500 || targetUs[ch] != 1500)) {
        Serial.println("Return to CENTER and wait before changing joints.");
        return;
      }
    }
  }
  for (uint8_t ch = 0; ch < 3; ++ch) targetUs[ch] = 1500;
  if (joint >= 0) { targetUs[joint] = requested; rampUs=2; }
  if (!active) {
    // Actual shaft positions are unknown: first center cannot be speed-limited.
    for (uint8_t ch = 0; ch < 3; ++ch) {
      if (!writePulse(ch, 1500)) { fault(); return; }
      currentUs[ch] = 1500;
    }
    active = true;
    lastStep = millis();
  }
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
  Serial.println("LEG BENCH READY: outputs off; channels 0=hip, 1=knee, 2=foot.");
  Serial.println("Five-second timeout. Calibration bounds: all joints 1000..2000 us; physical limits unverified.");
  status();
}

void loop() {
  const uint32_t now = millis();
  if (active && uint32_t(now - lastCommand) >= (liveMode ? 600UL : 5000UL)) {
    if (!allOff()) fault();
    else Serial.println("Command timeout: PWM off. Support the leg; CENTER required to restart.");
  }
  if (active && uint32_t(now - lastStep) >= 20) {
    lastStep = now;
    bool changed = false;
    for (uint8_t ch = 0; ch < 3; ++ch) {
      const int delta = int(targetUs[ch]) - int(currentUs[ch]);
      if (!delta) continue;
      const int step = delta > rampUs ? rampUs : (delta < -rampUs ? -rampUs : delta);
      const uint16_t next = int(currentUs[ch]) + step;
      if (!writePulse(ch, next)) { fault(); return; }
      currentUs[ch] = next;
      changed = true;
    }
    if (changed && currentUs[0] == targetUs[0] && currentUs[1] == targetUs[1]
        && currentUs[2] == targetUs[2]) { Serial.println("TARGET REACHED (commanded pulses only)"); status(); }
  }
  for (unsigned n = 0; n < 32 && Serial.available(); ++n) {
    const char c = char(Serial.read());
    if (c == '\r' || c == '\n') {
      if (overflow) Serial.println("Invalid/overlong command discarded.");
      else if (used) { commandBuffer[used] = '\0'; execute(commandBuffer); }
      used = 0;
      overflow = false;
    } else if (c < 32 || c > 126) overflow = true;
    else if (!overflow) {
      if (used < sizeof(commandBuffer) - 1) commandBuffer[used++] = c;
      else overflow = true;
    }
  }
  delay(1);
}
