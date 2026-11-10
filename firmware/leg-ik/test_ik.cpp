#include "leg_ik.h"
#include <cstdio>
#include <initializer_list>
#include <limits>

int failures = 0;
int cases = 0;
void check(bool condition, const char* message) {
    ++cases;
    if (!condition) { ++failures; std::printf("FAIL: %s\n", message); }
}
bool near(double a, double b, double tolerance = 1e-10) {
    return std::isfinite(a) && std::isfinite(b) && std::abs(a-b) <= tolerance;
}

int main() {
    using namespace hexapod;
    // Reference numbers independently evaluated from the saved MATLAB equations.
    // This is not a claim that a fresh MATLAB/Simscape run was performed.
    struct Reference { FootPosition target; SimscapeAngles expected; };
    const Reference refs[] = {
        {{150,0,-120}, {3.141592653589793,4.079056504274948,-1.367328031509075}},
        {{150,10,-120},{3.208160817365617,4.081563517855465,-1.363070171014608}},
        {{150,-10,-120},{3.075024489813969,4.081563517855465,-1.363070171014608}},
        {{160,0,-120}, {3.141592653589793,4.157597865132373,-1.235245146855255}},
        {{150,0,-110}, {3.141592653589793,3.927642158403938,-1.476443478314604}},
        {{200,0,-100}, {3.141592653589793,4.306396560245131,-0.794220462584471}}
    };
    for (const auto& ref : refs) {
        LegAngles a;
        check(solveLegIK(ref.target,a), "reference target accepted");
        const auto q = toSimscape(a);
        check(near(q.shoulder,ref.expected.shoulder) && near(q.hip,ref.expected.hip)
              && near(q.knee,ref.expected.knee), "MATLAB-equation reference match");
    }

    // Independent forward geometry: reconstruct requested foot positions.
    double largestError = 0;
    int reached = 0;
    for (int x=80; x<=230; x+=5) for (int y=-40; y<=40; y+=5)
        for (int z=-160; z<=-40; z+=5) {
            const FootPosition p = {double(x),double(y),double(z)};
            LegAngles a;
            if (!solveLegIK(p,a)) continue;
            ++reached;
            const double r = shoulderOffset + upperLength*std::cos(a.hip)
                             + lowerLength*std::cos(a.hip+a.knee);
            const double xf = r*std::cos(a.yaw), yf = r*std::sin(a.yaw);
            const double zf = hipHeight + upperLength*std::sin(a.hip)
                              + lowerLength*std::sin(a.hip+a.knee);
            const double error = std::hypot(std::hypot(xf-p.x,yf-p.y),zf-p.z);
            if (error > largestError) largestError = error;
            check(error < 1e-8, "IK/FK position round trip");
        }

    const double nan = std::numeric_limits<double>::quiet_NaN();
    const double inf = std::numeric_limits<double>::infinity();
    for (FootPosition p : {FootPosition{1000,0,-120}, FootPosition{32,0,hipHeight},
                          FootPosition{0,0,-120}, FootPosition{nan,0,-120},
                          FootPosition{150,inf,-120}, FootPosition{150,0,nan},
                          FootPosition{1e308,1e308,1e308}}) {
        LegAngles a = {1,2,3};
        check(!solveLegIK(p,a), "invalid target rejected");
        check(std::isnan(a.yaw) && std::isnan(a.hip) && std::isnan(a.knee),
              "failure clears stale output");
    }
    for (double radius : {upperLength+lowerLength, lowerLength-upperLength}) {
        LegAngles a;
        check(solveLegIK({shoulderOffset+radius,0,hipHeight},a), "reach boundary accepted");
    }
    std::printf("%d checks; %d failures; %d reachable grid points; max position error %.3g mm\n",
                cases,failures,reached,largestError);
    return failures == 0 ? 0 : 1;
}
