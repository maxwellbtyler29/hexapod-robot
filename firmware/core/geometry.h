#pragma once
#include "../leg-ik/leg_ik.h"
#include <array>
#include <algorithm>

namespace control {
using hexapod::pi;
struct Vec { double x=0,y=0,z=0; Vec()=default; Vec(double X,double Y,double Z):x(X),y(Y),z(Z){} };
inline Vec operator+(Vec a,Vec b){return {a.x+b.x,a.y+b.y,a.z+b.z};}
inline Vec operator-(Vec a,Vec b){return {a.x-b.x,a.y-b.y,a.z-b.z};}
inline Vec operator*(Vec a,double s){return {a.x*s,a.y*s,a.z*s};}
inline double clamp(double x,double a,double b){return std::max(a,std::min(b,x));}
inline double approach(double a,double b,double amount){return a+clamp(b-a,-amount,amount);}
inline double smooth(double u){u=clamp(u,0,1);return u*u*u*(10+u*(-15+6*u));}
inline Vec mix(Vec a,Vec b,double u){return a*(1-u)+b*u;}
struct Pose {Vec p{0,0,120}; double roll=0,pitch=0,yaw=0;};
inline Vec rotate(Vec p,const Pose& b) {
    const double cr=std::cos(b.roll),sr=std::sin(b.roll),cp=std::cos(b.pitch),sp=std::sin(b.pitch),cy=std::cos(b.yaw),sy=std::sin(b.yaw);
    const Vec a{p.x,cr*p.y-sr*p.z,sr*p.y+cr*p.z};
    const Vec c{cp*a.x+sp*a.z,a.y,-sp*a.x+cp*a.z};
    return {cy*c.x-sy*c.y,sy*c.x+cy*c.y,c.z};
}
inline Vec unrotate(Vec p,const Pose& b) {
    const double cr=std::cos(b.roll),sr=std::sin(b.roll),cp=std::cos(b.pitch),sp=std::sin(b.pitch),cy=std::cos(b.yaw),sy=std::sin(b.yaw);
    const Vec a{cy*p.x+sy*p.y,-sy*p.x+cy*p.y,p.z};
    const Vec c{cp*a.x-sp*a.z,a.y,sp*a.x+cp*a.z};
    return {c.x,cr*c.y+sr*c.z,-sr*c.y+cr*c.z};
}
constexpr const char* names[6]={"LF","LM","LB","RF","RM","RB"};
constexpr bool groupB[6]={false,true,false,true,false,true};
constexpr double heading[6]={50,90,130,-50,-90,-130};
// PROVISIONAL preview geometry. Verify shoulder origins and lateral basis in CAD
// before physical output. Forward components match the saved MATLAB headings.
inline Vec shoulder(int i) {
    const Vec s[6]={{65,50,0},{0,65,0},{-65,50,0},{65,-50,0},{0,-65,0},{-65,-50,0}};
    return s[i];
}
// Explicit coordinate basis, including the imported leg-coordinate handedness.
// Do not mistake this for a physical mounting yaw or a servo calibration.
inline Vec localVectorToBody(int i,Vec p) {
    const double a=hexapod::radians(heading[i]),c=std::cos(a),s=std::sin(a);
    return {c*p.x+s*p.y,s*p.x-c*p.y,p.z};
}
inline Vec bodyVectorToLocal(int i,Vec p){return localVectorToBody(i,p);}
inline Vec neutralBody(int i){return shoulder(i)+localVectorToBody(i,{150,0,-120});}
inline Vec toWorld(Vec p,const Pose& b){return b.p+rotate(p,b);}
inline Vec toBody(Vec p,const Pose& b){return unrotate(p-b.p,b);}
inline Vec targetLocal(int i,Vec world,const Pose& b){return bodyVectorToLocal(i,toBody(world,b)-shoulder(i));}
inline bool ik(Vec p,hexapod::LegAngles& a){return hexapod::solveLegIK({p.x,p.y,p.z},a);}
inline std::array<Vec,4> links(int i,const hexapod::LegAngles& q,const Pose& body) {
    const double c=std::cos(q.yaw),s=std::sin(q.yaw);
    const Vec h{31.8*c,31.8*s,-15.15};
    const Vec k=h+Vec{60*std::cos(q.hip)*c,60*std::cos(q.hip)*s,60*std::sin(q.hip)};
    const Vec f=k+Vec{156.33*std::cos(q.hip+q.knee)*c,156.33*std::cos(q.hip+q.knee)*s,156.33*std::sin(q.hip+q.knee)};
    return {{toWorld(shoulder(i),body),toWorld(shoulder(i)+localVectorToBody(i,h),body),
        toWorld(shoulder(i)+localVectorToBody(i,k),body),toWorld(shoulder(i)+localVectorToBody(i,f),body)}};
}
} // namespace control
