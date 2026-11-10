#pragma once
#include <Wire.h>
inline bool pcaPresent=true;
struct Adafruit_PWMServoDriver{
 Adafruit_PWMServoDriver(uint8_t,TwoWire&){}
 bool begin(){return pcaPresent;} void setPWMFreq(float){} uint8_t readPrescale(){return 121;}
};
