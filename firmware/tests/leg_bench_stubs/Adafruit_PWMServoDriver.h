#pragma once
#include <vector>
#include "Wire.h"
struct Write { unsigned ch,on,off; };
class Adafruit_PWMServoDriver {
public:
  std::vector<Write> writes;
  int failChannel=-1;
  bool present=true;
  Adafruit_PWMServoDriver(int,TwoWire&) {}
  bool begin() { return present; }
  void setPWMFreq(float) {}
  uint8_t readPrescale() { return 121; }
  uint8_t setPWM(uint8_t ch,uint16_t on,uint16_t off) {
    writes.push_back({ch,on,off});
    if (ch==failChannel) { failChannel=-1; return 1; }
    return 0;
  }
};
