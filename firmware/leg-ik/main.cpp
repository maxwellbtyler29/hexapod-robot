#include "leg_ik.h"
#include <cstdio>
#include <cstdlib>

int main(int argc, char** argv) {
    // First exercise: change only this target, rebuild, and compare outputs.
    hexapod::FootPosition target = {150.0, 0.0, -120.0};

    // Optional command-line target: ik_demo.exe 150 10 -120
    if (argc != 1 && argc != 4) {
        std::fprintf(stderr, "Usage: ik_demo.exe [x_mm y_mm z_mm]\n");
        return 2;
    }
    if (argc == 4) {
        double values[3];
        for (int i = 0; i < 3; ++i) {
            char* end = nullptr;
            values[i] = std::strtod(argv[i+1], &end);
            if (end == argv[i+1] || *end != '\0') {
                std::fprintf(stderr, "Each coordinate must be a number.\n");
                return 2;
            }
        }
        target = {values[0], values[1], values[2]};
    }

    hexapod::LegAngles angles;
    if (!hexapod::solveLegIK(target, angles)) {
        std::fprintf(stderr, "Rejected: invalid or unreachable target. No commands produced.\n");
        return 1;
    }

    const auto sim = hexapod::toSimscape(angles);
    std::printf("Foot target (mm): [%.3f, %.3f, %.3f]\n", target.x, target.y, target.z);
    std::printf("Geometry (rad):   [%.9f, %.9f, %.9f]\n", angles.yaw, angles.hip, angles.knee);
    std::printf("Simscape (rad):   [%.9f, %.9f, %.9f]\n", sim.shoulder, sim.hip, sim.knee);
    std::printf("Simscape (deg):   [%.6f, %.6f, %.6f]\n",
                hexapod::degrees(sim.shoulder), hexapod::degrees(sim.hip), hexapod::degrees(sim.knee));
    std::puts("Geometry-only lesson: no Wi-Fi, GPIO, PWM, or servo output.");
    return 0;
}
