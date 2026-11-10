#pragma once
#include <cmath>
#include <limits>

namespace hexapod {

constexpr double pi = 3.14159265358979323846;
constexpr double radians(double degrees) { return degrees * pi / 180.0; }
constexpr double degrees(double angle) { return angle * 180.0 / pi; }

// Millimetres, measured from the shoulder horn in this leg's local frame.
// x: outward; y: positive shoulder sweep; z: upward.
struct FootPosition {
    double x;
    double y;
    double z;
};

// Geometric angles in radians. These are NOT servo pulse commands.
struct LegAngles {
    double yaw;    // psi: shoulder sweep
    double hip;    // phi: upper-link elevation above horizontal
    double knee;   // delta: lower-link angle relative to upper link
};

// Values used only for comparison with the existing Simscape model.
struct SimscapeAngles {
    double shoulder;
    double hip;
    double knee;
};

// Geometry copied from the user's verified MATLAB IK.
constexpr double upperLength = 60.00;
constexpr double lowerLength = 156.33;
constexpr double shoulderOffset = 31.80;
constexpr double hipHeight = -15.15;

// Returns false for invalid/unreachable targets. Caller MUST check the result.
// On failure, all output angles are NaN, so stale angles cannot look valid.
// Success means geometric reachability only: joint limits/collisions and
// physical servo calibration are separate, later checks.
inline bool solveLegIK(const FootPosition& foot, LegAngles& out) {
    const double invalid = std::numeric_limits<double>::quiet_NaN();
    out = {invalid, invalid, invalid};

    if (!std::isfinite(foot.x) || !std::isfinite(foot.y) ||
        !std::isfinite(foot.z)) {
        return false;
    }

    const double d = std::hypot(foot.x, foot.y) - shoulderOffset;
    const double v = foot.z - hipHeight;
    if (!(d > 0.0)) {
        return false;
    }

    double D = (d*d + v*v - upperLength*upperLength - lowerLength*lowerLength)
             / (2.0 * upperLength * lowerLength);

    // Match MATLAB: reject real reach errors; clamp only tiny roundoff.
    constexpr double tolerance = 1e-9;
    if (!std::isfinite(D) || D < -1.0-tolerance || D > 1.0+tolerance) {
        return false;
    }
    if (D < -1.0) D = -1.0;
    if (D >  1.0) D =  1.0;

    const double delta = -std::acos(D);  // Same branch as MATLAB
    const double phi = std::atan2(v, d)
        - std::atan2(lowerLength*std::sin(delta),
                     upperLength + lowerLength*std::cos(delta));

    out = {std::atan2(foot.y, foot.x), phi, delta};
    return true;
}

// Reproduce the CAD model's joint zeros/signs for numerical comparison.
// Physical servos will have their OWN calibration; do not send these directly.
inline SimscapeAngles toSimscape(const LegAngles& angles) {
    constexpr double phi0 = radians(-0.43);
    constexpr double delta0 = radians(-21.09);
    return {pi + angles.yaw,
            1.5*pi - (angles.hip - phi0),
            angles.knee - delta0};
}

} // namespace hexapod
