#include <Arduino.h>
#include <Wire.h>

// USB-only bench lesson. Keep servos and V+ disconnected.
// Tie each PCA9685 OE pin to 3V3 to hold its outputs disabled.
// Address probes send no register data and never configure PWM outputs.
constexpr int sdaPin = 21;
constexpr int sclPin = 22;
bool busReady = false;

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\nHexapod USB-only I2C check: SDA=21, SCL=22.");
    Serial.println("Keep V+ and all servo cables disconnected. OE -> 3V3.");
    busReady = Wire.begin(sdaPin, sclPin, 100000);
    Wire.setTimeOut(50);
    if (!busReady) Serial.println("I2C could not start.");
}

void loop() {
    if (!busReady) { delay(1000); return; }
    unsigned found = 0;
    bool board40 = false, board41 = false;
    Serial.println("\nScanning addresses...");
    for (uint8_t address = 8; address < 120; ++address) {
        Wire.beginTransmission(address);
        const uint8_t result = Wire.endTransmission();
        if (result == 0) {
            ++found;
            board40 |= address == 0x40;
            board41 |= address == 0x41;
            Serial.printf("Acknowledgement at 0x%02X\n", address);
        } else if (result != 2) {
            Serial.printf("Bus error %u at 0x%02X; check wiring.\n", result, address);
        }
    }
    Serial.printf("Expected addresses: 0x40 %s; 0x41 %s.\n",
                  board40 ? "responding" : "not found", board41 ? "responding" : "not found");
    if (!found) Serial.println("No acknowledgements. Check VCC, GND, SDA, and SCL with USB unplugged.");
    Serial.println("An ACK is not device identification or a servo test. Test each board alone first.");
    delay(3000);
}
