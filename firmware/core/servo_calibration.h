#pragma once
#include "controller.h"

namespace control {
struct ServoCalibration {
    bool calibrated=false;
    int board=0,channel=0;
    double referenceRad=0,referenceUs=1500,usPerRad=0,minRad=0,maxRad=0,minUs=1000,maxUs=2000;
};
// Intentionally unusable until each servo is measured. No guessed sign or range.
inline std::array<ServoCalibration,18> uncalibratedMap(){
    std::array<ServoCalibration,18> result{};
    for(int i=0;i<18;++i){result[i].board=i/9;result[i].channel=i%9;}
    return result;
}
inline bool pulseFor(double angle,const ServoCalibration& c,double& pulse){
    if(!c.calibrated || !std::isfinite(angle) || !std::isfinite(c.referenceRad)||!std::isfinite(c.referenceUs)
       || !std::isfinite(c.usPerRad)||c.usPerRad==0 || !std::isfinite(c.minRad)||!std::isfinite(c.maxRad)
       || !std::isfinite(c.minUs)||!std::isfinite(c.maxUs) || c.minRad>=c.maxRad
       || c.minUs<500 || c.maxUs>2500 || c.minUs>=c.maxUs || angle<c.minRad || angle>c.maxRad
       || c.board<0||c.board>1||c.channel<0||c.channel>15)return false;
    pulse=c.referenceUs+(angle-c.referenceRad)*c.usPerRad;
    return std::isfinite(pulse)&&pulse>=c.minUs&&pulse<=c.maxUs;
}
inline bool posePulses(const Controller& r,const std::array<ServoCalibration,18>& calibration,std::array<double,18>& pulses){
    bool used[2][16]{};
    std::array<double,18> next{};
    for(int i=0;i<18;++i){
        const auto& q=r.feet[i/3].angles;const double angles[3]={q.yaw,q.hip,q.knee};
        const auto& c=calibration[i];
        if(!pulseFor(angles[i%3],c,next[i]))return false;
        if(used[c.board][c.channel])return false;
        used[c.board][c.channel]=true;
    }
    pulses=next;return true;
}
} // namespace control
