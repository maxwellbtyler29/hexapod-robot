#pragma once
#include "controller.h"
#include <sstream>
#include <iomanip>

namespace control {
inline void jsonVec(std::ostringstream& s,Vec p){s<<'['<<p.x<<','<<p.y<<','<<p.z<<']';}
inline std::string telemetry(const Controller& c,bool accepted=true,const char* transport="desktop"){
    std::ostringstream s;s<<std::fixed<<std::setprecision(3)<<std::boolalpha;
    s<<"{\"accepted\":"<<accepted<<",\"transport\":\""<<transport<<"\",\"source\":\"commanded simulation\",\"hardwareOutput\":false,\"geometryVerified\":false"
     <<",\"time\":"<<c.now<<",\"enabled\":"<<c.enabled<<",\"fault\":"<<c.fault<<",\"transition\":"<<c.transition<<",\"sleeping\":"<<c.sleeping<<",\"workspaceLimited\":"<<c.workspaceLimited
     <<",\"mode\":"<<int(c.mode)<<",\"pendingMode\":"<<int(c.pending)<<",\"owner\":"<<c.owner<<",\"seq\":"<<c.lastSeq
     <<",\"selectedLeg\":"<<c.selected<<",\"manualFree\":"<<c.manualFree<<",\"routine\":"<<c.routine<<",\"queuedRoutine\":"<<c.queuedRoutine
     <<",\"message\":\""<<c.message<<"\",\"ageMs\":"<<std::max(0.0,c.now-c.lastSeen)*1000
     <<",\"velocity\":["<<c.vx<<','<<c.vy<<','<<c.wz<<"],\"body\":{\"position\":";
    jsonVec(s,c.body.p);s<<",\"angles\":["<<c.body.roll<<','<<c.body.pitch<<','<<c.body.yaw<<"]},\"legs\":[";
    for(int i=0;i<6;++i){
        if(i)s<<',';const auto& f=c.feet[i];const auto p=targetLocal(i,f.world,c.body);
        const bool gesture=c.routine==3||c.routine==4||(c.routine==5&&(i==0||i==3));
        s<<"{\"name\":\""<<names[i]<<"\",\"phase\":\""<<(f.swing?"swing":(gesture?"gesture":(c.mode==Mode::Climber&&i==c.selected&&c.manualFree?"manual":"stance")))
         <<"\",\"world\":";jsonVec(s,f.world);s<<",\"local\":";jsonVec(s,p);
        s<<",\"angles\":["<<f.angles.yaw<<','<<f.angles.hip<<','<<f.angles.knee<<"],\"links\":[";
        const auto pts=links(i,f.angles,c.body);
        for(int j=0;j<4;++j){if(j)s<<',';jsonVec(s,pts[j]);}s<<"]}";
    }
    s<<"]}";return s.str();
}
} // namespace control
