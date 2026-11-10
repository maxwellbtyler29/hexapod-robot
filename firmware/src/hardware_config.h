#pragma once
#include "../core/servo_calibration.h"
namespace hardware {
// Dry-run environment (platformio env esp32dev, src/main.cpp) only.
// The walking program is src/six_leg_setup.cpp and does not use these flags.
constexpr bool enableServoOutput=false;
constexpr bool assemblyGeometryVerified=false;
constexpr int sdaPin=21,sclPin=22;
constexpr uint8_t addresses[2]={0x40,0x41};
// Proposed wiring: board 0 channels 0..8 = LF/LM/LB; board 1 0..8 = RF/RM/RB.
// Each leg is shoulder, hip, knee. Confirm actual wiring before calibration.
inline std::array<control::ServoCalibration,18> calibration(){return control::uncalibratedMap();}
}
